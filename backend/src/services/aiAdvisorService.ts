import prisma from '../config/prisma';
import { analyticsTools } from './metrics/analyticsService';
import { writeAudit } from './auditService';

type ToolName = keyof typeof analyticsTools;

const TOOL_DESCRIPTIONS: Record<string, string> = {
  enrolmentMetrics: 'Active students, starts/ends, churn and trial conversion',
  programmePerformance: 'Programme enrolment, trials, capacity and utilization',
  staffingVersusDemand: 'Scheduled labour versus demand and estimated savings',
  expenseRollup: 'Month expenses and recurring subscriptions',
  cashOutlook: 'Cash balance, monthly in/out and runway',
  targetProgress: 'Academic/fiscal targets versus actuals',
  executiveDashboard: 'Full executive snapshot',
};

function pickTools(question: string): ToolName[] {
  const q = question.toLowerCase();
  const tools: ToolName[] = [];
  if (/student|enrol|churn|trial|convert|retention/.test(q)) {
    tools.push('enrolmentMetrics');
  }
  if (/programme|program|class|capacity|utiliz/.test(q)) {
    tools.push('programmePerformance');
  }
  if (/staff|labour|labor|instructor|schedule|payroll/.test(q)) {
    tools.push('staffingVersusDemand');
  }
  if (/expense|subscription|vendor|software|cost/.test(q)) {
    tools.push('expenseRollup');
  }
  if (/cash|runway|burn|money|revenue/.test(q)) {
    tools.push('cashOutlook');
  }
  if (/target|goal|on track|milestone/.test(q)) {
    tools.push('targetProgress');
  }
  if (tools.length === 0) tools.push('executiveDashboard');
  return tools;
}

function formatToolResult(name: string, data: unknown): string {
  return `### ${name}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

async function callProvider(params: {
  system: string;
  user: string;
}): Promise<{
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsdCents: number;
}> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openaiKey) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI error: ${errText}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    // rough metering: $0.15 / $0.60 per 1M tokens for mini-class models
    const estimatedCostUsdCents = Math.max(
      1,
      Math.round((inputTokens * 0.15 + outputTokens * 0.6) / 10000)
    );
    return {
      text: json.choices?.[0]?.message?.content || 'No response',
      provider: 'openai',
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsdCents,
    };
  }

  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${params.system}\n\n${params.user}` }],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini error: ${errText}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };
    const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      text:
        json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
        'No response',
      provider: 'gemini',
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsdCents: Math.max(
        1,
        Math.round((inputTokens + outputTokens) / 10000)
      ),
    };
  }

  // Offline deterministic fallback when no provider keys are configured
  return {
    text:
      'AI provider keys are not configured. Here is a deterministic summary of the structured metrics for your question:\n\n' +
      params.user.slice(0, 4000),
    provider: 'local',
    model: 'deterministic-fallback',
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsdCents: 0,
  };
}

export async function askAdvisor(params: {
  organizationId: string;
  userId: string;
  question: string;
  conversationId?: string;
}) {
  const tools = pickTools(params.question);
  const toolResults: Record<string, unknown> = {};
  for (const name of tools) {
    const fn = analyticsTools[name];
    // All Phase 1 tools take organizationId as first arg
    toolResults[name] = await (fn as (orgId: string) => Promise<unknown>)(
      params.organizationId
    );
  }

  const evidenceBlock = Object.entries(toolResults)
    .map(([name, data]) => formatToolResult(name, data))
    .join('\n\n');

  const system = `You are the Business Advisor for an after-school / tutoring / enrichment centre.
Use ONLY the structured analytics evidence provided. Do not invent numbers.
Speak plainly to the owner. Prefer dollars, students, capacity, and next actions.
Canadian English spelling. If evidence is incomplete, say what data is missing.
Never claim certainty for forecasts.`;

  const userPrompt = `Question: ${params.question}\n\nAvailable tools used: ${tools
    .map((t) => `${t} (${TOOL_DESCRIPTIONS[t]})`)
    .join(', ')}\n\nEvidence:\n${evidenceBlock}`;

  const result = await callProvider({ system, user: userPrompt });

  let conversationId = params.conversationId;
  if (!conversationId) {
    const convo = await prisma.aiConversation.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        title: params.question.slice(0, 80),
      },
    });
    conversationId = convo.id;
  }

  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: 'user',
      content: params.question,
    },
  });
  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: 'assistant',
      content: result.text,
      toolCallsJson: { tools, privacyPolicy: 'no_training_default' },
    },
  });

  await prisma.aiUsageEvent.create({
    data: {
      organizationId: params.organizationId,
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsdCents: result.estimatedCostUsdCents,
      taskType: 'advisor_chat',
      privacyPolicy: 'tenant_isolated_no_platform_browse',
    },
  });

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: 'ai.advisor_chat',
    resourceType: 'AiConversation',
    resourceId: conversationId,
    metadata: {
      provider: result.provider,
      model: result.model,
      tools,
      // Do not log raw prompt/response content
    },
  });

  return {
    conversationId,
    answer: result.text,
    toolsUsed: tools,
    provider: result.provider,
    model: result.model,
  };
}
