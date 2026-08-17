/**
 * Ask Advisor — deterministic tools + PII minimization + centralized AI gateway.
 * Do not call Anthropic/OpenAI HTTP APIs from this file.
 */

import prisma from '../config/prisma';
import { analyticsTools } from './metrics/analyticsService';
import { enrolmentGuidance } from './enrolmentService';
import { organizationMemory } from './organizationMemoryService';
import { pricingGuidance } from './pricingService';
import { ADVICE_DISCLAIMER } from '../config/legal';
import { writeAudit } from './auditService';
import {
  minimizeForProviderInference,
  type PiiMinimizationStats,
} from './providerPiiMinimizer';
import { getAiConfig } from './ai/aiConfig';
import { AiGatewayError } from './ai/aiErrors';
import {
  recordLocalFallback,
  runAiInference,
  type AiInferenceResult,
} from './ai/aiGateway';
import { profileForAdvisorQuestion } from './ai/modelPolicy';

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
    "This centre's last 90 days of actions, verified impact, and enrolment tactics already tried. Cite these before suggesting a repeat. Do not recommend a tactic whose recorded outcome here was NO_EFFECT or HURT unless the owner asks.",
  instructorCostPerSeatHour:
    "Instructor labour cost per learner-hour from this week's scheduled sessions. Reports missing data instead of guessing.",
  householdLtv:
    'Average and median monthly tuition per household (or per student when no household is linked). Annualized figure is 12 × current list price, not a predicted lifetime.',
  trialToPaidByProgramme:
    'Trial-to-paid conversion per programme from recorded engagements. A conversion is a person with both a trial and a later paid enrolment on the same programme.',
  cashSafeTestSize:
    "Largest weekly paid-test spend this centre's recorded cash can absorb. A spend cap, not a forecast of new students.",
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
  if (
    /seat.?hour|learner.?hour|cost per seat|labour efficiency|labor efficiency/.test(
      q
    )
  ) {
    tools.push('instructorCostPerSeatHour');
  }
  if (/ltv|lifetime|household|family value|per family|per household/.test(q)) {
    tools.push('householdLtv');
  }
  if (
    /which programme|which program|converts|trial.to.paid|by programme|by program/.test(
      q
    )
  ) {
    tools.push('trialToPaidByProgramme');
  }
  if (/ad spend|how much can i (spend|afford)|paid test|spend cap|cash.safe/.test(q)) {
    tools.push('cashSafeTestSize');
  }
  if (tools.length === 0) tools.push('executiveDashboard');
  if (!tools.includes('organizationMemory')) {
    tools.unshift('organizationMemory');
  }

  const maxTools = getAiConfig().limits.maxToolRounds;
  return tools.slice(0, maxTools);
}

