import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, money } from '../lib/api';
import { AnalysisProgress, SkeletonCard } from '../components/AnalysisProgress';

const PRICING_ANALYSIS_STEPS = [
  'Checking programme prices and capacity',
  'Checking active enrolments',
  "Checking this week's scheduled sessions",
  'Checking instructor wage profiles',
  'Checking expenses and subscriptions for overhead',
  'Checking utilization, conversion, and spare capacity',
  'Calculating cost floors and recommended prices',
];

interface MissingDataItem {
  key: string;
  label: string;
  detail: string;
  fixPath: string;
}

interface PricingSessionEvidence {
  sessionId: string;
  startsAt: string;
  hours: number;
  instructor: string;
  costCents: number;
}

interface PricingEvidence {
  method: string;
  weeklyHours: number;
  weeklyLabourCents: number;
  monthlyDirectLabourCents: number;
  overheadMonthlyCents: number;
  totalActiveStudents: number;
  overheadPerStudentCents: number;
  targetMarginPercent: number;
  sessions: PricingSessionEvidence[];
  priceTest?: {
    clearlyAbove: boolean;
    premiumRatio: number;
    premiumCents: number;
    persistentlyLow: boolean;
    utilizationNow: number | null;
    utilization28dAgo: number | null;
    paidEnrolments28dAgo: number;
    hasPersistenceWindow: boolean;
    spareSeats: number;
    hasSpareCapacity: boolean;
    demandWeak: boolean;
    demandSignals: Array<{
      key: string;
      label: string;
      detail: string;
      weak: boolean;
    }>;
    testPriceCents: number;
    monitorWeeks: number;
    stillClearsFloor: boolean;
    eligible: boolean;
  };
}

interface ProgrammeGuidance {
  programmeId: string;
  name: string;
  priceCents: number | null;
  activeEnrolments: number;
  capacity: number | null;
  utilization: number | null;
  status: 'READY' | 'INSUFFICIENT_DATA';
  missingData: MissingDataItem[];
  monthlyDirectLabourCents: number | null;
  overheadPerStudentCents: number | null;
  floorAtCurrentFillCents: number | null;
  floorAtCapacityCents: number | null;
  recommendedPriceCents: number | null;
  testPriceCents: number | null;
  priceTestMonitorWeeks: number | null;
  verdict: 'BELOW_COST' | 'BELOW_TARGET' | 'ON_TRACK' | 'ABOVE_TARGET' | null;
  note: string | null;
  evidence: PricingEvidence | null;
}

interface Guidance {
  targetMarginPercent: number;
  totalActiveStudents: number;
  overheadMonthlyCents: number;
  programmes: ProgrammeGuidance[];
  disclaimer: string;
}

interface StaffOption {
  id: string;
  firstName: string;
  lastName: string;
}

const VERDICT_STYLES: Record<string, string> = {
  BELOW_COST: 'bg-ba-warm/10 text-ba-warm',
  BELOW_TARGET: 'bg-amber-100 text-amber-800',
  ON_TRACK: 'bg-ba-accent/10 text-ba-accent',
  ABOVE_TARGET: 'bg-ba-ink/10 text-ba-ink',
};

const VERDICT_LABELS: Record<string, string> = {
  BELOW_COST: 'Below Cost',
  BELOW_TARGET: 'Below Target Margin',
  ON_TRACK: 'On Track',
  ABOVE_TARGET: 'Above Target: Price Test',
};

function sessionWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Collapsed by default so the verdict stays the focus; expands to show every
 * number and the margin applied, step by step.
 */
