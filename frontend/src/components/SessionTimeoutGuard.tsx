import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  AUTH_CHANNEL,
  DEFAULT_SESSION_POLICY,
  LAST_ACTIVITY_KEY,
  readLastActivity,
  writeLastActivity,
  type SessionPolicy,
} from '../lib/session';
import { InactivityWarningModal } from './InactivityWarningModal';

const ACTIVITY_EVENTS = [
  'keydown',
  'mousedown',
  'scroll',
  'touchstart',
  'pointerdown',
] as const;

const TOUCH_EVERY_MS = 60_000;
const TICK_MS = 1_000;

function remainingSeconds(deadline: number) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function SessionTimeoutGuard() {
  const { accessToken, session, logout, applySession } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const warningVisibleRef = useRef(false);
  const lastTouchRef = useRef(0);

  const policy: SessionPolicy = session ?? DEFAULT_SESSION_POLICY;
  const idleMs = policy.idleTimeoutMs || DEFAULT_SESSION_POLICY.idleTimeoutMs;
  const warningMs = policy.warningMs || DEFAULT_SESSION_POLICY.warningMs;
  const expiresAtMs = policy.expiresAt
    ? Date.parse(policy.expiresAt)
    : Number.POSITIVE_INFINITY;

  const signOutIdle = useCallback(() => {
    logout('idle');
  }, [logout]);

  const signOutExpired = useCallback(() => {
    logout('expired');
  }, [logout]);

  const touchServer = useCallback(async () => {
    const now = Date.now();
    if (now - lastTouchRef.current < TOUCH_EVERY_MS) return;
    lastTouchRef.current = now;
    try {
      const res = await api<{
        success: boolean;
        data: { session: SessionPolicy };
      }>('/api/auth/touch', { method: 'POST' });
      if (res.data.session) applySession(res.data.session);
    } catch {
      /* authenticateToken or api() will end the session when it is invalid. */
    }
  }, [applySession]);

  const noteActivity = useCallback(() => {
    if (warningVisibleRef.current) return;
    writeLastActivity();
    void touchServer();
  }, [touchServer]);

  const extendSession = useCallback(() => {
    warningVisibleRef.current = false;
    setShowWarning(false);
    writeLastActivity();
    lastTouchRef.current = 0;
    void touchServer();
  }, [touchServer]);

  useEffect(() => {
    warningVisibleRef.current = showWarning;
  }, [showWarning]);

  useEffect(() => {
    if (!accessToken) {
      setShowWarning(false);
      return;
    }
    writeLastActivity();
    lastTouchRef.current = Date.now();

    const onActivity = () => noteActivity();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
        warningVisibleRef.current = false;
        setShowWarning(false);
      }
    };
    window.addEventListener('storage', onStorage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'activity') {
          warningVisibleRef.current = false;
          setShowWarning(false);
        }
      };
    } catch {
      channel = null;
    }

    const tick = () => {
      if (Date.now() >= expiresAtMs) {
        signOutExpired();
        return;
      }
      const idleDeadline = readLastActivity() + idleMs;
      const left = remainingSeconds(idleDeadline);
      if (left <= 0) {
        signOutIdle();
        return;
      }
      if (left * 1000 <= warningMs) {
        setShowWarning(true);
        setSecondsLeft(left);
      } else if (!warningVisibleRef.current) {
        setShowWarning(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, TICK_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
      channel?.close();
    };
  }, [
    accessToken,
    idleMs,
    warningMs,
    expiresAtMs,
    noteActivity,
    signOutIdle,
    signOutExpired,
  ]);

  if (!accessToken || !showWarning) return null;

  return (
    <InactivityWarningModal
      remainingSeconds={secondsLeft}
      onExtendSession={extendSession}
      onLogout={() => logout('logout')}
    />
  );
}
