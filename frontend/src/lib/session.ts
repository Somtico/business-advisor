export const SESSION_ENDED_EVENT = 'ba:session-ended';
export const LAST_ACTIVITY_KEY = 'ba_last_activity';
export const AUTH_CHANNEL = 'ba-auth';

export const SESSION_END_CODES = new Set(['SESSION_IDLE', 'SESSION_EXPIRED']);

export type SessionEndReason = 'idle' | 'expired' | 'logout';

export type SessionPolicy = {
  idleTimeoutMs: number;
  warningMs: number;
  absoluteTimeoutMs: number;
  lastActivityAt?: string;
  expiresAt?: string;
};

/** PCI DSS 8.2.8 idle window plus an 8-hour absolute cap. */
export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleTimeoutMs: 15 * 60 * 1000,
  warningMs: 2 * 60 * 1000,
  absoluteTimeoutMs: 8 * 60 * 60 * 1000,
};

export function reasonFromCode(code?: string): SessionEndReason {
  if (code === 'SESSION_IDLE') return 'idle';
  return 'expired';
}

export function emitSessionEnded(reason: SessionEndReason) {
  window.dispatchEvent(
    new CustomEvent(SESSION_ENDED_EVENT, { detail: { reason } })
  );
}

export function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

export function writeLastActivity(at = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    /* private mode */
  }
}

export function clearLastActivity() {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}
