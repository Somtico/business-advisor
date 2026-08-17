import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface ConnectorRow {
  key: string;
  label: string;
  status: string;
  detail: string;
  href: string;
  lastSyncedAt: string | null;
}

type HelpImproveStatus = {
  enabled: boolean;
  settingVersion: string;
  grantedAt: string | null;
  grantedByUserId: string | null;
};

const CONNECTOR_STATUS: Record<string, string> = {
  connected: 'Connected',
  configured: 'Ready to Sync',
  available: 'Available',
  not_configured: 'Not Configured',
};

const HELP_IMPROVE_DISCLOSURE = (
  <>
    When this is on, Somtico may use privacy-safe information from your use of
    Business Advisor — including structured signals from chats, business data,
    recommendations, actions, and results — to improve and evaluate Advisor, its
    analytics, recommendations, playbooks, Somtico-owned models, and aggregated
    industry intelligence.
    <br />
    <br />
    We remove or exclude direct identifiers from information used for
    cross-customer learning and do not provide this improvement corpus to
    third-party AI companies for their own model training.
    <br />
    <br />
    This setting applies to eligible information you provide in the future while
    it remains on. You can turn it off at any time. Accepting the Terms or
    Privacy Policy does not turn this on.
  </>
);

export function SettingsPage() {
  const { organization, user } = useAuth();
  const canManageLearning = user?.role === 'OWNER' || user?.role === 'ADMIN';
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
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [helpImprove, setHelpImprove] = useState<HelpImproveStatus | null>(null);
  const [learningBusy, setLearningBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<{ success: boolean; data: NonNullable<typeof billing> }>(
      '/api/billing/subscription'
    )
      .then((r) => setBilling(r.data))
      .catch((e) => setMessage(e.message));
    api<{ success: boolean; data: ConnectorRow[] }>('/api/app/connectors')
      .then((r) => setConnectors(r.data))
      .catch(() => setConnectors([]));
    api<{ success: boolean; data: HelpImproveStatus }>(
      '/api/app/learning/help-improve'
    )
      .then((r) => setHelpImprove(r.data))
      .catch(() => setHelpImprove(null));
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
      data: {
        onboardingUrl: string | null;
        simulated?: boolean;
        accountId: string;
      };
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

  async function turnOnHelpImprove() {
    if (!canManageLearning) return;
    setLearningBusy(true);
    try {
      const res = await api<{ success: boolean; data: HelpImproveStatus }>(
        '/api/app/learning/help-improve/enable',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setHelpImprove(res.data);
      setMessage('Help Improve Advisor is on.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not turn on');
    } finally {
      setLearningBusy(false);
    }
  }

  async function turnOffHelpImprove() {
    if (!canManageLearning) return;
    setLearningBusy(true);
    try {
      const res = await api<{ success: boolean; data: HelpImproveStatus }>(
        '/api/app/learning/help-improve/disable',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setHelpImprove(res.data);
      setMessage(
        "Off — your new activity will not be contributed to Somtico's optional cross-customer learning."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not turn off');
    } finally {
      setLearningBusy(false);
    }
  }

  const enabled = Boolean(helpImprove?.enabled);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Settings</h1>
      <p className="mt-2 text-base text-ba-ink/70">
        Organization: {organization?.name} ({organization?.slug})
      </p>

      <section
        id="privacy"
        className="mt-8 scroll-mt-8 border border-ba-line bg-white p-5"
      >
        <h2 className="font-display text-2xl font-bold">Privacy & Data Learning</h2>
        <p className="mt-2 text-base font-semibold">Help Improve Advisor</p>
        <p className="mt-2 text-base text-ba-ink/80">{HELP_IMPROVE_DISCLOSURE}</p>
        <p className="mt-4 text-base">
          Status:{' '}
          <span className="font-semibold">{enabled ? 'On' : 'Off'}</span>
          {enabled
            ? ' — eligible privacy-safe activity may contribute while this remains on.'
            : " — your new activity will not be contributed to Somtico's optional cross-customer learning."}
        </p>
        {canManageLearning ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {!enabled ? (
              <button
                type="button"
                disabled={learningBusy}
                onClick={() => void turnOnHelpImprove()}
                className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {learningBusy ? 'Saving…' : 'Turn On'}
              </button>
            ) : (
              <button
                type="button"
                disabled={learningBusy}
                onClick={() => void turnOffHelpImprove()}
                className="cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {learningBusy ? 'Saving…' : 'Turn Off'}
              </button>
            )}
            <Link className="self-center text-ba-accent underline" to="/privacy">
              Privacy Policy
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-base text-ba-ink/70">
            Only an organization owner or administrator can change this setting.
          </p>
        )}
      </section>

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
        <h2 className="font-display text-2xl font-bold">Data Sources</h2>
        <p className="mt-2 text-base text-ba-ink/70">
          Connect the registration portal, import CSV, or type records in.
          Advisor uses whatever is on file and asks for the rest.
        </p>
        <ul className="mt-4 space-y-3">
          {connectors.map((c) => (
            <li key={c.key} className="border border-ba-line p-3 text-base">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{c.label}</p>
                <p className="text-ba-ink/70">
                  {CONNECTOR_STATUS[c.status] || c.status}
                </p>
              </div>
              <p className="mt-1 text-ba-ink/80">{c.detail}</p>
              <Link className="mt-2 inline-block text-ba-accent underline" to={c.href}>
                Open
              </Link>
            </li>
          ))}
        </ul>
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
