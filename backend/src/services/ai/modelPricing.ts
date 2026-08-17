/**
 * Versioned model pricing registry.
 *
 * Update prices HERE — never in feature code.
 * Do not fetch pricing from the public internet at runtime.
 *
 * Units: USD micros per 1_000_000 tokens (1 USD = 1_000_000 micros).
 * Effective date: 2026-08-16 · Version: 2026-08-16.v2
 * Official sources (16 Aug 2026):
 * - https://platform.claude.com/docs/en/about-claude/pricing
 * - https://developers.openai.com/api/docs/models/gpt-5.6-terra
 */

export type AiProviderName = 'anthropic' | 'openai' | 'local';

export type ModelPriceRow = {
  provider: AiProviderName;
  model: string;
  inputPerMillionMicros: bigint;
  outputPerMillionMicros: bigint;
  cacheReadPerMillionMicros: bigint | null;
  cacheWritePerMillionMicros: bigint | null;
  reasoningPerMillionMicros: bigint | null;
  notes?: string;
};

const M = (usdPerMillion: number): bigint =>
  BigInt(Math.round(usdPerMillion * 1_000_000));

export const MODEL_PRICE_REGISTRY: ModelPriceRow[] = [
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    inputPerMillionMicros: M(2),
    outputPerMillionMicros: M(10),
    cacheReadPerMillionMicros: M(0.2),
    cacheWritePerMillionMicros: M(2.5),
    reasoningPerMillionMicros: null,
    notes: 'Primary routine / standard / complex default',
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    inputPerMillionMicros: M(5),
    outputPerMillionMicros: M(25),
    cacheReadPerMillionMicros: M(0.5),
    cacheWritePerMillionMicros: M(6.25),
    reasoningPerMillionMicros: null,
    notes: 'Strategic only when AI_ALLOW_EXPENSIVE_STRATEGIC_MODELS=true',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    inputPerMillionMicros: M(1),
    outputPerMillionMicros: M(5),
    cacheReadPerMillionMicros: M(0.1),
    cacheWritePerMillionMicros: M(1.25),
    reasoningPerMillionMicros: null,
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    inputPerMillionMicros: M(2),
    outputPerMillionMicros: M(12),
    cacheReadPerMillionMicros: M(0.2),
    cacheWritePerMillionMicros: M(2.5),
    reasoningPerMillionMicros: null,
    notes: 'Normal OpenAI fallback (official Terra pricing)',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    inputPerMillionMicros: M(5),
    outputPerMillionMicros: M(30),
    cacheReadPerMillionMicros: M(0.5),
    cacheWritePerMillionMicros: M(6.25),
    reasoningPerMillionMicros: null,
    notes: 'Strategic only when explicitly enabled',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-luna',
    inputPerMillionMicros: M(0.2),
    outputPerMillionMicros: M(1.2),
    cacheReadPerMillionMicros: M(0.02),
    cacheWritePerMillionMicros: M(0.25),
    reasoningPerMillionMicros: null,
    notes: 'Cheap background when an LLM is required',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6',
    inputPerMillionMicros: M(5),
    outputPerMillionMicros: M(30),
    cacheReadPerMillionMicros: M(0.5),
    cacheWritePerMillionMicros: M(6.25),
    reasoningPerMillionMicros: null,
    notes: 'OpenAI alias routes to Sol — prefer gpt-5.6-terra',
  },
  {
    provider: 'local',
    model: 'deterministic-fallback',
    inputPerMillionMicros: 0n,
    outputPerMillionMicros: 0n,
    cacheReadPerMillionMicros: 0n,
    cacheWritePerMillionMicros: 0n,
    reasoningPerMillionMicros: 0n,
  },
];

export function findModelPrice(
  provider: string,
  model: string
): ModelPriceRow | null {
  const exact = MODEL_PRICE_REGISTRY.find(
    (r) => r.provider === provider && r.model === model
  );
  if (exact) return exact;
  return (
    MODEL_PRICE_REGISTRY.find(
      (r) =>
        r.provider === provider &&
        (model.startsWith(r.model) || r.model.startsWith(model))
    ) ?? null
  );
}

export type NormalizedTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  reasoningBilledSeparately: boolean;
  totalTokensReported: number | null;
};

export type CostBreakdown = {
  estimatedCostUsdMicros: bigint;
  pricingVersion: string;
  priceFound: boolean;
  calculationMode: 'exact_registry' | 'estimated_fallback' | 'zero';
  components: {
    inputMicros: bigint;
    cacheReadMicros: bigint;
    cacheWriteMicros: bigint;
    outputMicros: bigint;
    reasoningMicros: bigint;
  };
};

function tokensCost(tokens: number, perMillion: bigint): bigint {
  if (tokens <= 0 || perMillion === 0n) return 0n;
  return (BigInt(tokens) * perMillion) / 1_000_000n;
}

export function calculateUsageCost(params: {
  provider: string;
  model: string;
  usage: NormalizedTokenUsage;
  pricingVersion: string;
}): CostBreakdown {
  if (params.provider === 'local') {
    return {
      estimatedCostUsdMicros: 0n,
      pricingVersion: params.pricingVersion,
      priceFound: true,
      calculationMode: 'zero',
      components: {
        inputMicros: 0n,
        cacheReadMicros: 0n,
        cacheWriteMicros: 0n,
        outputMicros: 0n,
        reasoningMicros: 0n,
      },
    };
  }

  const row = findModelPrice(params.provider, params.model);
  const rates = row ?? {
    inputPerMillionMicros: M(2),
    outputPerMillionMicros: M(10),
    cacheReadPerMillionMicros: M(2),
    cacheWritePerMillionMicros: M(2),
    reasoningPerMillionMicros: null as bigint | null,
  };

  const cacheReadRate =
    rates.cacheReadPerMillionMicros ?? rates.inputPerMillionMicros;
  const cacheWriteRate =
    rates.cacheWritePerMillionMicros ?? rates.inputPerMillionMicros;

  const inputMicros = tokensCost(
    params.usage.inputTokens,
    rates.inputPerMillionMicros
  );
  const cacheReadMicros = tokensCost(
    params.usage.cachedInputTokens,
    cacheReadRate
  );
  const cacheWriteMicros = tokensCost(
    params.usage.cacheWriteTokens,
    cacheWriteRate
  );
  const outputMicros = tokensCost(
    params.usage.outputTokens,
    rates.outputPerMillionMicros
  );
  const reasoningMicros =
    params.usage.reasoningBilledSeparately &&
    rates.reasoningPerMillionMicros != null
      ? tokensCost(
          params.usage.reasoningTokens,
          rates.reasoningPerMillionMicros
        )
      : 0n;

  return {
    estimatedCostUsdMicros:
      inputMicros +
      cacheReadMicros +
      cacheWriteMicros +
      outputMicros +
      reasoningMicros,
    pricingVersion: params.pricingVersion,
    priceFound: !!row,
    calculationMode: row ? 'exact_registry' : 'estimated_fallback',
    components: {
      inputMicros,
      cacheReadMicros,
      cacheWriteMicros,
      outputMicros,
      reasoningMicros,
    },
  };
}

export function microsToUsdCents(micros: bigint): number {
  return Number(micros / 10_000n);
}

export function formatUsdFromMicros(micros: bigint): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '') || '0';
  const body =
    fracStr === '0' ? whole.toString() : `${whole.toString()}.${fracStr}`;
  return `${negative ? '-' : ''}$${body}`;
}
