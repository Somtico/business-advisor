/**
 * Structured AI gateway errors — safe for API clients (no secrets / prompts).
 */

export type AiErrorCode =
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_REQUEST_LIMIT_REACHED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_POLICY_REJECTED'
  | 'AI_CONTEXT_TOO_LARGE'
  | 'AI_INVALID_REQUEST'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'AI_AUTH_FAILED'
  | 'AI_TIMEOUT'
  | 'AI_CIRCUIT_OPEN';

export class AiGatewayError extends Error {
  readonly code: AiErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  /** When true, a different provider may be tried once (never for auth/safety). */
  readonly eligibleForCrossProviderFallback: boolean;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    code: AiErrorCode;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
    eligibleForCrossProviderFallback?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'AiGatewayError';
    this.code = params.code;
    this.httpStatus = params.httpStatus ?? 503;
    this.retryable = params.retryable ?? false;
    this.eligibleForCrossProviderFallback =
      params.eligibleForCrossProviderFallback ?? false;
    this.details = params.details;
  }

  toApiError() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function isRetryableProviderFailure(
  status: number,
  bodyText: string
): boolean {
  if (status === 408 || status === 429 || status >= 500) return true;
  if (/timeout|temporarily|overloaded|rate.?limit|try again/i.test(bodyText)) {
    return true;
  }
  return false;
}

function looksLikeSafetyRefusal(status: number, bodyText: string): boolean {
  if (status === 400 || status === 422) {
    return /safety|content.?policy|refus|harmful|blocked|moderation|violation/i.test(
      bodyText
    );
  }
  return false;
}

/**
 * Central classification of provider HTTP failures.
 * Cross-provider fallback eligibility is decided here — not in feature code.
 */
export function classifyProviderHttpError(
  provider: string,
  status: number,
  bodyText: string
): AiGatewayError {
  if (status === 401 || status === 403) {
    return new AiGatewayError({
      code: 'AI_AUTH_FAILED',
      message: `${provider} authentication or permission failed`,
      httpStatus: 503,
      retryable: false,
      eligibleForCrossProviderFallback: false,
      details: { provider, status },
    });
  }

  if (looksLikeSafetyRefusal(status, bodyText)) {
    return new AiGatewayError({
      code: 'AI_POLICY_REJECTED',
      message: `${provider} refused the request under a safety policy`,
      httpStatus: 400,
      retryable: false,
      eligibleForCrossProviderFallback: false,
      details: { provider, status },
    });
  }

  if (status === 404 || /model.?not.?found|invalid.?model/i.test(bodyText)) {
    return new AiGatewayError({
      code: 'AI_MODEL_UNAVAILABLE',
      message: `${provider} model unavailable`,
      httpStatus: 503,
      retryable: false,
      // Model ID misconfig should not drain the fallback provider
      eligibleForCrossProviderFallback: false,
      details: { provider, status },
    });
  }

  if (status === 400 && /context|too long|maximum|token/i.test(bodyText)) {
    return new AiGatewayError({
      code: 'AI_CONTEXT_TOO_LARGE',
      message: 'Prompt exceeded the model context limit',
      httpStatus: 400,
      retryable: false,
      eligibleForCrossProviderFallback: false,
    });
  }

  if (status === 400) {
    return new AiGatewayError({
      code: 'AI_INVALID_REQUEST',
      message: `${provider} rejected the request`,
      httpStatus: 400,
      retryable: false,
      eligibleForCrossProviderFallback: false,
      details: { provider, status },
    });
  }

  const retryable = isRetryableProviderFailure(status, bodyText);
  return new AiGatewayError({
    code: status === 408 ? 'AI_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
    message: `${provider} is temporarily unavailable`,
    httpStatus: 503,
    retryable,
    eligibleForCrossProviderFallback: retryable,
    details: { provider, status },
  });
}

/** True when OpenAI (or other fallback) may be tried after a primary failure. */
export function isEligibleForCrossProviderFallback(
  err: unknown
): boolean {
  if (!(err instanceof AiGatewayError)) return false;
  if (err.eligibleForCrossProviderFallback) return true;
  // Explicit allow-list of transient availability codes
  return (
    err.code === 'AI_PROVIDER_UNAVAILABLE' ||
    err.code === 'AI_TIMEOUT' ||
    err.code === 'AI_CIRCUIT_OPEN'
  );
}
