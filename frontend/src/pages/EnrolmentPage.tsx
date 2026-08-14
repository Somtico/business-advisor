import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { AnalysisProgress, SkeletonCard } from '../components/AnalysisProgress';

const STEPS = [
  'Checking fill, spare seats, and waitlist pressure',
  'Checking trial conversion and enrolment velocity',
  'Checking churn and cash room for a paid test',
  'Reading what you have already tried and the results',
];

type TacticKey =
  | 'TRIAL_FOLLOWUP'
  | 'FAMILY_REFERRAL'
  | 'SCHOOL_OUTREACH'
  | 'OPEN_HOUSE'
  | 'SCHEDULE_CHANGE'
  | 'WAITLIST'
  | 'PRICE_PROMO'
  | 'SOCIAL_ORGANIC'
  | 'PAID_ADS'
  | 'OTHER';

type Outcome = 'HELPED' | 'NO_EFFECT' | 'HURT' | 'UNKNOWN';
type CostBand = 'FREE' | 'LOW' | 'PAID';

interface TacticCatalogItem {
  key: TacticKey;
  label: string;
  typicalCost: CostBand;
}

interface TacticTried {
  id: string;
  tacticKey: TacticKey;
  otherLabel: string | null;
  resultSummary: string;
  outcome: Outcome;
  costBand: CostBand;
  shareAnonymized: boolean;
  createdAt: string;
}

interface Guidance {
  leak: string;
  leakLabel: string;
  note: string;
  missingData: string[];
  utilization: number | null;
  spareSeats: number;
  totalActive: number;
  totalCapacity: number | null;
  conversionRate: number;
  trialCount: number;
  recentStarts: number;
  priorStarts: number;
  churnRate: number;
  cheapNextSteps: Array<{ title: string; detail: string }>;
  paidTest: { eligible: boolean; monitorWeeks: number | null; note: string };
  tacticsTried: TacticTried[];
  askTriedAndResults: boolean;
  peerPatterns: Array<{
    tacticKey: string;
    label: string;
    helped: number;
    total: number;
  }>;
  tacticCatalog: TacticCatalogItem[];
  programmes: Array<{
    id: string;
    name: string;
    activeEnrolments: number;
    capacity: number | null;
    utilization: number | null;
    trials: number;
  }>;
  disclaimer: string;
  privacy: { anonymizedSharing: string };
}

const OUTCOME_LABELS: Record<Outcome, string> = {
  HELPED: 'Helped',
  NO_EFFECT: 'No Clear Effect',
  HURT: 'Made Things Worse',
  UNKNOWN: 'Too Soon to Say',
};

const COST_LABELS: Record<CostBand, string> = {
  FREE: 'Free (time only)',
  LOW: 'Low cost',
  PAID: 'Paid spend',
};

const LEAK_STYLES: Record<string, string> = {
  INSUFFICIENT_DATA: 'bg-ba-mist text-ba-ink',
  FULL_ROOM: 'bg-ba-accent/10 text-ba-accent',
  CONVERSION_LEAK: 'bg-amber-100 text-amber-800',
  CHURN_LEAK: 'bg-ba-warm/10 text-ba-warm',
  VELOCITY_DOWN: 'bg-amber-100 text-amber-800',
  UNDERFILLED: 'bg-ba-ink/10 text-ba-ink',
  STABLE: 'bg-ba-accent/10 text-ba-accent',
};

