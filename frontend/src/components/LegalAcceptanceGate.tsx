import { useState } from 'react';
import { Link } from 'react-router';
import { LegalAcceptScroll } from './LegalAcceptScroll';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT,
  LEGAL_NOTICE_PUBLISHED_AT,
} from '../content/legalDocuments';

const NOTICE_DISMISS_KEY = 'ba_legal_notice_dismissed_2026-08-16.2';

/**
 * Soft banner during the ≥30-day notice window, and a blocking modal after
 * the material-change effective date when acceptance versions are stale.
 */
export function LegalAcceptanceGate() {
  const { user, applyLegalAcceptance } = useAuth();
  const legal = user?.legal;
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState(() => {
    try {
      return localStorage.getItem(NOTICE_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!legal || legal.current) return null;

  async function submitAcceptance() {
    if (!accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{
        success: boolean;
        data: {
          legal: NonNullable<typeof legal>;
        };
      }>('/api/auth/accept-legal', {
        method: 'POST',
        body: JSON.stringify({ termsAccepted: true, privacyAccepted: true }),
      });
      applyLegalAcceptance(res.data.legal);
      try {
        localStorage.removeItem(NOTICE_DISMISS_KEY);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save acceptance');
    } finally {
      setSubmitting(false);
    }
  }

  if (legal.requiresReacceptance) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-ba-ink/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-reaccept-title"
      >
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-ba-line bg-white p-6 shadow-lg">
          <h2 id="legal-reaccept-title" className="font-display text-2xl font-bold">
            Updated Terms and Privacy Policy
          </h2>
          <p className="mt-3 text-base text-ba-ink/80">
            We published updated Terms of Service and a Privacy Policy on{' '}
            {LEGAL_NOTICE_PUBLISHED_AT}. Those updates took effect on{' '}
            {LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT}. Please review and accept the
            current versions to continue using Somtico Business Advisor. Your
            earlier acceptance record is kept; this creates a new acceptance for
            the current versions. Optional learning and benchmark consents stay
            separate.
          </p>
          <LegalAcceptScroll accepted={accepted} onAcceptedChange={setAccepted} />
          {error ? (
            <p className="mt-3 text-base text-ba-warm" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!accepted || submitting}
            onClick={() => void submitAcceptance()}
            className="mt-6 cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Accept and Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (!legal.pendingNotice || dismissedNotice) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <p>
          We updated our{' '}
          <Link className="underline" to="/terms" target="_blank" rel="noreferrer">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link className="underline" to="/privacy" target="_blank" rel="noreferrer">
            Privacy Policy
          </Link>{' '}
          on {LEGAL_NOTICE_PUBLISHED_AT}. Material changes take effect on{' '}
          {LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT}. You can review them now; after
          that date you will need to accept the new versions to keep using the
          app.
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissedNotice(true);
            try {
              localStorage.setItem(NOTICE_DISMISS_KEY, '1');
            } catch {
              /* ignore */
            }
          }}
          className="shrink-0 cursor-pointer text-base underline"
        >
          Dismiss
        </button>
      </div>
      <div className="mx-auto mt-3 max-w-6xl">
        <details className="rounded-md border border-amber-200 bg-white/70 p-3">
          <summary className="cursor-pointer font-semibold">
            Accept Updated Terms Early
          </summary>
          <LegalAcceptScroll accepted={accepted} onAcceptedChange={setAccepted} />
          {error ? (
            <p className="mt-3 text-base text-ba-warm" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!accepted || submitting}
            onClick={() => void submitAcceptance()}
            className="mt-4 cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Accept Updated Terms'}
          </button>
        </details>
      </div>
    </div>
  );
}
