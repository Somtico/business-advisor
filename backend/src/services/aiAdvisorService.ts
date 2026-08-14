import prisma from '../config/prisma';
import { analyticsTools } from './metrics/analyticsService';
import { pricingGuidance } from './pricingService';
import { ADVICE_DISCLAIMER } from '../config/legal';
import { writeAudit } from './auditService';

/** Deterministic tool surface: analytics plus pricing guidance. */
const advisorTools = { ...analyticsTools, pricingGuidance };

type ToolName = keyof typeof advisorTools;

const TOOL_DESCRIPTIONS: Record<string, string> = {
  enrolmentMetrics: 'Active students, starts/ends, churn and trial conversion',
  programmePerformance: 'Programme enrolment, trials, capacity and utilization',
  staffingVersusDemand: 'Scheduled labour versus demand and estimated savings',
  expenseRollup: 'Month expenses and recurring subscriptions',
  cashOutlook: 'Cash balance, monthly in/out and runway',
  targetProgress: 'Academic/fiscal targets versus actuals',
  executiveDashboard: 'Full executive snapshot',
  advisorImpact:
    'Verified money saved/earned from completed advice, pending estimates and pipeline',
  pricingGuidance:
    'Per-programme cost floor, recommended price and verdict; reports missing data instead of guessing',
};

/** Latest high-capability defaults; override with OPENAI_MODEL / ANTHROPIC_MODEL / GEMINI_MODEL */
const DEFAULT_OPENAI_MODEL = 'gpt-5.6';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

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
  if (/impact|saved|savings|earned|worth|roi|value|helped|paid off/.test(q)) {
    tools.push('advisorImpact');
  }
  if (/pric|charge|fee|tuition|rate|sell|afford|floor|margin|discount/.test(q)) {
    tools.push('pricingGuidance');
  }
  if (tools.length === 0) tools.push('executiveDashboard');
  return tools;
}

