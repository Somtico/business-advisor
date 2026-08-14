import { FormEvent, useEffect, useState } from 'react';
import { api, money } from '../lib/api';

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<
    { id: string; description: string | null; amountCents: number; category: string | null }[]
  >([]);
  const [subs, setSubs] = useState<
    { id: string; name: string; amountCents: number; cadence: string }[]
  >([]);
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    category: 'operating',
  });
  const [subForm, setSubForm] = useState({
    name: '',
    amount: '',
    cadence: 'monthly',
  });

  async function load() {
    const [e, s] = await Promise.all([
      api<{ success: boolean; data: typeof expenses }>('/api/app/expenses'),
      api<{ success: boolean; data: typeof subs }>('/api/app/subscriptions'),
    ]);
    setExpenses(e.data);
    setSubs(s.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    await api('/api/app/expenses', {
      method: 'POST',
      body: JSON.stringify({
        description: expenseForm.description,
        category: expenseForm.category,
        amountCents: Math.round(Number(expenseForm.amount) * 100),
      }),
    });
    setExpenseForm({ description: '', amount: '', category: 'operating' });
    await load();
  }

  async function addSub(e: FormEvent) {
    e.preventDefault();
    await api('/api/app/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        name: subForm.name,
        cadence: subForm.cadence,
        amountCents: Math.round(Number(subForm.amount) * 100),
      }),
    });
    setSubForm({ name: '', amount: '', cadence: 'monthly' });
    await load();
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Expenses & Subscriptions</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-bold">Expenses</h2>
          <ul className="mt-4 max-h-72 space-y-2 overflow-auto">
            {expenses.map((ex) => (
              <li key={ex.id} className="border border-ba-line bg-white px-4 py-3 text-base">
                {ex.description} · {money(ex.amountCents)}
                {ex.category ? ` · ${ex.category}` : ''}
              </li>
            ))}
          </ul>
          <form onSubmit={addExpense} className="mt-4 grid gap-2">
            <input
              className="rounded-md border-ba-line text-base"
              placeholder="Description"
              value={expenseForm.description}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, description: e.target.value })
              }
              required
            />
            <input
              type="number"
              step="0.01"
              className="rounded-md border-ba-line text-base"
              placeholder="Amount CAD"
              value={expenseForm.amount}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, amount: e.target.value })
              }
              onWheel={(ev) => ev.currentTarget.blur()}
              required
            />
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
            >
              Add Expense
            </button>
          </form>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Subscriptions</h2>
          <ul className="mt-4 max-h-72 space-y-2 overflow-auto">
            {subs.map((s) => (
              <li key={s.id} className="border border-ba-line bg-white px-4 py-3 text-base">
                {s.name} · {money(s.amountCents)} / {s.cadence}
              </li>
            ))}
          </ul>
          <form onSubmit={addSub} className="mt-4 grid gap-2">
            <input
              className="rounded-md border-ba-line text-base"
              placeholder="Subscription name"
              value={subForm.name}
              onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
              required
            />
            <input
              type="number"
              step="0.01"
              className="rounded-md border-ba-line text-base"
              placeholder="Amount CAD"
              value={subForm.amount}
              onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })}
              onWheel={(ev) => ev.currentTarget.blur()}
              required
            />
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
            >
              Add Subscription
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