/** Compact JSON for evidence — avoid pretty-print token waste. */
function formatToolResult(name: string, data: unknown): string {
  return `### ${name}\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;
}

/**
 * Build the provider-bound user prompt from already-minimized question + tools.
 */
export function buildProviderUserPrompt(params: {
  question: string;
  tools: string[];
  toolResults: Record<string, unknown>;
}): string {
  const evidenceBlock = Object.entries(params.toolResults)
    .map(([name, data]) => formatToolResult(name, data))
    .join('\n\n');

  return `Question: ${params.question}\n\nAvailable tools used: ${params.tools
    .map((t) => `${t} (${TOOL_DESCRIPTIONS[t] || t})`)
    .join(', ')}\n\nEvidence:\n${evidenceBlock}`;
}

function deterministicFallbackText(
  toolResults: Record<string, unknown>
): string {
  const lines = [
    'Advisor is temporarily unavailable for generative analysis. Open Command Centre, Enrolment Advisor, and Pricing Advisor for the full picture. Deterministic read of your records:',
    '',
  ];
  const memory = toolResults.organizationMemory as
    | {
        verifiedImpactCents?: number;
        tacticsTried?: Array<{ label: string; outcome: string }>;
      }
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
    | {
        programmes?: Array<{
          name: string;
          verdict: string | null;
          status: string;
        }>;
      }
    | undefined;
  if (pricing?.programmes?.length) {
    for (const p of pricing.programmes.slice(0, 6)) {
      lines.push(
        `${p.name}: ${p.status === 'INSUFFICIENT_DATA' ? 'needs data' : p.verdict || 'ready'}.`
      );
    }
  }
  if (lines.length <= 2) {
    lines.push(
      'Try again in a few minutes, or continue with the deterministic advisors above.'
    );
  }
  return lines.join('\n');
}

export const ADVISOR_SYSTEM_PROMPT = `You are the AI-powered Advisor within Somtico Business Advisor, serving an after-school / tutoring / enrichment centre. Refer to yourself as Advisor. Do not claim a personal human name or introduce yourself as Chuk, Tico, or any other invented name.

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
11. Evidence may use request-scoped aliases (Instructor A, Student A, etc.) instead of real personal names. Treat those aliases as stable identifiers within this message only.

Speak plainly to the owner. Prefer dollars, students, capacity, and next actions.
Canadian English spelling.`;

type ProviderResult = {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsdCents: number;
  privacyPolicy: string;
  logicalRequestId?: string;
  usedFallback?: boolean;
  fallbackReason?: string | null;
  providerCallCount?: number;
};

/**
 * Sole Anthropic/OpenAI gateway for Ask Advisor.
 * Minimizes once, then uses that representation for primary/fallback/retry.
 */
export async function invokeProviderInference(params: {
  organizationId: string;
  userId?: string;
  question: string;
  tools: ToolName[] | string[];
  toolResults: Record<string, unknown>;
  system?: string;
  idempotencyKey?: string;
  isBackground?: boolean;
}): Promise<ProviderResult & { minimizationStats: PiiMinimizationStats }> {
  const minimized = minimizeForProviderInference({
    question: params.question,
    toolResults: params.toolResults,
  });

  const system = params.system || ADVISOR_SYSTEM_PROMPT;
  const user = buildProviderUserPrompt({
    question: minimized.question,
    tools: params.tools,
    toolResults: minimized.toolResults,
  });

  const workloadProfile = profileForAdvisorQuestion(params.question);

  let result: AiInferenceResult;
  try {
    result = await runAiInference({
      organizationId: params.organizationId,
      userId: params.userId,
      feature: 'ask_advisor',
      subFeature: 'chat',
      workloadProfile,
      system,
      user,
      isBackground: !!params.isBackground,
      idempotencyKey: params.idempotencyKey,
      enablePromptCache: true,
      toolRoundsUsed: 1,
      metadata: {
        toolCount: params.tools.length,
        piiMinimization: minimized.stats,
      },
    });
  } catch (err) {
    if (
      err instanceof AiGatewayError &&
      (err.code === 'AI_BUDGET_EXCEEDED' ||
        err.code === 'AI_REQUEST_LIMIT_REACHED' ||
        err.code === 'AI_INVALID_REQUEST' ||
        err.code === 'AI_CONTEXT_TOO_LARGE' ||
        err.code === 'AI_POLICY_REJECTED' ||
        err.code === 'AI_AUTH_FAILED')
    ) {
      // Auth / safety / budget / validation: do not invent an answer
      throw err;
    }
    result = await recordLocalFallback({
      organizationId: params.organizationId,
      userId: params.userId,
      feature: 'ask_advisor',
      workloadProfile,
      isBackground: !!params.isBackground,
      text: deterministicFallbackText(minimized.toolResults),
    });
  }

  return {
    text: result.text,
    provider: result.provider,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    estimatedCostUsdCents: Number(
      result.estimatedCostUsdMicros / 10_000n
    ),
    privacyPolicy: result.privacyPolicy,
    logicalRequestId: result.logicalRequestId,
    usedFallback: result.usedFallback,
    fallbackReason: result.fallbackReason,
    providerCallCount: result.providerCallCount,
    minimizationStats: minimized.stats,
  };
}

export async function askAdvisor(params: {
  organizationId: string;
  userId: string;
  question: string;
  conversationId?: string;
  idempotencyKey?: string;
}) {
  const cfg = getAiConfig();
  const question = params.question.trim();
  if (!question) {
    throw new AiGatewayError({
      code: 'AI_INVALID_REQUEST',
      message: 'question required',
      httpStatus: 400,
      retryable: false,
    });
  }
  if (question.length > cfg.limits.maxQuestionChars) {
    throw new AiGatewayError({
      code: 'AI_CONTEXT_TOO_LARGE',
      message: `Question exceeds ${cfg.limits.maxQuestionChars} characters`,
      httpStatus: 400,
      retryable: false,
    });
  }

  const tools = pickTools(question);
  const toolResults: Record<string, unknown> = {};
  for (const name of tools) {
    const fn = advisorTools[name];
    toolResults[name] = await (fn as (orgId: string) => Promise<unknown>)(
      params.organizationId
    );
  }

  const result = await invokeProviderInference({
    organizationId: params.organizationId,
    userId: params.userId,
    question,
    tools,
    toolResults,
    idempotencyKey: params.idempotencyKey,
  });

  let conversationId = params.conversationId;
  if (!conversationId) {
    const convo = await prisma.aiConversation.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        title: question.slice(0, 80),
      },
    });
    conversationId = convo.id;
  }

  // Persist the owner's original question for their conversation history.
  // Provider-bound prompts are not stored.
  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: 'user',
      content: question,
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
        logicalRequestId: result.logicalRequestId,
        providerCallCount: result.providerCallCount,
        piiMinimization: result.minimizationStats,
        // Provider/model intentionally omitted from customer-facing payload
      },
    },
  });

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: 'ai.advisor_chat',
    resourceType: 'AiConversation',
    resourceId: conversationId,
    metadata: {
      // Operational audit may record provider for operators; not returned to UI
      provider: result.provider,
      model: result.model,
      tools,
      privacyPolicy: result.privacyPolicy,
      logicalRequestId: result.logicalRequestId,
      usedFallback: result.usedFallback,
      fallbackReason: result.fallbackReason,
      piiMinimization: result.minimizationStats,
    },
  });

  return {
    conversationId,
    answer: result.text,
    toolsUsed: tools,
    disclaimer: ADVICE_DISCLAIMER,
    logicalRequestId: result.logicalRequestId,
  };
}

/** Test helper: run minimization + prompt build without calling providers. */
export function prepareProviderSafeRequest(params: {
  question: string;
  tools: string[];
  toolResults: Record<string, unknown>;
}): {
  system: string;
  user: string;
  toolResults: Record<string, unknown>;
  stats: PiiMinimizationStats;
} {
  const minimized = minimizeForProviderInference({
    question: params.question,
    toolResults: params.toolResults,
  });
  return {
    system: ADVISOR_SYSTEM_PROMPT,
    user: buildProviderUserPrompt({
      question: minimized.question,
      tools: params.tools,
      toolResults: minimized.toolResults,
    }),
    toolResults: minimized.toolResults,
    stats: minimized.stats,
  };
}

export { AiGatewayError };
