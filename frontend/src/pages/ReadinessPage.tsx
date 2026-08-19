import { FormEvent, useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { parseDollarInputToCents } from '../lib/parseMoney';
import { useAuth } from '../context/AuthContext';

interface Item {
  id: string;
  datasetKey: string;
  label: string;
  status: string;
  whyItMatters: string;
  exampleInsight: string | null;
  priority: number;
  deferredUntil?: string | null;
}

interface CashComponent {
  amountCents: number | null;
  available: boolean;
  status: string;
  asOf: string | null;
  currency: string | null;
}

interface CashPosition {
  currency: string;
  total: CashComponent;
  committed: CashComponent;
  restricted: CashComponent;
  availableOperatingCashCents: number | null;
  availableOperatingCashAvailable: boolean;
  commitmentGapCents: number;
  commitmentGapPresent: boolean;
  allocationIncomplete: boolean;
}

function centsToInput(component: CashComponent): string {
  if (!component.available || component.amountCents == null) return '';
  const dollars = component.amountCents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function canManageCash(role?: string) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'FINANCE';
}

export function ReadinessPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [cashPosition, setCashPosition] = useState<CashPosition | null>(null);
  const [total, setTotal] = useState('');
  const [committed, setCommitted] = useState('');
  const [restricted, setRestricted] = useState('');
  const [loaded, setLoaded] = useState({ total: '', committed: '', restricted: '' });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manage = canManageCash(user?.role);
  const currency = cashPosition?.currency || 'CAD';

  async function load() {
    const res = await api<{
      success: boolean;
      data: { items: Item[]; cashPosition: CashPosition };
    }>('/api/app/readiness');
    setItems(res.data.items);
    const position = res.data.cashPosition;
    setCashPosition(position);
    const next = {
      total: centsToInput(position.total),
      committed: centsToInput(position.committed),
      restricted: centsToInput(position.restricted),
    };
    setTotal(next.total);
    setCommitted(next.committed);
    setRestricted(next.restricted);
    setLoaded(next);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function mark(datasetKey: string, status: string) {
    await api(`/api/app/readiness/${datasetKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function saveCashPosition(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const body: {
      totalBusinessCashCents?: number;
      committedCashCents?: number;
      restrictedCashCents?: number;
    } = {};
    try {
      const parsedTotal = parseDollarInputToCents(total);
      const parsedCommitted = parseDollarInputToCents(committed);
      const parsedRestricted = parseDollarInputToCents(restricted);
      if (total !== loaded.total) {
        if (parsedTotal === null && total.trim() !== '') {
          throw new Error('INVALID_CASH_AMOUNT');
        }
        if (parsedTotal !== null) body.totalBusinessCashCents = parsedTotal;
      }
      if (committed !== loaded.committed) {
        if (parsedCommitted === null && committed.trim() !== '') {
          throw new Error('INVALID_CASH_AMOUNT');
        }
        if (parsedCommitted !== null) body.committedCashCents = parsedCommitted;
      }
      if (restricted !== loaded.restricted) {
        if (parsedRestricted === null && restricted.trim() !== '') {
          throw new Error('INVALID_CASH_AMOUNT');
        }
        if (parsedRestricted !== null) body.restrictedCashCents = parsedRestricted;
      }
    } catch {
      setError('Enter cash amounts such as 15000, or leave a field blank.');
      return;
    }
    if (Object.keys(body).length === 0) {
      setMessage('Change a field to save a new observation.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/app/cash-position', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await load();
      setMessage('Cash position saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save cash position');
    } finally {
      setBusy(false);
    }
  }

  async function skipAllocations() {
    setBusy(true);
    setError(null);
    try {
      const later = new Date();
      later.setDate(later.getDate() + 30);
      await api('/api/app/readiness/loans_cash', {
        method: 'PATCH',
        body: JSON.stringify({ deferredUntil: later.toISOString() }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not skip for now');
    } finally {
      setBusy(false);
    }
  }

  if (error && items.length === 0 && !cashPosition) {
    return <p className="text-base text-ba-warm">{error}</p>;
  }

  const loansItem = items.find((item) => item.datasetKey === 'loans_cash');
  const deferred =
    loansItem?.deferredUntil && new Date(loansItem.deferredUntil) > new Date();
  const showImprove =
    Boolean(cashPosition?.allocationIncomplete) && !deferred;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Data Readiness Centre</h1>
      <p className="mt-2 max-w-2xl text-base text-ba-ink/70">
        Shows what the system knows, what is missing, and why each dataset
        matters. Skip what you do not collect yet.
      </p>

      <section className="mt-8 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Cash Position</h2>
        {showImprove ? (
          <div className="mt-3 border border-ba-line bg-ba-mist px-4 py-3">
            <p className="text-base font-semibold">Improve Cash Visibility</p>
            <p className="mt-1 text-base text-ba-ink/80">
              Tell Advisor whether any of your current cash is already committed
              or restricted so it can better understand what is actually
              available for business decisions.
            </p>
            {manage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void skipAllocations()}
                className="mt-3 cursor-pointer text-base font-semibold text-ba-accent underline disabled:cursor-not-allowed"
              >
                I&apos;ll Add This Later
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-3 text-base text-ba-ink/80">
          You can skip this and return later. Blank means Advisor does not know
          the amount yet. Enter 0 only when you know that amount is zero.
        </p>
        <form onSubmit={saveCashPosition} className="mt-4 max-w-xl space-y-4">
          <label className="block text-base font-semibold">
            Total Business Cash ({currency})
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={!manage}
              className="mt-1 w-full rounded-md border-ba-line text-base disabled:cursor-not-allowed"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="e.g. 15000"
            />
          </label>
          <p className="text-base text-ba-ink/70">
            Cash currently held across business bank accounts, including
            deposited borrowed funds. Do not include unused credit.
          </p>
          <label className="block text-base font-semibold">
            Committed / Earmarked Cash ({currency})
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={!manage}
              className="mt-1 w-full rounded-md border-ba-line text-base disabled:cursor-not-allowed"
              value={committed}
              onChange={(e) => setCommitted(e.target.value)}
              placeholder="e.g. 12000"
            />
          </label>
          <p className="text-base text-ba-ink/70">
            How much of your current cash has already been set aside for known
            obligations or planned uses, such as payroll, taxes, rent, supplier
            payments, or a planned purchase?
          </p>
          <label className="block text-base font-semibold">
            Restricted Cash ({currency})
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={!manage}
              className="mt-1 w-full rounded-md border-ba-line text-base disabled:cursor-not-allowed"
              value={restricted}
              onChange={(e) => setRestricted(e.target.value)}
              placeholder="e.g. 5000"
            />
          </label>
          <p className="text-base text-ba-ink/70">
            How much of your current cash is subject to a legal, contractual,
            funding, or other external restriction that prevents the business
            from freely using it?
          </p>
          <div className="border border-ba-line bg-ba-mist px-4 py-3">
            <p className="text-base font-semibold">Available Operating Cash</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {cashPosition?.availableOperatingCashAvailable &&
              cashPosition.availableOperatingCashCents != null
                ? money(cashPosition.availableOperatingCashCents, currency)
                : 'Needs cash-allocation details'}
            </p>
            <p className="mt-2 text-base text-ba-ink/80">
              Cash that remains after amounts already committed or restricted
              are taken into account.
            </p>
            {cashPosition?.commitmentGapPresent ? (
              <p className="mt-2 text-base text-ba-warm">
                Existing commitments and restrictions exceed total business cash
                by {money(cashPosition.commitmentGapCents, currency)}.
              </p>
            ) : null}
          </div>
          {error ? (
            <p className="text-base text-ba-warm" role="alert">
              {error}
            </p>
          ) : null}
          {message ? <p className="text-base text-ba-accent">{message}</p> : null}
          {manage ? (
            <button
              type="submit"
              disabled={busy}
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Cash Position
            </button>
          ) : null}
        </form>
      </section>

      <div className="mt-8 space-y-4">
        {items
          .filter((item) => item.datasetKey !== 'loans_cash')
          .map((item) => (
          <article key={item.id} className="border border-ba-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{item.label}</h2>
                <p className="mt-1 text-base text-ba-ink/70">{item.whyItMatters}</p>
                {item.exampleInsight && (
                  <p className="mt-2 text-base italic text-ba-ink/60">
                    Example: {item.exampleInsight}
                  </p>
                )}
              </div>
              <span className="rounded bg-ba-mist px-3 py-1 text-base font-semibold">
                {item.status.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['NOT_APPLICABLE', 'MISSING', 'MANUAL'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => mark(item.datasetKey, s)}
                  className="cursor-pointer rounded border border-ba-line px-3 py-2 text-base hover:bg-ba-mist"
                >
                  Mark {s.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
