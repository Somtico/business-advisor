import {
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
} from './usageNormalization';

describe('usage normalization', () => {
  it('keeps Anthropic cache classes separate', () => {
    expect(
      normalizeAnthropicUsage({
        input_tokens: 100,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 10,
        output_tokens: 25,
        thinking_tokens: 5,
      })
    ).toEqual({
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheWriteTokens: 10,
      outputTokens: 25,
      reasoningTokens: 5,
      reasoningBilledSeparately: false,
      totalTokensReported: 180,
    });
  });

  it('subtracts OpenAI cached tokens from inclusive prompt tokens', () => {
    expect(
      normalizeOpenAIUsage({
        prompt_tokens: 120,
        completion_tokens: 50,
        total_tokens: 170,
        prompt_tokens_details: { cached_tokens: 20 },
        completion_tokens_details: { reasoning_tokens: 15 },
      })
    ).toEqual({
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteTokens: 0,
      outputTokens: 50,
      reasoningTokens: 15,
      reasoningBilledSeparately: false,
      totalTokensReported: 170,
    });
  });

  it('supports Responses API usage names and sanitizes invalid values', () => {
    expect(
      normalizeOpenAIUsage({
        input_tokens: 30,
        output_tokens: 12,
        input_tokens_details: { cached_tokens: 5 },
        output_tokens_details: { reasoning_tokens: Number.NaN },
      })
    ).toMatchObject({
      inputTokens: 25,
      cachedInputTokens: 5,
      outputTokens: 12,
      reasoningTokens: 0,
      totalTokensReported: 42,
    });
    expect(normalizeAnthropicUsage(undefined).totalTokensReported).toBeNull();
  });
});
