import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type HelpImproveStatus = {
  enabled: boolean;
  settingVersion: string;
  grantedAt: string | null;
  invite: { show: boolean; snoozedUntil: string | null };
};

/**
 * Soft 30-day re-invitation for organizations with Help Improve Advisor OFF.
 * Never shown when the setting is ON. Dismiss does not grant consent.
 * Turn On is an explicit positive consent action (no extra modal).
 */
export function HelpImproveInvite() {
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [status, setStatus] = useState<HelpImproveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await api<{ success: boolean; data: HelpImproveStatus }>(
        '/api/app/learning/help-improve'
      );
      setStatus(res.data);
    } catch {
      setStatus(null);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage || !status?.invite.show || status.enabled) return null;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; data: HelpImproveStatus }>(
        '/api/app/learning/help-improve/enable',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStatus(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; data: HelpImproveStatus }>(
        '/api/app/learning/help-improve/dismiss-invite',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStatus(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-ba-line bg-ba-mist/60 px-4 py-3 text-base text-ba-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">Help Make Advisor Better</p>
          <p className="mt-1 text-ba-ink/80">
            You can optionally let privacy-safe information from Business Advisor
            help improve Advisor, its playbooks, Somtico-owned models, and
            aggregated industry intelligence. This can include privacy-safe
            signals derived from information already in your Business Advisor
            account and from future activity while the setting stays on. Direct
            personal identifiers are excluded, and you can turn this off at any
            time in your{' '}
            <Link className="text-ba-accent underline" to="/app/settings#privacy">
              Settings
            </Link>
            .{' '}
            <Link className="text-ba-accent underline" to="/privacy">
              Privacy Policy
            </Link>
          </p>
          {error ? (
            <p className="mt-2 text-ba-warm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void enable()}
            className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Turn On
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="cursor-pointer rounded-md border border-ba-line bg-white px-4 py-2 text-base disabled:cursor-not-allowed disabled:opacity-60"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
