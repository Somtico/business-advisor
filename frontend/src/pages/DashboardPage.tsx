import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, money } from '../lib/api';

interface Dashboard {
  enrolment: {
    activeStudents: number;
    activeStudentsPriorMonth: number;
    startedThisMonth: number;
    endedThisMonth: number;
    conversionRate: number;
    churnRate: number;
  };
  staffing: {
    scheduledHours: number;
    excessHours: number;
    estimatedSavingsCents: number;
    labourCostCents: number;
  };
  expenses: {
    monthExpenseCents: number;
    recurringSubscriptionMonthlyCents: number;
  };
  cash: {
    cashBalanceCents: number;
    netMonthlyCents: number;
    runwayWeeks: number | null;
  };
  targets: {
    id: string;
    label: string;
    actualValue: number;
    targetValue: number;
    progress: number;
    onTrack: boolean;
  }[];
  forecasts: {
    scenario: string;
    projectedValue: number;
  }[];
  programmes: {
    id: string;
    name: string;
    activeEnrolments: number;
    utilization: number | null;
  }[];
  advisorImpact: {
    verified: {
      savedCents: number;
      earnedCents: number;
      otherCents: number;
      totalCents: number;
      actionCount: number;
    };
    thisMonth: { totalCents: number };
    awaitingConfirmationCount: number;
  };
}

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ success: boolean; data: Dashboard }>('/api/app/dashboard')
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-base text-ba-warm">{error}</p>;
  if (!data) return <p className="text-base">Loading command centre…</p>;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Command Centre</h1>
      <p className="mt-2 max-w-2xl text-base text-ba-ink/70">
        Know what is happening in your centre before it becomes expensive.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Advisor Impact',
            value: money(data.advisorImpact.verified.totalCents),
            note:
              data.advisorImpact.verified.totalCents > 0
                ? `Saved ${money(
                    data.advisorImpact.verified.savedCents +
                      data.advisorImpact.verified.otherCents
                  )} · Earned ${money(data.advisorImpact.verified.earnedCents)}`
                : 'Complete actions to build verified impact',
          },
          {
            label: 'Active Students',
            value: String(data.enrolment.activeStudents),
            note: `Prior month ${data.enrolment.activeStudentsPriorMonth}`,
          },
          {
            label: 'Labour Opportunity',
            value: money(data.staffing.estimatedSavingsCents),
            note: `${data.staffing.excessHours} excess hours this week`,
          },
          {
            label: 'Month Expenses',
            value: money(data.expenses.monthExpenseCents),
            note: `Subscriptions ${money(data.expenses.recurringSubscriptionMonthlyCents)}/mo`,
          },
          {
            label: 'Cash Outlook',
            value: money(data.cash.netMonthlyCents),
            note:
              data.cash.runwayWeeks == null
                ? `Balance ${money(data.cash.cashBalanceCents)}`
                : `~${data.cash.runwayWeeks} weeks runway`,
          },
        ].map((card) => (
          <div key={card.label} className="border border-ba-line bg-white p-5">
            <p className="text-base font-semibold text-ba-ink/70">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{card.value}</p>
            <p className="mt-2 text-base text-ba-ink/60">{card.note}</p>
          </div>
        ))}
      </div>

      {data.advisorImpact.awaitingConfirmationCount > 0 && (
        <p className="mt-4 border border-ba-line bg-ba-mist px-4 py-3 text-base">
          {data.advisorImpact.awaitingConfirmationCount} completed action
          {data.advisorImpact.awaitingConfirmationCount === 1 ? ' is' : 's are'}{' '}
          awaiting impact confirmation.{' '}
          <Link className="text-ba-accent underline" to="/app/actions">
            Confirm in the Action Centre
          </Link>
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">Targets</h2>
        <div className="mt-4 space-y-3">
          {data.targets.length === 0 && (
            <p className="text-base">
              No active targets yet.{' '}
              <Link className="text-ba-accent underline" to="/app/targets">
                Set Targets
              </Link>
            </p>
          )}
          {data.targets.map((t) => (
            <div key={t.id} className="border border-ba-line bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-semibold">{t.label}</p>
                <p className="text-base">
                  {t.actualValue} / {t.targetValue}{' '}
                  <span
                    className={
                      t.onTrack ? 'text-ba-accent' : 'text-ba-warm'
                    }
                  >
                    ({(t.progress * 100).toFixed(0)}%)
                  </span>
                </p>
              </div>
              <div className="mt-2 h-2 bg-ba-mist">
                <div
                  className={`h-2 ${t.onTrack ? 'bg-ba-accent' : 'bg-ba-warm'}`}
                  style={{ width: `${Math.min(100, t.progress * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Programmes</h2>
          <ul className="mt-4 space-y-2">
            {data.programmes.map((p) => (
              <li key={p.id} className="border border-ba-line bg-white px-4 py-3 text-base">
                <span className="font-semibold">{p.name}</span> —{' '}
                {p.activeEnrolments} enrolments
                {p.utilization != null
                  ? ` · ${(p.utilization * 100).toFixed(0)}% capacity`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Forecasts</h2>
          <ul className="mt-4 space-y-2">
            {data.forecasts.length === 0 && (
              <li className="text-base">
                No forecast yet. Rebuild from Targets & Forecasts.
              </li>
            )}
            {data.forecasts.map((f) => (
              <li
                key={f.scenario}
                className="border border-ba-line bg-white px-4 py-3 text-base"
              >
                <span className="font-semibold">{f.scenario}</span> —{' '}
                {f.projectedValue} active students (3-month horizon)
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
