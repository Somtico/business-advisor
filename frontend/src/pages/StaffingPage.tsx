import { FormEvent, useEffect, useState } from 'react';
import { api, money } from '../lib/api';

export function StaffingPage() {
  const [staff, setStaff] = useState<
    {
      id: string;
      firstName: string;
      lastName: string;
      roleTitle: string | null;
      compensation: { hourlyCents: number | null } | null;
    }[]
  >([]);
  const [dash, setDash] = useState<{
    staffing: {
      status?: 'READY' | 'INSUFFICIENT_DATA';
      scheduledHours: number;
      neededInstructorHours: number;
      excessHours: number | null;
      labourCostCents: number;
      estimatedSavingsCents: number | null;
      missingData?: string[];
    };
  } | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    roleTitle: 'Instructor',
    hourly: '28',
  });

  async function load() {
    const [s, d] = await Promise.all([
      api<{ success: boolean; data: typeof staff }>('/api/app/staff'),
      api<{ success: boolean; data: NonNullable<typeof dash> }>('/api/app/dashboard'),
    ]);
    setStaff(s.data);
    setDash(d.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await api('/api/app/staff', {
      method: 'POST',
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        roleTitle: form.roleTitle,
        hourlyCents: Math.round(Number(form.hourly) * 100),
      }),
    });
    setForm({ firstName: '', lastName: '', roleTitle: 'Instructor', hourly: '28' });
    await load();
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Staffing</h1>
      {dash && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base text-ba-ink/70">Scheduled Hours</p>
            <p className="font-display text-2xl font-bold">
              {dash.staffing.scheduledHours}
            </p>
          </div>
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base text-ba-ink/70">Excess Hours</p>
            <p className="font-display text-2xl font-bold">
              {dash.staffing.excessHours == null
                ? 'Needs staffing data'
                : dash.staffing.excessHours}
            </p>
          </div>
          <div className="border border-ba-line bg-white p-4">
            <p className="text-base text-ba-ink/70">Estimated Savings</p>
            <p className="font-display text-2xl font-bold">
              {dash.staffing.estimatedSavingsCents == null
                ? 'Needs staffing data'
                : money(dash.staffing.estimatedSavingsCents)}
            </p>
          </div>
        </div>
      )}
      <ul className="mt-8 space-y-2">
        {staff.map((s) => (
          <li key={s.id} className="border border-ba-line bg-white px-4 py-3 text-base">
            {s.firstName} {s.lastName}
            {s.roleTitle ? ` · ${s.roleTitle}` : ''}
            {s.compensation?.hourlyCents != null
              ? ` · ${money(s.compensation.hourlyCents)}/hr`
              : ''}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="mt-6 grid max-w-xl gap-3">
        <h2 className="font-display text-xl font-bold">Add Instructor</h2>
        <input
          className="rounded-md border-ba-line text-base"
          placeholder="First name"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          required
        />
        <input
          className="rounded-md border-ba-line text-base"
          placeholder="Last name"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          required
        />
        <input
          className="rounded-md border-ba-line text-base"
          placeholder="Role"
          value={form.roleTitle}
          onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          className="rounded-md border-ba-line text-base"
          placeholder="Hourly rate CAD"
          value={form.hourly}
          onChange={(e) => setForm({ ...form, hourly: e.target.value })}
          onWheel={(e) => e.currentTarget.blur()}
        />
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
        >
          Save Instructor
        </button>
      </form>
    </div>
  );
}
