import { useEffect, useState } from 'react';
import { api, money } from '../lib/api';

interface ActionRow {
  id: string;
  title: string;
  description: string;
  status: string;
  expectedImpactCents: number | null;
  realizedImpactCents: number | null;
}

export function ActionsPage() {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [insightsMsg, setInsightsMsg] = useState<string | null>(null);

  async function load() {
    const res = await api<{ success: boolean; data: ActionRow[] }>(
      '/api/app/actions'
    );
    setRows(res.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runInsights() {
    const res = await api<{
      success: boolean;
      data: { insights: unknown[]; recommendations: unknown[] };
    }>('/api/app/insights/run', { method: 'POST' });
    setInsightsMsg(
      `Generated ${res.data.insights.length} insights and ${res.data.recommendations.length} recommendations`
    );
    await load();
  }

  async function updateStatus(id: string, status: string) {
    await api(`/api/app/actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        realizedImpactCents:
          status === 'COMPLETED'
            ? rows.find((r) => r.id === id)?.expectedImpactCents ?? undefined
            : undefined,
      }),
    });
    await load();
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
      {insightsMsg && <p className="mt-3 text-base text-ba-accent">{insightsMsg}</p>}
      <div className="mt-8 space-y-4">
        {rows.length === 0 && (
          <p className="text-base">No recommendations yet. Run insights to generate some.</p>
        )}
        {rows.map((r) => (
          <article key={r.id} className="border border-ba-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{r.title}</h2>
                <p className="mt-2 text-base text-ba-ink/70">{r.description}</p>
                <p className="mt-2 text-base">
                  Expected impact:{' '}
                  {r.expectedImpactCents != null
                    ? money(r.expectedImpactCents)
                    : 'Qualitative'}
                  {r.realizedImpactCents != null
                    ? ` · Realized ${money(r.realizedImpactCents)}`
                    : ''}
                </p>
              </div>
              <span className="rounded bg-ba-mist px-3 py-1 text-base font-semibold">
                {r.status}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void updateStatus(r.id, s)}
                  className="cursor-pointer rounded border border-ba-line px-3 py-2 text-base hover:bg-ba-mist"
                >
                  {s.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