function formatToolResult(name: string, data: unknown): string {
  return `### ${name}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

type ProviderResult = {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsdCents: number;
  privacyPolicy: string;
};

async function callOpenAI(
  system: string,
  user: string
): Promise<ProviderResult | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const body: Record<string, unknown> = {
    model,
    // Do not store completions for distillation/evals (also forced false under OpenAI ZDR)
    store: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  // Older chat models accept temperature; some reasoning models reject it
  if (!/^o\d/i.test(model) && !/gpt-5/i.test(model)) {
    body.temperature = 0.2;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
  return {
    text: json.choices?.[0]?.message?.content || 'No response',
    provider: 'openai',
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsdCents: Math.max(
      1,
      Math.round((inputTokens * 2 + outputTokens * 10) / 10000)
    ),
    privacyPolicy: 'openai_store_false_api_no_training_default',
  };
}

async function callAnthropic(
  system: string,
  user: string
): Promise<ProviderResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: user }],
    // Absolute highest capability where supported (Fable 5 / Opus 5 / Sonnet 5)
    output_config: {
      effort: process.env.ANTHROPIC_EFFORT || 'max',
    },
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // If effort/output_config is rejected on a model, retry without it
  if (!res.ok) {
    const errText = await res.text();
    if (/effort|output_config|thinking/i.test(errText)) {
      const retry = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!retry.ok) {
        throw new Error(`Anthropic error: ${await retry.text()}`);
      }
      return parseAnthropicResponse(
        (await retry.json()) as Parameters<typeof parseAnthropicResponse>[0],
        model
      );
    }
    throw new Error(`Anthropic error: ${errText}`);
  }

  return parseAnthropicResponse(
    (await res.json()) as Parameters<typeof parseAnthropicResponse>[0],
    model
  );
}

function parseAnthropicResponse(
  json: {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  },
  model: string
): ProviderResult {
  const text =
    (json.content || [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text || '')
      .join('\n') || 'No response';
  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;
  return {
    text,
    provider: 'anthropic',
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsdCents: Math.max(
      1,
      Math.round((inputTokens * 10 + outputTokens * 50) / 10000)
    ),
    privacyPolicy:
      'anthropic_api_no_training_default_prefer_zdr_eligible_models',
  };
}

async function callGemini(
  system: string,
  user: string
): Promise<ProviderResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        // Prefer deeper reasoning when the model supports thinking budgets
        thinkingConfig: {
          thinkingBudget: Number(process.env.GEMINI_THINKING_BUDGET || 8192),
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Retry without thinkingConfig if unsupported
    if (/thinking|Thinking/i.test(errText)) {
      const retry = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!retry.ok) throw new Error(`Gemini error: ${await retry.text()}`);
      return parseGeminiResponse(
        (await retry.json()) as Parameters<typeof parseGeminiResponse>[0],
        model
      );
    }
    throw new Error(`Gemini error: ${errText}`);
  }

  return parseGeminiResponse(
    (await res.json()) as Parameters<typeof parseGeminiResponse>[0],
    model
  );
}

function parseGeminiResponse(
  json: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  },
  model: string
): ProviderResult {
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
      Math.round((inputTokens * 1.25 + outputTokens * 10) / 10000)
    ),
    privacyPolicy: 'gemini_paid_quota_no_training_zdr_org_optional',
  };
}

/**
 * Provider order: OpenAI → Anthropic (Claude) → Gemini → local fallback.
 * Only one provider is called per question.
 */
async function callProvider(params: {
  system: string;
  user: string;
}): Promise<ProviderResult> {
  const errors: string[] = [];

  try {
    const openai = await callOpenAI(params.system, params.user);
    if (openai) return openai;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'OpenAI failed');
  }

  try {
    const anthropic = await callAnthropic(params.system, params.user);
    if (anthropic) return anthropic;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Anthropic failed');
  }

  try {
    const gemini = await callGemini(params.system, params.user);
    if (gemini) return gemini;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Gemini failed');
  }

  const detail = errors.length ? `\n\nProvider errors:\n- ${errors.join('\n- ')}` : '';
  return {
    text:
      'AI provider keys are not configured (or all providers failed). Here is a deterministic summary of the structured metrics for your question:\n\n' +
      params.user.slice(0, 4000) +
      detail,
    provider: 'local',
    model: 'deterministic-fallback',
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsdCents: 0,
    privacyPolicy: 'local_no_external_call',
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
    const fn = advisorTools[name];
    toolResults[name] = await (fn as (orgId: string) => Promise<unknown>)(
      params.organizationId
    );
  }

  const evidenceBlock = Object.entries(toolResults)
    .map(([name, data]) => formatToolResult(name, data))
    .join('\n\n');

  const system = `You are the Business Advisor for an after-school / tutoring / enrichment centre.

NON-NEGOTIABLE EVIDENCE RULES:
1. Use ONLY the structured analytics evidence provided in this message. Every number, name, and date in your answer must appear in, or be arithmetic on, that evidence.
2. NEVER guess, estimate, extrapolate, or invent figures, records, or facts that are not in the evidence. A wrong number is worse than no number.
3. If the evidence is missing, empty, or insufficient to answer, your answer IS the request for data: state exactly what is missing and where to add it (Programmes & Students, Staffing, Expenses & Subscriptions, Targets & Forecasts, Pricing Advisor, CSV import, or the portal connector).
4. If a tool result has status INSUFFICIENT_DATA or a missingData list, relay those items verbatim as the required next step. Do not fill the gaps yourself.
5. Projections may only restate the scenario figures present in the evidence, labelled as scenarios, never as certainties.
6. Do not provide legal, tax, accounting, or investment advice; frame everything as operational information the owner must verify and decide on.

Speak plainly to the owner. Prefer dollars, students, capacity, and next actions.
Canadian English spelling.`;

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
      toolCallsJson: {
        tools,
        privacyPolicy: result.privacyPolicy,
      },
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
      privacyPolicy: result.privacyPolicy,
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
      privacyPolicy: result.privacyPolicy,
    },
  });

  return {
    conversationId,
    answer: result.text,
    toolsUsed: tools,
    provider: result.provider,
    model: result.model,
    privacyPolicy: result.privacyPolicy,
    disclaimer: ADVICE_DISCLAIMER,
  };
}
