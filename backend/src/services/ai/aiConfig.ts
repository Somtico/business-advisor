/**
 * Central AI operational configuration.
 * Model IDs, budgets, and guardrails live here (env overrides allowed).
 * Do not scatter model strings or token ceilings in feature code.
 */

export type WorkloadProfile =
  | 'cheap_background'
  | 'routine_advisor'
  | 'standard_advisor'
  | 'complex_strategy';

export type AiFeatureId =
  | 'ask_advisor'
  | 'pricing_advisor'
  | 'enrolment_advisor'
  | 'weekly_brief'
  | 'daily_analysis'
  | 'proactive_insights'
  | 'insight_generation'
  | 'reports'
  | 'background_analysis'
  | 'other';

export type AiProviderName = 'anthropic' | 'openai';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`AI config ${name} must be a non-negative integer`);
  }
  return n;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`AI config ${name} must be a non-negative number`);
  }
  return n;
}

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim();
}

/** First defined non-empty env among names, else fallback. */
function envStringAny(names: string[], fallback: string): string {
  for (const name of names) {
    const raw = process.env[name];
    if (raw !== undefined && raw.trim() !== '') return raw.trim();
  }
  return fallback;
}

function envFloatAny(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw !== undefined && raw !== '') {
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`AI config ${name} must be a non-negative number`);
      }
      return n;
    }
  }
  return fallback;
}

function envIntAny(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw !== undefined && raw !== '') {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`AI config ${name} must be a non-negative integer`);
      }
      return n;
    }
  }
  return fallback;
}

function parsePercentList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw || !raw.trim()) return fallback;
  const parts = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  return parts.length > 0 ? parts : fallback;
}