function CalculationBreakdown({ p }: { p: ProgrammeGuidance }) {
  const ev = p.evidence;
  if (!ev) return null;
  const marginCents =
    (p.recommendedPriceCents ?? 0) - (p.floorAtCurrentFillCents ?? 0);
  return (
    <details className="mt-4 border border-ba-line bg-ba-mist/30">
      <summary className="cursor-pointer select-none px-4 py-3 text-base font-semibold hover:bg-ba-mist/60">
        How This Was Calculated
      </summary>
      <div className="space-y-4 border-t border-ba-line px-4 py-4 text-base">
        <div>
          <p className="font-semibold">
            Step 1 — Direct Labour From This Week's Sessions
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-6">
            {ev.sessions.map((s) => (
              <li key={s.sessionId}>
                {sessionWhen(s.startsAt)} · {s.instructor}: {s.hours} h ={' '}
                <strong>{money(s.costCents)}</strong> session labour
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Weekly total: <strong>{money(ev.weeklyLabourCents)}</strong> (
            {ev.weeklyHours} h)
          </p>
        </div>

        <p>
          <span className="font-semibold">Step 2 — Monthly Direct Labour:</span>{' '}
          {money(ev.weeklyLabourCents)} × 4.345 weeks/month ={' '}
          <strong>{money(ev.monthlyDirectLabourCents)}</strong>
        </p>

        <p>
          <span className="font-semibold">Step 3 — Overhead Per Student:</span>{' '}
          {money(ev.overheadMonthlyCents)} monthly expenses and subscriptions ÷{' '}
          {ev.totalActiveStudents} active student
          {ev.totalActiveStudents === 1 ? '' : 's'} across your centre ={' '}
          <strong>{money(ev.overheadPerStudentCents)}</strong>
        </p>

        <p>
          <span className="font-semibold">
            Step 4 — Cost Floor at Current Fill:
          </span>{' '}
          {money(ev.monthlyDirectLabourCents)} ÷ {p.activeEnrolments} enrolment
          {p.activeEnrolments === 1 ? '' : 's'} +{' '}
          {money(ev.overheadPerStudentCents)} overhead ={' '}
          <strong>{money(p.floorAtCurrentFillCents)}</strong>/student/month.
          This is the cheapest you can afford to charge today without losing
          money per student.
        </p>

        {p.floorAtCapacityCents != null && p.capacity != null && (
          <p>
            <span className="font-semibold">
              Step 5 — Cost Floor at Full Capacity:
            </span>{' '}
            {money(ev.monthlyDirectLabourCents)} ÷ {p.capacity} seats +{' '}
            {money(ev.overheadPerStudentCents)} overhead ={' '}
            <strong>{money(p.floorAtCapacityCents)}</strong>/student/month if
            every seat were filled.
          </p>
        )}

        <p>
          <span className="font-semibold">
            Step {p.floorAtCapacityCents != null ? 6 : 5} — Recommended Price:
          </span>{' '}
          {money(p.floorAtCurrentFillCents)} floor +{' '}
          <strong>{ev.targetMarginPercent}% target margin</strong> (
          {money(marginCents)} added) ={' '}
          <strong>{money(p.recommendedPriceCents)}</strong>/student/month. The
          margin is your organization's configurable target, not a guess.
        </p>

        {ev.priceTest && (
          <div>
            <p className="font-semibold">
              Step {p.floorAtCapacityCents != null ? 7 : 6} — Price Test Gate:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-6">
              <li>
                Price vs recommended:{' '}
                {ev.priceTest.clearlyAbove
                  ? `current price is ${((ev.priceTest.premiumRatio - 1) * 100).toFixed(0)}% above recommended (${money(ev.priceTest.premiumCents)} more)`
                  : 'current price is not clearly above recommended (needs 15% and at least $10.00)'}
              </li>
              <li>
                Persistent utilization:{' '}
                {ev.priceTest.persistentlyLow
                  ? `under 60% now (${ev.priceTest.utilizationNow != null ? `${(ev.priceTest.utilizationNow * 100).toFixed(0)}%` : '—'}) and 28 days ago (${ev.priceTest.utilization28dAgo != null ? `${(ev.priceTest.utilization28dAgo * 100).toFixed(0)}%` : '—'})`
                  : 'fill has not been under 60% for at least 4 weeks, so empty seats are not treated as persistent'}
              </li>
              <li>
                Spare capacity:{' '}
                {ev.priceTest.hasSpareCapacity
                  ? `${ev.priceTest.spareSeats} open seat${ev.priceTest.spareSeats === 1 ? '' : 's'} (no waitlist implied by a full room)`
                  : 'no spare seats recorded, so a price test is not offered'}
              </li>
              <li>
                Demand signals:
                {ev.priceTest.demandSignals.length === 0 ? (
                  ' none on record with enough sample (trials, enquiries, or prior-period starts). Empty seats alone are not enough.'
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-6">
                    {ev.priceTest.demandSignals.map((s) => (
                      <li key={s.key}>
                        {s.label}: {s.detail} {s.weak ? '(weak)' : '(not weak)'}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
            {ev.priceTest.eligible && (
              <p className="mt-2">
                Suggested test: <strong>{money(ev.priceTest.testPriceCents)}</strong>
                /month for {ev.priceTest.monitorWeeks} weeks, still above the
                cost floor. This is a test to watch, not a claim that price caused
                empty seats.
              </p>
            )}
          </div>
        )}

        <p className="text-sm text-ba-ink/60">
          Salaried instructors are expressed hourly at 2,080 hours/year. Every
          input above comes from your recorded sessions, wages, enrolments, and
          expenses — update those records and this calculation follows. Household
          income is not part of this calculation.
        </p>
      </div>
    </details>
  );
}

export function PricingPage() {
  const [data, setData] = useState<Guidance | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionFormId, setSessionFormId] = useState<string | null>(null);
  const [sessionStaffId, setSessionStaffId] = useState('');
  const [sessionHours, setSessionHours] = useState('1');
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [g, s] = await Promise.all([
      api<{ success: boolean; data: Guidance }>('/api/app/pricing/guidance'),
      api<{ success: boolean; data: StaffOption[] }>('/api/app/staff'),
    ]);
    setData(g.data);
    setStaff(s.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, []);

  async function addSession(e: FormEvent, programmeId: string) {
    e.preventDefault();
    const hours = Number(sessionHours);
    if (!sessionStaffId || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError('Pick an instructor and enter class hours between 0 and 24.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startsAt = new Date();
      startsAt.setDate(startsAt.getDate() + 1);
      startsAt.setHours(17, 0, 0, 0);
      await api('/api/app/sessions', {
        method: 'POST',
        body: JSON.stringify({
          productServiceId: programmeId,
          staffMemberId: sessionStaffId,
          startsAt: startsAt.toISOString(),
          durationMinutes: Math.round(hours * 60),
        }),
      });
      setSessionFormId(null);
      setRecalculating(true);
      setMessage('Session recorded. Advisor is recalculating from your data…');
      await load();
      setMessage('Session recorded. Advisor recalculated the guidance from your data.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add session');
    } finally {
      setSaving(false);
      setRecalculating(false);
    }
  }

  if (error && !data) return <p className="text-base text-ba-warm">{error}</p>;
  if (!data) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">Pricing Advisor</h1>
        <p className="mt-2 max-w-3xl text-base text-ba-ink/70">
          Advisor is analysing your data. Every figure comes from your records —
          nothing is guessed.
        </p>
        <div className="mt-8 space-y-4">
          <AnalysisProgress steps={PRICING_ANALYSIS_STEPS} />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Pricing Advisor</h1>
      <p className="mt-2 max-w-3xl text-base text-ba-ink/70">
        For each programme: the cheapest you can afford to charge (the cost
        floor) and what you should charge at your {data.targetMarginPercent}%
        target margin. Advisor calculates every figure from your recorded wages,
        sessions, enrolments, and expenses — when data is missing, Advisor asks
        for it instead of guessing. A lower price is suggested only as a
        time-boxed test, and only when your own operating data supports it.
      </p>

      {message && <p className="mt-3 text-base text-ba-accent">{message}</p>}
      {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
      {recalculating && (
        <div className="mt-6">
          <AnalysisProgress steps={PRICING_ANALYSIS_STEPS} />
        </div>
      )}

      {data.programmes.length === 0 && (
        <p className="mt-8 text-base">
          No active programmes yet.{' '}
          <Link className="text-ba-accent underline" to="/app/programmes">
            Add Programmes
          </Link>
        </p>
      )}

      <div className="mt-8 space-y-4">
        {data.programmes.map((p) => (
          <article key={p.programmeId} className="border border-ba-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-1 text-base text-ba-ink/70">
                  {p.activeEnrolments} active enrolment
                  {p.activeEnrolments === 1 ? '' : 's'}
                  {p.capacity != null ? ` · capacity ${p.capacity}` : ''}
                  {p.utilization != null
                    ? ` · ${(p.utilization * 100).toFixed(0)}% full`
                    : ''}
                  {p.priceCents != null
                    ? ` · current price ${money(p.priceCents)}/month`
                    : ''}
                </p>
              </div>
              {p.verdict && (
                <span
                  className={`rounded px-3 py-1 text-base font-semibold ${VERDICT_STYLES[p.verdict]}`}
                >
                  {VERDICT_LABELS[p.verdict]}
                </span>
              )}
              {p.status === 'INSUFFICIENT_DATA' && (
                <span className="rounded bg-ba-mist px-3 py-1 text-base font-semibold">
                  Needs Data
                </span>
              )}
            </div>

            {p.status === 'READY' && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border border-ba-line p-3">
                    <p className="text-base font-semibold text-ba-ink/70">
                      Floor at Current Fill
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {money(p.floorAtCurrentFillCents)}
                    </p>
                  </div>
                  <div className="border border-ba-line p-3">
                    <p className="text-base font-semibold text-ba-ink/70">
                      Floor at Full Capacity
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {p.floorAtCapacityCents != null
                        ? money(p.floorAtCapacityCents)
                        : '—'}
                    </p>
                  </div>
                  <div className="border border-ba-line p-3">
                    <p className="text-base font-semibold text-ba-ink/70">
                      Recommended Price
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {money(p.recommendedPriceCents)}
                    </p>
                    <p className="mt-1 text-base text-ba-ink/60">
                      Floor + {data.targetMarginPercent}% target margin
                    </p>
                  </div>
                  <div className="border border-ba-line p-3">
                    <p className="text-base font-semibold text-ba-ink/70">
                      Cost Inputs
                    </p>
                    <p className="mt-1 text-base">
                      Labour {money(p.monthlyDirectLabourCents)}/mo · Overhead{' '}
                      {money(p.overheadPerStudentCents)}/student
                    </p>
                  </div>
                </div>
                {p.verdict === 'ABOVE_TARGET' &&
                  p.testPriceCents != null &&
                  p.priceTestMonitorWeeks != null && (
                    <div className="mt-4 border border-ba-ink/20 bg-ba-mist/50 p-4">
                      <p className="text-base font-semibold">
                        Suggested {p.priceTestMonitorWeeks}-Week Price Test
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold">
                        {money(p.testPriceCents)}
                        <span className="ml-2 text-base font-semibold text-ba-ink/70">
                          /month
                        </span>
                      </p>
                      <p className="mt-2 text-base">
                        Still above the {money(p.floorAtCurrentFillCents)} cost
                        floor. Monitor enrolments and conversion for{' '}
                        {p.priceTestMonitorWeeks} weeks. This is a test, not a
                        promise that a lower price will fill seats.
                      </p>
                    </div>
                  )}
                {p.note && <p className="mt-3 text-base">{p.note}</p>}
                <CalculationBreakdown p={p} />
              </>
            )}

            {p.status === 'INSUFFICIENT_DATA' && (
              <div className="mt-4">
                <p className="text-base font-semibold">
                  To advise on this programme, Advisor needs:
                </p>
                <ul className="mt-2 space-y-2">
                  {p.missingData.map((m) => (
                    <li key={m.key} className="border border-ba-line bg-ba-mist/40 p-3 text-base">
                      <span className="font-semibold">{m.label}:</span> {m.detail}{' '}
                      {m.fixPath !== '/app/pricing' && (
                        <Link className="text-ba-accent underline" to={m.fixPath}>
                          Add It Here
                        </Link>
                      )}
                      {m.key === 'sessions' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSessionFormId(p.programmeId);
                            setSessionStaffId(staff[0]?.id || '');
                          }}
                          className="cursor-pointer text-ba-accent underline"
                        >
                          Add This Week's Class Session
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {sessionFormId === p.programmeId && (
                  <form
                    onSubmit={(e) => void addSession(e, p.programmeId)}
                    className="mt-3 flex flex-wrap items-end gap-3 border-t border-ba-line pt-3"
                  >
                    <label className="text-base">
                      <span className="mb-1 block font-semibold">Instructor</span>
                      <select
                        value={sessionStaffId}
                        onChange={(e) => setSessionStaffId(e.target.value)}
                        required
                        className="rounded-md border-ba-line text-base"
                      >
                        <option value="">Select instructor…</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.firstName} {s.lastName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-base">
                      <span className="mb-1 block font-semibold">Class Hours</span>
                      <input
                        type="number"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={sessionHours}
                        onChange={(e) => setSessionHours(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        required
                        className="w-32 rounded-md border-ba-line text-base"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={saving}
                      className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Save Session'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setSessionFormId(null)}
                      className="cursor-pointer rounded-md px-4 py-2 text-base text-ba-ink/70 hover:bg-ba-mist disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    {staff.length === 0 && (
                      <p className="w-full text-base text-ba-warm">
                        No staff on file yet.{' '}
                        <Link className="underline" to="/app/staffing">
                          Add Staff and Wages First
                        </Link>
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-sm text-ba-ink/60">{data.disclaimer}</p>
    </div>
  );
}