export function EnrolmentPage() {
  const [data, setData] = useState<Guidance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tacticKey, setTacticKey] = useState<TacticKey>('TRIAL_FOLLOWUP');
  const [otherLabel, setOtherLabel] = useState('');
  const [resultSummary, setResultSummary] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('UNKNOWN');
  const [costBand, setCostBand] = useState<CostBand>('FREE');
  const [shareAnonymized, setShareAnonymized] = useState(false);

  async function load() {
    const res = await api<{ success: boolean; data: Guidance }>(
      '/api/app/enrolment/guidance'
    );
    setData(res.data);
    const first = res.data.tacticCatalog[0];
    if (first) {
      setTacticKey(first.key);
      setCostBand(first.typicalCost);
    }
  }

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : 'Load failed')
    );
  }, []);

  function onTacticChange(key: TacticKey) {
    setTacticKey(key);
    const item = data?.tacticCatalog.find((t) => t.key === key);
    if (item) setCostBand(item.typicalCost);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/app/enrolment/tactics', {
        method: 'POST',
        body: JSON.stringify({
          tacticKey,
          otherLabel: tacticKey === 'OTHER' ? otherLabel : null,
          resultSummary,
          outcome,
          costBand,
          shareAnonymized,
        }),
      });
      setResultSummary('');
      setOtherLabel('');
      setShareAnonymized(false);
      setMessage('Recorded. Nonso will use this result the next time it advises.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await api(`/api/app/enrolment/tactics/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  if (error && !data) return <p className="text-base text-ba-warm">{error}</p>;
  if (!data) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">Enrolment Advisor</h1>
        <p className="mt-2 max-w-3xl text-base text-ba-ink/70">
          Nonso is reading fill, conversion, and what you have already tried.
        </p>
        <div className="mt-8 space-y-4">
          <AnalysisProgress steps={STEPS} />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const catalog = data.tacticCatalog;
  const tacticLabel = (key: TacticKey, other: string | null) =>
    key === 'OTHER' && other
      ? other
      : catalog.find((t) => t.key === key)?.label || key;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Enrolment Advisor</h1>
      <p className="mt-2 max-w-3xl text-base text-ba-ink/70">
        Nonso names the leak from your records, then suggests cheap next steps
        first. A paid test appears only when conversion is healthy, seats are
        open, and cash can absorb it. Record what you tried and the result you
        got; empty seats alone are not a marketing plan.
      </p>

      {message && <p className="mt-3 text-base text-ba-accent">{message}</p>}
      {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}

      <article className="mt-8 border border-ba-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">Diagnosis</h2>
          <span
            className={`rounded px-3 py-1 text-base font-semibold ${
              LEAK_STYLES[data.leak] || 'bg-ba-mist'
            }`}
          >
            {data.leakLabel}
          </span>
        </div>
        <p className="mt-3 text-base">{data.note}</p>
        <p className="mt-3 text-base text-ba-ink/70">
          {data.totalActive} paid enrolment{data.totalActive === 1 ? '' : 's'}
          {data.totalCapacity != null ? ` · ${data.totalCapacity} seats` : ''}
          {data.utilization != null
            ? ` · ${(data.utilization * 100).toFixed(0)}% full`
            : ''}
          {` · ${data.spareSeats} spare seat${data.spareSeats === 1 ? '' : 's'}`}
          {` · conversion ${(data.conversionRate * 100).toFixed(0)}% on ${data.trialCount} trial${data.trialCount === 1 ? '' : 's'}`}
        </p>
        {data.programmes.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.programmes.map((p) => (
              <li key={p.id} className="border border-ba-line p-3 text-base">
                <span className="font-semibold">{p.name}</span>
                {': '}
                {p.activeEnrolments} enrolled
                {p.capacity != null ? ` / ${p.capacity}` : ''}
                {p.utilization != null
                  ? ` (${(p.utilization * 100).toFixed(0)}%)`
                  : ''}
                {p.trials > 0 ? ` · ${p.trials} trial${p.trials === 1 ? '' : 's'}` : ''}
              </li>
            ))}
          </ul>
        )}
      </article>

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="text-xl font-semibold">Cheap Next Steps</h2>
        <ol className="mt-3 space-y-3">
          {data.cheapNextSteps.map((step, i) => (
            <li key={step.title} className="border border-ba-line p-3">
              <p className="font-semibold">
                {String(i + 1).padStart(2, '0')} · {step.title}
              </p>
              <p className="mt-1 text-base text-ba-ink/80">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {data.paidTest.eligible && (
        <section className="mt-6 border border-ba-ink/20 bg-ba-mist/50 p-5">
          <h2 className="text-xl font-semibold">
            Optional {data.paidTest.monitorWeeks}-Week Paid Test
          </h2>
          <p className="mt-2 text-base">{data.paidTest.note}</p>
        </section>
      )}
      {!data.paidTest.eligible && (
        <p className="mt-6 text-base text-ba-ink/70">{data.paidTest.note}</p>
      )}

      {data.missingData.length > 0 && (
        <section className="mt-6 border border-ba-line bg-white p-5">
          <h2 className="text-xl font-semibold">What Nonso Still Needs</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-base">
            {data.missingData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {data.peerPatterns.length > 0 && (
        <section className="mt-6 border border-ba-line bg-white p-5">
          <h2 className="text-xl font-semibold">What Other Centres Reported</h2>
          <p className="mt-2 text-base text-ba-ink/70">
            De-identified counts only, shown after at least 8 similar reports.
            This is not a promise the same tactic will work here.
          </p>
          <ul className="mt-3 space-y-2 text-base">
            {data.peerPatterns.map((p) => (
              <li key={p.tacticKey}>
                {p.label}: helped in {p.helped} of {p.total} reports for this
                leak type.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="text-xl font-semibold">What Have You Tried, and What Result Did You Get?</h2>
        <p className="mt-2 text-base text-ba-ink/70">
          Include the result (who responded, who enrolled, what they said about
          time or price). Do not include student or family names.
        </p>
        <form onSubmit={(e) => void onSave(e)} className="mt-4 space-y-4">
          <label className="block text-base font-semibold">
            Tactic
            <select
              value={tacticKey}
              onChange={(e) => onTacticChange(e.target.value as TacticKey)}
              className="mt-1 w-full rounded-md border-ba-line text-base"
            >
              {catalog.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {tacticKey === 'OTHER' && (
            <label className="block text-base font-semibold">
              Describe the Tactic
              <input
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                maxLength={80}
                required
                className="mt-1 w-full rounded-md border-ba-line text-base"
              />
            </label>
          )}
          <label className="block text-base font-semibold">
            Result You Got
            <textarea
              value={resultSummary}
              onChange={(e) => setResultSummary(e.target.value)}
              required
              rows={4}
              maxLength={2000}
              placeholder="e.g. Followed up with 6 trial families; 1 enrolled, 3 said the Tuesday slot does not work."
              className="mt-1 w-full rounded-md border-ba-line text-base placeholder:text-sm"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-base font-semibold">
              Outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as Outcome)}
                className="mt-1 w-full rounded-md border-ba-line text-base"
              >
                {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((k) => (
                  <option key={k} value={k}>
                    {OUTCOME_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-base font-semibold">
              Cost
              <select
                value={costBand}
                onChange={(e) => setCostBand(e.target.value as CostBand)}
                className="mt-1 w-full rounded-md border-ba-line text-base"
              >
                {(Object.keys(COST_LABELS) as CostBand[]).map((k) => (
                  <option key={k} value={k}>
                    {COST_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={shareAnonymized}
              onChange={(e) => setShareAnonymized(e.target.checked)}
              className="mt-1 cursor-pointer rounded border-ba-line"
            />
            <span>
              Share a de-identified copy (tactic type, cost band, outcome, and
              leak type only; no notes, names, or organization id) so Nonso can
              improve the playbook for other centres. Off by default.{' '}
              <Link className="text-ba-accent underline" to="/privacy">
                Privacy Policy
              </Link>
            </span>
          </label>
          <p className="text-sm text-ba-ink/60">{data.privacy.anonymizedSharing}</p>
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Tactic and Result'}
          </button>
        </form>

        {data.tacticsTried.length > 0 && (
          <ul className="mt-6 space-y-3">
            {data.tacticsTried.map((t) => (
              <li key={t.id} className="border border-ba-line p-3 text-base">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">
                    {tacticLabel(t.tacticKey, t.otherLabel)} ·{' '}
                    {OUTCOME_LABELS[t.outcome]} · {COST_LABELS[t.costBand]}
                  </p>
                  <button
                    type="button"
                    onClick={() => void onDelete(t.id)}
                    className="cursor-pointer text-base text-ba-warm underline"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-1 text-ba-ink/80">{t.resultSummary}</p>
                <p className="mt-1 text-sm text-ba-ink/60">
                  {new Date(t.createdAt).toLocaleDateString('en-CA')}
                  {t.shareAnonymized ? ' · de-identified copy shared' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 max-w-3xl text-sm text-ba-ink/60">{data.disclaimer}</p>
    </div>
  );
}