/** USD micros: 1 USD = 1_000_000 micros. Prefer integer money everywhere. */
export function usdToMicros(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

export function getAiConfig() {
  const defaultMaxOutput = envIntAny(
    ['AI_MAX_OUTPUT_TOKENS', 'AI_MAX_OUTPUT_TOKENS_STANDARD'],
    4096
  );

  return {
    routing: {
      primaryProvider: envStringAny(
        ['AI_PRIMARY_PROVIDER'],
        'anthropic'
      ) as AiProviderName,
      fallbackProvider: envStringAny(
        ['AI_FALLBACK_PROVIDER'],
        'openai'
      ) as AiProviderName,
      fallbackEnabled:
        envStringAny(['AI_FALLBACK_ENABLED'], 'true').toLowerCase() !==
        'false',
    },
    models: {
      /** Primary routine / standard / complex default (Anthropic). */
      anthropicRoutine: envStringAny(
        ['ANTHROPIC_MODEL', 'ANTHROPIC_ROUTINE_MODEL'],
        'claude-sonnet-5'
      ),
      /** Explicit strategic model — never an automatic default. */
      anthropicStrategic: envString(
        'ANTHROPIC_STRATEGIC_MODEL',
        'claude-opus-5'
      ),
      anthropicCheap: envString('ANTHROPIC_CHEAP_MODEL', 'claude-haiku-4-5'),
      /** OpenAI fallback for routine/standard work. */
      openaiFallback: envStringAny(
        ['OPENAI_MODEL', 'OPENAI_FALLBACK_MODEL'],
        'gpt-5.6-terra'
      ),
      /** Low-cost background when an LLM is genuinely required. */
      openaiCheap: envString('OPENAI_CHEAP_MODEL', 'gpt-5.6-luna'),
      /** Expensive OpenAI — only via explicit strategic policy. */
      openaiStrategic: envString('OPENAI_STRATEGIC_MODEL', 'gpt-5.6-sol'),
      /**
       * When true, complex_strategy may use anthropicStrategic / openaiStrategic.
       * Default false: complex_strategy still uses Sonnet / Terra at higher effort.
       */
      allowExpensiveStrategicModels:
        envString('AI_ALLOW_EXPENSIVE_STRATEGIC_MODELS', 'false') === 'true',
    },
    effort: {
      routine: envString('ANTHROPIC_EFFORT_ROUTINE', 'low'),
      standard: envString('ANTHROPIC_EFFORT_STANDARD', 'medium'),
      complex: envString('ANTHROPIC_EFFORT_COMPLEX', 'high'),
      cheap: envString('ANTHROPIC_EFFORT_CHEAP', 'low'),
    },
    limits: {
      requestTimeoutMs: envInt('AI_REQUEST_TIMEOUT_MS', 30_000),
      /** Same-provider transient retries (not cross-provider fallback). */
      maxProviderRetries: envInt('AI_MAX_PROVIDER_RETRIES', 1),
      maxFallbackAttempts: envInt('AI_MAX_FALLBACK_ATTEMPTS', 1),
      /** Hard max model/tool rounds per user request. */
      maxToolRounds: envIntAny(
        ['AI_MAX_TOOL_ROUNDS', 'AI_MAX_TOOL_ITERATIONS'],
        6
      ),
      /** Alias of maxToolRounds (Ask Advisor tool picker / older callers). */
      maxToolIterations: envIntAny(
        ['AI_MAX_TOOL_ROUNDS', 'AI_MAX_TOOL_ITERATIONS'],
        6
      ),
      maxProviderCallsPerRequest: envInt('AI_MAX_PROVIDER_CALLS_PER_REQUEST', 6),
      maxHistoryMessages: envInt('AI_MAX_HISTORY_MESSAGES', 8),
      maxEvidenceChars: envInt('AI_MAX_EVIDENCE_CHARS', 24_000),
      maxQuestionChars: envInt('AI_MAX_QUESTION_CHARS', 4_000),
      /** Soft estimated cost ceiling per logical request (USD micros). */
      maxRequestCostUsdMicros: usdToMicros(
        envFloat('AI_MAX_REQUEST_COST_USD', 0.5)
      ),
      outputTokens: {
        cheap_background: envInt('AI_MAX_OUTPUT_TOKENS_CHEAP', 256),
        routine_advisor: envInt('AI_MAX_OUTPUT_TOKENS_ROUTINE', 1024),
        standard_advisor: defaultMaxOutput,
        complex_strategy: envInt(
          'AI_MAX_OUTPUT_TOKENS_COMPLEX',
          Math.max(defaultMaxOutput, 4096)
        ),
      } as Record<WorkloadProfile, number>,
    },
    budgets: {
      /** Org daily AI budget (USD). Pilot default. */
      defaultOrgDailyUsd: envFloatAny(
        ['AI_ORG_DAILY_COST_CAP_USD', 'AI_DEFAULT_ORG_DAILY_BUDGET_USD'],
        2
      ),
      /** Org monthly AI budget (USD). */
      defaultOrgMonthlyUsd: envFloatAny(
        ['AI_ORG_MONTHLY_COST_CAP_USD', 'AI_DEFAULT_ORG_MONTHLY_BUDGET_USD'],
        25
      ),
      /** Application-wide daily ceiling (USD). 0 = disabled. */
      globalDailyUsd: envFloatAny(
        ['AI_GLOBAL_DAILY_COST_CAP_USD', 'AI_GLOBAL_DAILY_BUDGET_USD'],
        5
      ),
      globalMonthlyUsd: envFloatAny(
        ['AI_GLOBAL_MONTHLY_COST_CAP_USD', 'AI_GLOBAL_MONTHLY_BUDGET_USD'],
        100
      ),
      /** Provider-level monthly application caps (USD). */
      anthropicMonthlyUsd: envFloat(
        'ANTHROPIC_MONTHLY_COST_CAP_USD',
        80
      ),
      openaiMonthlyUsd: envFloat('OPENAI_MONTHLY_COST_CAP_USD', 8),
      softThresholdsPercent: parsePercentList(
        process.env.AI_BUDGET_WARNING_PERCENTAGES,
        [50, 80, 100]
      ),
      hardBlockAtPercent: envInt('AI_BUDGET_HARD_BLOCK_PERCENT', 100),
    },
    circuitBreaker: {
      failureThreshold: envInt('AI_CIRCUIT_FAILURE_THRESHOLD', 3),
      cooldownMs: envInt('AI_CIRCUIT_COOLDOWN_MS', 60_000),
    },
    pricingVersion: envString('AI_PRICING_VERSION', '2026-08-16.v2'),
  };
}

export type AiConfig = ReturnType<typeof getAiConfig>;
