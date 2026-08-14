import { useEffect, useState } from 'react';
import { api, money } from '../lib/api';

interface ActionRow {
  id: string;
  title: string;
  description: string;
  status: string;
  source: string;
  impactType: 'SAVINGS' | 'REVENUE' | null;
  expectedImpactCents: number | null;
  expectedImpactNote: string | null;
  realizedImpactCents: number | null;
  realizedNote: string | null;
  realizedSource: 'MEASURED' | 'USER_CONFIRMED' | null;
  verificationDueAt: string | null;
  completedAt: string | null;
}

interface ImpactSummary {
  verified: {
    savedCents: number;
    earnedCents: number;
    otherCents: number;
    totalCents: number;
    actionCount: number;
  };
  thisMonth: { totalCents: number };
  estimatedPendingCents: number;
  pipelineExpectedCents: number;
  pipelineCount: number;
  awaitingConfirmationCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  DISMISSED: 'Dismissed',
};

function realizedBadge(source: ActionRow['realizedSource']): string {
  if (source === 'MEASURED') return 'Verified from Your Data';
  if (source === 'USER_CONFIRMED') return 'Confirmed by You';
  return '';
}

export function ActionsPage() {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [summary, setSummary] = useState<ImpactSummary | null>(null);
  const [insightsMsg, setInsightsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [confirmType, setConfirmType] = useState<'SAVINGS' | 'REVENUE'>('SAVINGS');
  const [confirmNote, setConfirmNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [actionsRes, summaryRes] = await Promise.all([
      api<{ success: boolean; data: ActionRow[] }>('/api/app/actions'),
      api<{ success: boolean; data: ImpactSummary }>('/api/app/impact/summary'),
    ]);
    setRows(actionsRes.data);
    setSummary(summaryRes.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, []);

  async function runInsights() {
    setError(null);
    try {
      const res = await api<{
        success: boolean;
        data: { insights: unknown[]; recommendations: unknown[] };
      }>('/api/app/insights/run', { method: 'POST' });
      setInsightsMsg(
        `Generated ${res.data.insights.length} insights and ${res.data.recommendations.length} recommendations`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insights run failed');
    }
  }

  async function updateStatus(id: string, status: string) {
    setError(null);
    try {
      await api(`/api/app/actions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (status === 'COMPLETED') {
        setInsightsMsg(
          'Action completed. Confirm what it saved or earned below, or leave it and Nonso will measure or ask you in 30 days.'
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function startConfirm(row: ActionRow) {
    setConfirmingId(row.id);
    setConfirmAmount(
      row.expectedImpactCents != null
        ? (row.expectedImpactCents / 100).toFixed(2)
        : ''
    );
    setConfirmType(row.impactType === 'REVENUE' ? 'REVENUE' : 'SAVINGS');
    setConfirmNote('');
  }

  async function submitConfirm(id: string, noImpact: boolean) {
    const cents = noImpact ? 0 : Math.round(Number(confirmAmount) * 100);
    if (!noImpact && (!Number.isFinite(cents) || cents < 0)) {
      setError('Enter a valid dollar amount');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/app/actions/${id}/impact`, {
        method: 'POST',
        body: JSON.stringify({
          realizedImpactCents: cents,
          impactType: confirmType,
          note: confirmNote || undefined,
        }),
      });
      setConfirmingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record impact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Action Centre</h1>
        <button
          type="button"
          onClick={() => void runInsights()}
          className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
        >
          Run Insights
        </button>
      </div>

      {summary && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base font-semibold text-ba-ink/70">Verified Saved</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {money(summary.verified.savedCents + summary.verified.otherCents)}
            </p>
          </div>
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base font-semibold text-ba-ink/70">Verified Earned</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {money(summary.verified.earnedCents)}
            </p>
          </div>
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base font-semibold text-ba-ink/70">
              Estimated Awaiting Verification
            </p>
            <p className="mt-1 font-display text-2xl font-bold">
              {money(summary.estimatedPendingCents)}
            </p>
          </div>
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base font-semibold text-ba-ink/70">Open Pipeline</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {money(summary.pipelineExpectedCents)}
            </p>
            <p className="mt-1 text-base text-ba-ink/60">
              {summary.pipelineCount} open action{summary.pipelineCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}
      {summary && summary.awaitingConfirmationCount > 0 && (
        <p className="mt-4 border border-ba-line bg-ba-mist px-4 py-3 text-base">
          {summary.awaitingConfirmationCount} completed action
          {summary.awaitingConfirmationCount === 1 ? ' is' : 's are'} awaiting your
          impact confirmation below. Only verified amounts count toward your totals.
        </p>
      )}

      {insightsMsg && <p className="mt-3 text-base text-ba-accent">{insightsMsg}</p>}
      {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}

      <div className="mt-8 space-y-4">
        {rows.length === 0 && (
          <p className="text-base">No recommendations yet. Run insights to generate some.</p>
        )}
        {rows.map((r) => {
          const awaitingConfirmation =
            r.status === 'COMPLETED' && r.realizedSource == null;
          return (
            <article key={r.id} className="border border-ba-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{r.title}</h2>
                  <p className="mt-2 text-base text-ba-ink/70">{r.description}</p>
                  <p className="mt-2 text-base">
                    {r.impactType && (
                      <span className="mr-2 rounded bg-ba-mist px-2 py-0.5 font-semibold">
                        {r.impactType === 'SAVINGS' ? 'Savings' : 'Revenue'}
                      </span>
                    )}
                    Expected impact:{' '}
                    {r.expectedImpactCents != null
                      ? money(r.expectedImpactCents)
                      : 'Qualitative'}
                    {r.expectedImpactNote ? ` — ${r.expectedImpactNote}` : ''}
                  </p>
                  {r.realizedSource && r.realizedImpactCents != null && (
                    <p className="mt-2 text-base">
                      Realized {money(r.realizedImpactCents)}{' '}
                      <span className="rounded bg-ba-accent/10 px-2 py-0.5 font-semibold text-ba-accent">
                        {realizedBadge(r.realizedSource)}
                      </span>
                      {r.realizedNote ? ` — ${r.realizedNote}` : ''}
                    </p>
                  )}
                  {r.source === 'ADVISOR_CHAT' && (
                    <p className="mt-2 text-base text-ba-ink/60">
                      Tracked from a Nonso conversation
                    </p>
                  )}
                </div>
                <span className="rounded bg-ba-mist px-3 py-1 text-base font-semibold">
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={r.status === s}
                    onClick={() => void updateStatus(r.id, s)}
                    className="cursor-pointer rounded border border-ba-line px-3 py-2 text-base hover:bg-ba-mist disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>

              {awaitingConfirmation && confirmingId !== r.id && (
                <div className="mt-4 border-t border-ba-line pt-4">
                  <p className="text-base text-ba-ink/70">
                    What did this action save or earn? Nonso will also try to
                    measure it from your data after the verification window.
                  </p>
                  <button
                    type="button"
                    onClick={() => startConfirm(r)}
                    className="mt-2 cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
                  >
                    Confirm Impact
                  </button>
                </div>
              )}

              {confirmingId === r.id && (
                <div className="mt-4 border-t border-ba-line pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-base">
                      <span className="mb-1 block font-semibold">Amount (CAD)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={confirmAmount}
                        onChange={(e) => setConfirmAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-40 rounded-md border-ba-line text-base"
                      />
                    </label>
                    <label className="text-base">
                      <span className="mb-1 block font-semibold">Type</span>
                      <select
                        value={confirmType}
                        onChange={(e) =>
                          setConfirmType(e.target.value as 'SAVINGS' | 'REVENUE')
                        }
                        className="rounded-md border-ba-line text-base"
                      >
                        <option value="SAVINGS">Money Saved</option>
                        <option value="REVENUE">Money Earned</option>
                      </select>
                    </label>
                    <label className="min-w-60 flex-1 text-base">
                      <span className="mb-1 block font-semibold">Note (Optional)</span>
                      <input
                        type="text"
                        value={confirmNote}
                        onChange={(e) => setConfirmNote(e.target.value)}
                        maxLength={500}
                        placeholder="e.g. Cancelled two unused software seats"
                        className="w-full rounded-md border-ba-line text-base placeholder:text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void submitConfirm(r.id, false)}
                      className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Save Impact'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void submitConfirm(r.id, true)}
                      className="cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base hover:bg-ba-mist disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      No Measurable Impact
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setConfirmingId(null)}
                      className="cursor-pointer rounded-md px-4 py-2 text-base text-ba-ink/70 hover:bg-ba-mist disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
