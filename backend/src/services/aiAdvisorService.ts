import prisma from '../config/prisma';
import { analyticsTools } from './metrics/analyticsService';
import { enrolmentGuidance } from './enrolmentService';
import { organizationMemory } from './organizationMemoryService';
import { pricingGuidance } from './pricingService';
import { ADVICE_DISCLAIMER } from '../config/legal';
import { writeAudit } from './auditService';

/** Deterministic tool surface: analytics plus pricing guidance. */
const advisorTools = {
  ...analyticsTools,
  pricingGuidance,
  enrolmentGuidance,
  organizationMemory,
};

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
    'Per-programme cost floor, recommended price and verdict (Below Cost, Below Target, On Track, or Above Target price test); reports missing data instead of guessing. A price test is a time-boxed experiment that still clears the cost floor — never a claim that price caused empty seats, and never based on household income.',
  enrolmentGuidance:
    'Enrolment leak diagnosis (full room, conversion, churn, velocity, spare seats), cheap next steps, whether a small paid test is on the table, what the owner already tried and the results they recorded, and aggregate de-identified peer patterns only when at least 8 similar reports exist. Asks for tried-and-results when that log is empty. Never invents a marketing plan or promised student counts.',
  organizationMemory:
    'This centre\'s last 90 days of actions, verified impact, and enrolment tactics already tried. Cite these before suggesting a repeat. Do not recommend a tactic whose recorded outcome here was NO_EFFECT or HURT unless the owner asks.',
  instructorCostPerSeatHour:
    'Instructor labour cost per learner-hour from this week\'s scheduled sessions. Reports missing data instead of guessing.',
  householdLtv:
    'Average and median monthly tuition per household (or per student when no household is linked). Annualized figure is 12 × current list price, not a predicted lifetime.',
  trialToPaidByProgramme:
    'Trial-to-paid conversion per programme from recorded engagements. A conversion is a person with both a trial and a later paid enrolment on the same programme.',
  cashSafeTestSize:
    'Largest weekly paid-test spend this centre\'s recorded cash can absorb. A spend cap, not a forecast of new students.',
};

/** Latest high-capability defaults; override with ANTHROPIC_MODEL / OPENAI_MODEL */
const DEFAULT_OPENAI_MODEL = 'gpt-5.6';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

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
  if (
    /enrol|fill seat|waitlist|referral|marketing|ads|conversion|trial|grow|more student|fewer student|empty (room|seat)/.test(
      q
    )
  ) {
    tools.push('enrolmentGuidance');
  }
  if (/seat.?hour|learner.?hour|cost per seat|labour efficiency|labor efficiency/.test(q)) {
    tools.push('instructorCostPerSeatHour');
  }
  if (/ltv|lifetime|household|family value|per family|per household/.test(q)) {
    tools.push('householdLtv');
  }
  if (/which programme|which program|converts|trial.to.paid|by programme|by program/.test(q)) {
    tools.push('trialToPaidByProgramme');
  }
  if (/ad spend|how much can i (spend|afford)|paid test|spend cap|cash.safe/.test(q)) {
    tools.push('cashSafeTestSize');
  }
  if (tools.length === 0) tools.push('executiveDashboard');
  if (!tools.includes('organizationMemory')) {
    tools.unshift('organizationMemory');
  }
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

function deterministicFallbackText(toolResults: Record<string, unknown>): string {
  const lines = [
    'Chuk could not reach Claude or OpenAI. Open Command Centre, Enrolment Advisor, and Pricing Advisor for the full picture. Deterministic read of your records:',
    '',
  ];
  const memory = toolResults.organizationMemory as
    | { verifiedImpactCents?: number; tacticsTried?: Array<{ label: string; outcome: string }> }
    | undefined;
  if (memory) {
    lines.push(
      `Verified impact on file: $${((memory.verifiedImpactCents ?? 0) / 100).toFixed(2)}.`
    );
    const last = memory.tacticsTried?.[0];
    if (last) {
      lines.push(`Last tactic recorded: ${last.label} (${last.outcome}).`);
    }
  }
  const enrolment = toolResults.enrolmentGuidance as
    | { leakLabel?: string; missingData?: string[] }
    | undefined;
  if (enrolment?.leakLabel) {
    lines.push(`Enrolment diagnosis: ${enrolment.leakLabel}.`);
    if (enrolment.missingData?.length) {
      lines.push(`Still needed: ${enrolment.missingData.join(' ')}`);
    }
  }
  const pricing = toolResults.pricingGuidance as
    | { programmes?: Array<{ name: string; verdict: string | null; status: string }> }
    | undefined;
  if (pricing?.programmes?.length) {
    for (const p of pricing.programmes.slice(0, 6)) {
      lines.push(
        `${p.name}: ${p.status === 'INSUFFICIENT_DATA' ? 'needs data' : p.verdict || 'ready'}.`
      );
    }
  }
  return lines.join('\n');
}

