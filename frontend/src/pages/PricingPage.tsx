import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, money } from '../lib/api';

interface MissingDataItem {
  key: string;
  label: string;
  detail: string;
  fixPath: string;
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
  verdict: 'BELOW_COST' | 'BELOW_TARGET' | 'ON_TRACK' | null;
  note: string | null;
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
};

const VERDICT_LABELS: Record<string, string> = {
  BELOW_COST: 'Below Cost',
  BELOW_TARGET: 'Below Target Margin',
  ON_TRACK: 'On Track',
};

export function PricingPage() {
  const [data, setData] = useState<Guidance | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionFormId, setSessionFormId] = useState<string | null>(null);
  const [sessionStaffId, setSessionStaffId] = useState('');
  const [sessionHours, setSessionHours] = useState('1');
  const [saving, setSaving] = useState(false);
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
      setMessage('Session recorded. Guidance recalculated from your data.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add session');
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <p className="text-base text-ba-warm">{error}</p>;
  if (!data) return <p className="text-base">Loading pricing guidance…</p>;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Pricing Advisor</h1>
      <p className="mt-2 max-w-3xl text-base text-ba-ink/70">
        For each programme: the cheapest you can afford to charge (the cost
        floor) and what you should charge at your {data.targetMarginPercent}%
        target margin. Every figure is calculated from your recorded wages,
        sessions, enrolments, and expenses — when data is missing, the advisor
        asks for it instead of guessing.
      </p>

      {message && <p className="mt-3 text-base text-ba-accent">{message}</p>}
      {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}

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
                {p.note && <p className="mt-3 text-base">{p.note}</p>}
              </>
            )}

            {p.status === 'INSUFFICIENT_DATA' && (
              <div className="mt-4">
                <p className="text-base font-semibold">
                  To advise on this programme, Business Advisor needs:
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
