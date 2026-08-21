/**
 * Signed-in session timeouts for a financial product.
 *
 * Idle: PCI DSS 8.2.8 requires re-authentication after 15 minutes idle.
 * Absolute: cap the session even with continuous activity (OWASP ASVS).
 * Warning: client-only countdown before idle logout.
 */

const DEFAULT_IDLE_MINUTES = 15;
const DEFAULT_ABSOLUTE_HOURS = 8;
const DEFAULT_WARNING_SECONDS = 120;
const DEFAULT_TOUCH_THROTTLE_SECONDS = 30;

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type SessionPolicy = {
  idleTimeoutMs: number;
  warningMs: number;
  absoluteTimeoutMs: number;
  touchThrottleMs: number;
  jwtExpiresIn: string;
};

export function getSessionPolicy(): SessionPolicy {
  const idleMinutes = positiveInt(
    process.env.SESSION_IDLE_MINUTES,
    DEFAULT_IDLE_MINUTES
  );
  const absoluteHours = positiveInt(
    process.env.SESSION_ABSOLUTE_HOURS,
    DEFAULT_ABSOLUTE_HOURS
  );
  const warningSeconds = positiveInt(
    process.env.SESSION_WARNING_SECONDS,
    DEFAULT_WARNING_SECONDS
  );
  const touchThrottleSeconds = positiveInt(
    process.env.SESSION_TOUCH_THROTTLE_SECONDS,
    DEFAULT_TOUCH_THROTTLE_SECONDS
  );
  const idleTimeoutMs = idleMinutes * 60 * 1000;
  const warningMs = Math.min(warningSeconds * 1000, idleTimeoutMs);
  return {
    idleTimeoutMs,
    warningMs,
    absoluteTimeoutMs: absoluteHours * 60 * 60 * 1000,
    touchThrottleMs: touchThrottleSeconds * 1000,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || `${absoluteHours}h`,
  };
}

export function publicSessionPolicy(): {
  idleTimeoutMs: number;
  warningMs: number;
  absoluteTimeoutMs: number;
} {
  const policy = getSessionPolicy();
  return {
    idleTimeoutMs: policy.idleTimeoutMs,
    warningMs: policy.warningMs,
    absoluteTimeoutMs: policy.absoluteTimeoutMs,
  };
}