/**
 * Provider order: Anthropic (Claude) → OpenAI → local fallback.
 * Only one provider is called per question. Gemini is not used.
 */
async function callProvider(params: {
  system: string;
  user: string;
  toolResults: Record<string, unknown>;
}): Promise<ProviderResult> {
  try {
    const anthropic = await callAnthropic(params.system, params.user);
    if (anthropic) return anthropic;
  } catch {
    // Fall through to OpenAI
  }

  try {
    const openai = await callOpenAI(params.system, params.user);
    if (openai) return openai;
  } catch {
    // Fall through to deterministic local summary
  }

  return {
    text: deterministicFallbackText(params.toolResults),
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

  const system = `You are Chuk, the advisor inside the AI Business Advisor platform, serving an after-school / tutoring / enrichment centre. Refer to yourself as Chuk when the owner addresses you by name.

NON-NEGOTIABLE EVIDENCE RULES:
1. Use ONLY the structured analytics evidence provided in this message. Every number, name, and date in your answer must appear in, or be arithmetic on, that evidence.
2. NEVER guess, estimate, extrapolate, or invent figures, records, or facts that are not in the evidence. A wrong number is worse than no number.
3. If the evidence is missing, empty, or insufficient to answer, your answer IS the request for data: state exactly what is missing and where to add it (Programmes & Students, Staffing, Expenses & Subscriptions, Targets & Forecasts, Pricing Advisor, CSV import, or the portal connector).
4. If a tool result has status INSUFFICIENT_DATA or a missingData list, relay those items verbatim as the required next step. Do not fill the gaps yourself.
5. Projections may only restate the scenario figures present in the evidence, labelled as scenarios, never as certainties.
6. Do not provide legal, tax, accounting, or investment advice; frame everything as operational information the owner must verify and decide on.
7. If pricingGuidance includes verdict ABOVE_TARGET, present it as a time-boxed price test that still clears the cost floor. Do not say the price caused low sales. Do not promise that lowering the price will fill seats. Do not use or invent household income, census, or area-affordability figures.
8. If enrolmentGuidance is present: name the leak from that evidence. Prioritize the cheapNextSteps. Suggest paid spend only when paidTest.eligible is true, and only up to paidTest.weeklySpendCapCents when that figure is present. If askTriedAndResults is true, your answer must ask what they have already tried AND what result they got, and point them to Enrolment Advisor to record it. Use their tacticsTried outcomes when present. You may cite peerPatterns only as counts already in the evidence ("helped in X of Y reports"), never as proof a tactic will work here. Do not invent channels, student counts, or ROI.
9. If organizationMemory is present, treat it as this centre's history. Cite specific actions and tactics already tried. Do not recommend repeating a tactic whose recorded outcome was NO_EFFECT or HURT unless the owner asks. Prefer tactics that HELPED here, then peerPatterns counts.
10. instructorCostPerSeatHour, householdLtv, trialToPaidByProgramme, and cashSafeTestSize are calculated verdicts. Restate them. Do not recompute or invent a different figure.

Speak plainly to the owner. Prefer dollars, students, capacity, and next actions.
Canadian English spelling.`;

  const userPrompt = `Question: ${params.question}\n\nAvailable tools used: ${tools
    .map((t) => `${t} (${TOOL_DESCRIPTIONS[t]})`)
    .join(', ')}\n\nEvidence:\n${evidenceBlock}`;

  const result = await callProvider({
    system,
    user: userPrompt,
    toolResults,
  });

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
    disclaimer: ADVICE_DISCLAIMER,
  };
}
