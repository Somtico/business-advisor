import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { organization } = useAuth();
  const [billing, setBilling] = useState<{
    subscription: {
      plan: string;
      status: string;
      unitAmountCents: number;
    } | null;
    connect: {
      stripeConnectAccountId: string | null;
      stripeConnectReady: boolean;
    } | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<{ success: boolean; data: NonNullable<typeof billing> }>(
      '/api/billing/subscription'
    )
      .then((r) => setBilling(r.data))
      .catch((e) => setMessage(e.message));
  }, []);

  async function checkout() {
    const res = await api<{
      success: boolean;
      data: { url: string | null; simulated?: boolean };
    }>('/api/billing/checkout', { method: 'POST' });
    if (res.data.url) {
      window.location.href = res.data.url;
      return;
    }
    setMessage(
      res.data.simulated
        ? 'Pilot plan activated in development mode (Stripe keys not set).'
        : 'Checkout unavailable'
    );
  }

  async function connectOnboard() {
    const res = await api<{
      success: boolean;
      data: { onboardingUrl: string | null; simulated?: boolean; accountId: string };
    }>('/api/billing/connect/onboard', { method: 'POST' });
    if (res.data.onboardingUrl) {
      window.location.href = res.data.onboardingUrl;
      return;
    }
    setMessage(
      res.data.simulated
        ? `Connect account simulated: ${res.data.accountId}`
        : 'Connect onboarding unavailable'
    );
  }

  async function syncPortal() {
    try {
      const res = await api<{
        success: boolean;
        data: { recordsUpserted: number };
      }>('/api/app/connector/sync', { method: 'POST' });
      setMessage(`Portal sync upserted ${res.data.recordsUpserted} records`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  }

  async function weeklyBrief() {
    const res = await api<{
      success: boolean;
      data: { dryRun?: boolean; subject: string };
    }>('/api/app/jobs/weekly-brief', { method: 'POST' });
    setMessage(
      res.data.dryRun
        ? `Weekly brief dry-run: ${res.data.subject}`
        : `Weekly brief sent: ${res.data.subject}`
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Settings</h1>
      <p className="mt-2 text-base text-ba-ink/70">
        Organization: {organization?.name} ({organization?.slug})
      </p>

      <section className="mt-8 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Billing</h2>
        <p className="mt-2 text-base">
          Plan: {billing?.subscription?.plan || '—'} · Status:{' '}
          {billing?.subscription?.status || '—'} ·{' '}
          {billing?.subscription
            ? `$${(billing.subscription.unitAmountCents / 100).toFixed(2)} CAD/month`
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void checkout()}
          className="mt-4 cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white"
        >
          Start / Renew $5 Pilot
        </button>
      </section>

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Stripe Connect</h2>
        <p className="mt-2 text-base">
          Account: {billing?.connect?.stripeConnectAccountId || 'Not connected'} ·
          Ready: {billing?.connect?.stripeConnectReady ? 'Yes' : 'No'}
        </p>
        <button
          type="button"
          onClick={() => void connectOnboard()}
          className="mt-4 cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base"
        >
          Connect Onboarding
        </button>
      </section>

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">STEM Lantern Portal Connector</h2>
        <p className="mt-2 text-base">
          Read-only sync from the registration portal (Skill Samurai folder during
          rebrand). Requires STEM_LANTERN_PORTAL_URL and API key on the backend.
        </p>
        <button
          type="button"
          onClick={() => void syncPortal()}
          className="mt-4 cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base"
        >
          Sync Portal Now
        </button>
      </section>

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Jobs</h2>
        <button
          type="button"
          onClick={() => void weeklyBrief()}
          className="mt-4 cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base"
        >
          Send Weekly Executive Brief
        </button>
      </section>

      {message && <p className="mt-4 text-base text-ba-accent">{message}</p>}
    </div>
  );
}
