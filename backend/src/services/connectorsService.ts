import prisma from '../config/prisma';

export type ConnectorStatus = 'connected' | 'configured' | 'available' | 'not_configured';

export interface ConnectorRow {
  key: string;
  label: string;
  status: ConnectorStatus;
  detail: string;
  href: string;
  lastSyncedAt: string | null;
}

/**
 * Data-pipe inventory. Each connected source is months of work a chat wrapper
 * does not have. Status only — no credentials.
 */
export async function listConnectors(
  organizationId: string
): Promise<ConnectorRow[]> {
  const sources = await prisma.dataSource.findMany({
    where: { organizationId },
    select: {
      kind: true,
      name: true,
      status: true,
      lastSyncedAt: true,
      connectorKey: true,
    },
  });

  const portalConfigured = Boolean(
    process.env.STEM_LANTERN_PORTAL_URL && process.env.STEM_LANTERN_PORTAL_API_KEY
  );
  const portalSource = sources.find(
    (s) => s.kind === 'API_CONNECTOR' || s.connectorKey === 'stem_lantern_portal'
  );
  const csvSource = sources.find((s) => s.kind === 'CSV');

  const portalStatus: ConnectorStatus = portalSource?.lastSyncedAt
    ? 'connected'
    : portalConfigured
      ? 'configured'
      : 'not_configured';

  return [
    {
      key: 'portal',
      label: 'Registration Portal',
      status: portalStatus,
      detail: portalSource?.lastSyncedAt
        ? `Last synced ${portalSource.lastSyncedAt.toISOString().slice(0, 10)}.`
        : portalConfigured
          ? 'Portal credentials are on the server. Sync from Settings to pull the live roster.'
          : 'Set STEM_LANTERN_PORTAL_URL and STEM_LANTERN_PORTAL_API_KEY, then sync.',
      href: '/app/settings',
      lastSyncedAt: portalSource?.lastSyncedAt?.toISOString() ?? null,
    },
    {
      key: 'csv',
      label: 'CSV Import',
      status: csvSource?.lastSyncedAt ? 'connected' : 'available',
      detail:
        'Import students, expenses, subscriptions, and revenue from Programmes & Students or Expenses.',
      href: '/app/programmes',
      lastSyncedAt: csvSource?.lastSyncedAt?.toISOString() ?? null,
    },
    {
      key: 'manual',
      label: 'Manual Entry',
      status: 'available',
      detail:
        'Type programmes, enrolments, wages, sessions, and expenses in the app. Data Readiness lists every dataset Chuk needs.',
      href: '/app/readiness',
      lastSyncedAt: null,
    },
  ];
}
