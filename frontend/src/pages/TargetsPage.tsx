import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function TargetsPage() {
  const [targets, setTargets] = useState<
    {
      id: string;
      label: string;
      metricKey: string;
      targetValue: number;
      periodStart: string;
      periodEnd: string;
    }[]
  >([]);
  const [forecasts, setForecasts] = useState<
    { id: string; scenario: string; projectedValue: number }[]
  >([]);
  const [form, setForm] = useState({
    label: 'Active Paid Students',
    metricKey: 'active_students',
    targetValue: '25',
    periodStart: '2026-09-01',
    periodEnd: '2027-06-30',
  });

  async function load() {
    const [t, d] = await Promise.all([
      api<{ success: boolean; data: typeof targets }>('/api/app/targets'),
      api<{
        success: boolean;
        data: { forecasts: typeof forecasts };
      }>('/api/app/dashboard'),
    ]);
    setTargets(t.data);
    setForecasts(d.data.forecasts);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addTarget(e: FormEvent) {
    e.preventDefault();
    await api('/api/app/targets', {
      method: 'POST',
      body: JSON.stringify({
        label: form.label,
        metricKey: form.metricKey,
        targetValue: Number(form.targetValue),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        unit: 'count',
      }),
    });
    await load();
  }

  async function rebuild() {
    const res = await api<{ success: boolean; data: typeof forecasts }>(
      '/api/app/forecasts/rebuild',
      { method: 'POST' }
    );
    setForecasts(res.data);
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Targets & Forecasts</h1>
      <ul className="mt-6 space-y-2">
        {targets.map((t) => (
          <li key={t.id} className="border border-ba-line bg-white px-4 py-3 text-base">
            {t.label}: {t.targetValue} ({t.metricKey})
          </li>
        ))}
      </ul>
      <form onSubmit={addTarget} className="mt-6 grid max-w-xl gap-3">
        <h2 className="font-display text-xl font-bold">Add Target</h2>
        <input
          className="rounded-md border-ba-line text-base"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          required
        />
        <input
          className="rounded-md border-ba-line text-base"
          value={form.metricKey}
          onChange={(e) => setForm({ ...form, metricKey: e.target.value })}
          required
        />
        <input
          type="number"
          className="rounded-md border-ba-line text-base"
          value={form.targetValue}
          onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
          onWheel={(e) => e.currentTarget.blur()}
          required
        />
        <input
          type="date"
          max="9999-12-31"
          className="rounded-md border-ba-line text-base"
          value={form.periodStart}
          onChange={(e) =>
            e.target.value && setForm({ ...form, periodStart: e.target.value })
          }
          required
        />
        <input
          type="date"
          max="9999-12-31"
          className="rounded-md border-ba-line text-base"
          value={form.periodEnd}
          onChange={(e) =>
            e.target.value && setForm({ ...form, periodEnd: e.target.value })
          }
          required
        />
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
        >
          Save Target
        </button>
      </form>

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-bold">Forecast Scenarios</h2>
          <button
            type="button"
            onClick={() => void rebuild()}
            className="cursor-pointer rounded-md border border-ba-line px-3 py-2 text-base"
          >
            Rebuild Forecasts
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {forecasts.map((f) => (
            <li key={f.id || f.scenario} className="border border-ba-line bg-white px-4 py-3 text-base">
              {f.scenario}: {f.projectedValue} active students
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
