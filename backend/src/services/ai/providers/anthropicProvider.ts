/**
 * Anthropic Messages API client — used only by the AI gateway.
 */

import { getAiConfig } from '../aiConfig';
import { classifyProviderHttpError, AiGatewayError } from '../aiErrors';
import {
  normalizeAnthropicUsage,
  AnthropicUsageLike,
} from '../usageNormalization';
import { NormalizedTokenUsage } from '../modelPricing';

export type AnthropicCallResult = {
  text: string;
  model: string;
  usage: NormalizedTokenUsage;
  rawUsage: AnthropicUsageLike | null;
  latencyMs: number;
  privacyPolicy: string;
  stopReason: string | null;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted/i.test(err.message))
    ) {
      throw new AiGatewayError({
        code: 'AI_TIMEOUT',
        message: 'Anthropic request timed out',
        httpStatus: 503,
        retryable: true,
        eligibleForCrossProviderFallback: true,
      });
    }
    throw new AiGatewayError({
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Anthropic connection failed',
      httpStatus: 503,
      retryable: true,
      eligibleForCrossProviderFallback: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeAnthropic(params: {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  effort: string | null;
  enablePromptCache?: boolean;
}): Promise<AnthropicCallResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new AiGatewayError({
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Anthropic is not configured',
      httpStatus: 503,
      retryable: false,
      eligibleForCrossProviderFallback: true,
    });
  }

  const timeoutMs = getAiConfig().limits.requestTimeoutMs;

  const systemBlock = params.enablePromptCache
    ? [
        {
          type: 'text',
          text: params.system,
          cache_control: { type: 'ephemeral' },
        },
      ]
    : params.system;

  const buildBody = (withEffort: boolean) => {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxOutputTokens,
      system: systemBlock,
      messages: [{ role: 'user', content: params.user }],
    };
    if (withEffort && params.effort) {
      body.output_config = { effort: params.effort };
    }
    return body;
  };

  const headers = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };

  const started = Date.now();
  let res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody(true)),
    },
    timeoutMs
  );

  if (!res.ok) {
    const errText = await res.text();
    if (/effort|output_config|thinking/i.test(errText) && params.effort) {
      res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(buildBody(false)),
        },
        timeoutMs
      );
      if (!res.ok) {
        throw classifyProviderHttpError(
          'Anthropic',
          res.status,
          await res.text()
        );
      }
    } else {
      throw classifyProviderHttpError('Anthropic', res.status, errText);
    }
  }

  const json = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: AnthropicUsageLike;
    model?: string;
    stop_reason?: string;
  };

  const text =
    (json.content || [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text || '')
      .join('\n') || 'No response';

  const stopReason = json.stop_reason ?? null;
  if (stopReason === 'refusal') {
    throw new AiGatewayError({
      code: 'AI_POLICY_REJECTED',
      message: 'Anthropic refused the request under a safety policy',
      httpStatus: 400,
      retryable: false,
      eligibleForCrossProviderFallback: false,
    });
  }

  return {
    text,
    model: json.model || params.model,
    usage: normalizeAnthropicUsage(json.usage),
    rawUsage: json.usage ?? null,
    latencyMs: Date.now() - started,
    privacyPolicy:
      'anthropic_api_no_training_default_prefer_zdr_eligible_models',
    stopReason,
  };
}
