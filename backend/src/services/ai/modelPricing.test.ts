import {
  calculateUsageCost,
  findModelPrice,
  formatUsdFromMicros,
  microsToUsdCents,
} from './modelPricing';

const usage = {
  inputTokens: 1_000_000,
  cachedInputTokens: 100_000,
  cacheWriteTokens: 50_000,
  outputTokens: 500_000,
  reasoningTokens: 25_000,
  reasoningBilledSeparately: false,
  totalTokensReported: null,
};

describe('model pricing', () => {
  it('finds exact and version-suffixed model IDs', () => {
    expect(findModelPrice('anthropic', 'claude-sonnet-5')?.model).toBe(
      'claude-sonnet-5'
    );
    expect(
      findModelPrice('anthropic', 'claude-sonnet-5-20260816')?.model
    ).toBe('claude-sonnet-5');
  });

  it('calculates each billable token class in USD micros', () => {
    const cost = calculateUsageCost({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage,
      pricingVersion: 'test',
    });
    expect(cost.calculationMode).toBe('exact_registry');
    expect(cost.components).toEqual({
      inputMicros: 2_000_000n,
      cacheReadMicros: 20_000n,
      cacheWriteMicros: 125_000n,
      outputMicros: 5_000_000n,
      reasoningMicros: 0n,
    });
    expect(cost.estimatedCostUsdMicros).toBe(7_145_000n);
  });

  it('uses conservative fallback pricing for unknown models', () => {
    const cost = calculateUsageCost({
      provider: 'openai',
      model: 'unknown-model',
      usage: { ...usage, cachedInputTokens: 0, cacheWriteTokens: 0 },
      pricingVersion: 'test',
    });
    expect(cost.priceFound).toBe(false);
    expect(cost.calculationMode).toBe('estimated_fallback');
    expect(cost.estimatedCostUsdMicros).toBe(7_000_000n);
  });

  it('keeps local inference free and formats micros', () => {
    const cost = calculateUsageCost({
      provider: 'local',
      model: 'deterministic-fallback',
      usage,
      pricingVersion: 'test',
    });
    expect(cost.estimatedCostUsdMicros).toBe(0n);
    expect(microsToUsdCents(1_999_999n)).toBe(199);
    expect(formatUsdFromMicros(1_250_000n)).toBe('$1.25');
  });
});
