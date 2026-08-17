import { classifyProviderHttpError, AiGatewayError } from '../aiErrors';
import { normalizeOpenAIUsage, OpenAIUsageLike } from '../usageNormalization';
import { NormalizedTokenUsage } from '../modelPricing';

export type OpenAICallResult = {
  text: string;
  model: string;
  usage: NormalizedTokenUsage;
  latencyMs: number;
  privacyPolicy: string;
};

export async function invokeOpenAI(params: {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
}): Promise<OpenAICallResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new AiGatewayError({
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'OpenAI is not configured',
      httpStatus: 503,
      retryable: false,
    });
  }

  const body: Record<string, unknown> = {
    model: params.model,
    store: false,
    max_completion_tokens: params.maxOutputTokens,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
  };
  if (!/^o\d/i.test(params.model) && !/gpt-5/i.test(params.model)) {
    body.temperature = 0.2;
    body.max_tokens = params.maxOutputTokens;
    delete body.max_completion_tokens;
  }

  const started = Date.now();
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
    if (
      /max_completion_tokens|max_tokens/i.test(errText) &&
      body.max_completion_tokens
    ) {
      delete body.max_completion_tokens;
      body.max_tokens = params.maxOutputTokens;
      const retry = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!retry.ok) {
        throw classifyProviderHttpError(
          'OpenAI',
          retry.status,
          await retry.text()
        );
      }
      return parseOpenAIResponse(
        (await retry.json()) as Parameters<typeof parseOpenAIResponse>[0],
        params.model,
        started
      );
    }
    throw classifyProviderHttpError('OpenAI', res.status, errText);
  }

  return parseOpenAIResponse(
    (await res.json()) as Parameters<typeof parseOpenAIResponse>[0],
    params.model,
    started
  );
}

function parseOpenAIResponse(
  json: {
    choices?: { message?: { content?: string } }[];
    usage?: OpenAIUsageLike;
    model?: string;
  },
  requestedModel: string,
  started: number
): OpenAICallResult {
  return {
    text: json.choices?.[0]?.message?.content || 'No response',
    model: json.model || requestedModel,
    usage: normalizeOpenAIUsage(json.usage),
    latencyMs: Date.now() - started,
    privacyPolicy: 'openai_store_false_api_no_training_default',
  };
}
