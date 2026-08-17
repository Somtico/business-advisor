/**
 * Normalize Anthropic and OpenAI usage without double-counting.
 */

import { NormalizedTokenUsage } from './modelPricing';

export type AnthropicUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  thinking_tokens?: number;
};

export type OpenAIUsageLike = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Anthropic: input_tokens is non-cached; cache_* are separate billable classes.
 * thinking_tokens recorded for telemetry; not billed twice (assumed in output when present).
 */
export function normalizeAnthropicUsage(
  usage: AnthropicUsageLike | null | undefined
): NormalizedTokenUsage {
  const inputTokens = n(usage?.input_tokens);
  const cachedInputTokens = n(usage?.cache_read_input_tokens);
  const cacheWriteTokens = n(usage?.cache_creation_input_tokens);
  const outputTokens = n(usage?.output_tokens);
  const thinking = n(usage?.thinking_tokens);
  const total =
    inputTokens + cachedInputTokens + cacheWriteTokens + outputTokens + thinking;
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens: thinking,
    reasoningBilledSeparately: false,
    totalTokensReported: total || null,
  };
}

/**
 * OpenAI: prompt_tokens usually includes cached_tokens;
 * completion_tokens usually includes reasoning_tokens.
 */
export function normalizeOpenAIUsage(
  usage: OpenAIUsageLike | null | undefined
): NormalizedTokenUsage {
  const prompt = n(usage?.prompt_tokens) || n(usage?.input_tokens);
  const completion = n(usage?.completion_tokens) || n(usage?.output_tokens);
  const cached = n(
    usage?.prompt_tokens_details?.cached_tokens ??
      usage?.input_tokens_details?.cached_tokens
  );
  const reasoning = n(
    usage?.completion_tokens_details?.reasoning_tokens ??
      usage?.output_tokens_details?.reasoning_tokens
  );
  return {
    inputTokens: Math.max(0, prompt - cached),
    cachedInputTokens: cached,
    cacheWriteTokens: 0,
    outputTokens: completion,
    reasoningTokens: reasoning,
    reasoningBilledSeparately: false,
    totalTokensReported: n(usage?.total_tokens) || prompt + completion || null,
  };
}
