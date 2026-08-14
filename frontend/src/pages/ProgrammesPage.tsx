import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<
    { id: string; name: string; capacity: number | null; priceCents: number | null }[]
  >([]);
  const [students, setStudents] = useState<
    { id: string; firstName: string; lastName: string; status: string }[]
  >([]);
  const [name, setName] = useState('');
  const [studentFirst, setStudentFirst] = useState('');
  const [studentLast, setStudentLast] = useState('');
  const [csv, setCsv] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [p, s] = await Promise.all([
      api<{ success: boolean; data: typeof programmes }>('/api/app/programmes'),
      api<{ success: boolean; data: typeof students }>('/api/app/students'),
    ]);
    setProgrammes(p.data);
    setStudents(s.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addProgramme(e: FormEvent) {
    e.preventDefault();
    await api('/api/app/programmes', {
      method: 'POST',
      body: JSON.stringify({ name, capacity: 12, priceCents: 19900 }),
    });
    setName('');
    await load();
  }

  async function addStudent(e: FormEvent) {
    e.preventDefault();
    await api('/api/app/students', {
      method: 'POST',
      body: JSON.stringify({
        firstName: studentFirst,
        lastName: studentLast,
        status: 'active',
      }),
    });
    setStudentFirst('');
    setStudentLast('');
    await load();
  }

  async function importStudents(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ success: boolean; data: { imported: number } }>(
      '/api/app/import/csv',
      {
        method: 'POST',
        body: JSON.stringify({ kind: 'students', csvText: csv }),
      }
    );
    setMessage(`Imported ${res.data.imported} students`);
    setCsv('');
    await load();
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Programmes & Students</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-bold">Programmes</h2>
          <ul className="mt-4 space-y-2">
            {programmes.map((p) => (
              <li key={p.id} className="border border-ba-line bg-white px-4 py-3 text-base">
                {p.name}
                {p.capacity != null ? ` · capacity ${p.capacity}` : ''}
              </li>
            ))}
          </ul>
          <form onSubmit={addProgramme} className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-md border-ba-line text-base"
              placeholder="Programme name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
            >
              Add
            </button>
          </form>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Students</h2>
          <ul className="mt-4 max-h-64 space-y-2 overflow-auto">
            {students.map((s) => (
              <li key={s.id} className="border border-ba-line bg-white px-4 py-3 text-base">
                {s.firstName} {s.lastName} · {s.status}
              </li>
            ))}
          </ul>
          <form onSubmit={addStudent} className="mt-4 flex flex-wrap gap-2">
            <input
              className="rounded-md border-ba-line text-base"
              placeholder="First name"
              value={studentFirst}
              onChange={(e) => setStudentFirst(e.target.value)}
              required
            />
            <input
              className="rounded-md border-ba-line text-base"
              placeholder="Last name"
              value={studentLast}
              onChange={(e) => setStudentLast(e.target.value)}
              required
            />
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
            >
              Add Student
            </button>
          </form>
          <form onSubmit={importStudents} className="mt-6">
            <label className="block text-base font-semibold">
              CSV Import (first_name,last_name,email,grade,status)
              <textarea
                className="mt-1 w-full rounded-md border-ba-line text-base"
                rows={4}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder="first_name,last_name,email,grade,status"
              />
            </label>
            <button
              type="submit"
              className="mt-2 cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base"
            >
              Import CSV
            </button>
            {message && <p className="mt-2 text-base text-ba-accent">{message}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
