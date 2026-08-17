/**
 * Lightweight process-local circuit breaker for AI providers.
 * Temporary only — never permanently disables a provider.
 */

import { getAiConfig } from './aiConfig';
import { AiGatewayError } from './aiErrors';

type CircuitState = {
  failures: number;
  openUntil: number | null;
};

const circuits = new Map<string, CircuitState>();

function stateFor(provider: string): CircuitState {
  let s = circuits.get(provider);
  if (!s) {
    s = { failures: 0, openUntil: null };
    circuits.set(provider, s);
  }
  return s;
}

export function resetCircuitBreakersForTests() {
  circuits.clear();
}

export function getCircuitSnapshot(provider: string) {
  const s = stateFor(provider);
  const now = Date.now();
  return {
    provider,
    open: s.openUntil != null && s.openUntil > now,
    openUntil: s.openUntil,
    failures: s.failures,
  };
}

/**
 * Throws AI_CIRCUIT_OPEN when the provider is in cooldown after repeated
 * eligible outage failures. Auth/safety/invalid errors must NOT call
 * recordCircuitFailure.
 */
export function assertCircuitClosed(provider: string): void {
  const s = stateFor(provider);
  if (s.openUntil != null && s.openUntil > Date.now()) {
    throw new AiGatewayError({
      code: 'AI_CIRCUIT_OPEN',
      message: `${provider} temporarily paused after repeated failures`,
      httpStatus: 503,
      retryable: true,
      eligibleForCrossProviderFallback: true,
      details: {
        provider,
        openUntil: new Date(s.openUntil).toISOString(),
      },
    });
  }
  // Cooldown elapsed — allow a probe
  if (s.openUntil != null && s.openUntil <= Date.now()) {
    s.openUntil = null;
    s.failures = 0;
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        JSON.stringify({
          msg: 'ai.circuit.half_open',
          provider,
        })
      );
    }
  }
}

export function recordCircuitSuccess(provider: string): void {
  const s = stateFor(provider);
  s.failures = 0;
  s.openUntil = null;
}

/**
 * Only call for transient/outage failures that are eligible for fallback.
 * Never call for AI_AUTH_FAILED, AI_POLICY_REJECTED, AI_INVALID_REQUEST, etc.
 */
export function recordCircuitFailure(provider: string): void {
  const cfg = getAiConfig();
  const s = stateFor(provider);
  s.failures += 1;
  if (s.failures >= cfg.circuitBreaker.failureThreshold) {
    s.openUntil = Date.now() + cfg.circuitBreaker.cooldownMs;
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        JSON.stringify({
          msg: 'ai.circuit.open',
          provider,
          failures: s.failures,
          openUntil: new Date(s.openUntil).toISOString(),
        })
      );
    }
  }
}
