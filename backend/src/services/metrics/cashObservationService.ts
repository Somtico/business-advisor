import prisma from '../../config/prisma';
import { cashIsRecorded } from './metricAvailability';
import {
  CASH_BALANCE_METRIC_KEY,
  COMMITTED_CASH_METRIC_KEY,
  RESTRICTED_CASH_METRIC_KEY,
  componentFromObservation,
  deriveOperatingCash,
  toAdvisorCashEvidence,
  type CashComponent,
} from './cashPosition';

export {
  CASH_BALANCE_METRIC_KEY,
  COMMITTED_CASH_METRIC_KEY,
  RESTRICTED_CASH_METRIC_KEY,
};

export const CASH_SOURCE_ONBOARDING = 'manual_onboarding';
export const CASH_SOURCE_UPDATE = 'manual_update';

export type CashObservationSource =
  | typeof CASH_SOURCE_ONBOARDING
  | typeof CASH_SOURCE_UPDATE;

export type CashMetricKey =
  | typeof CASH_BALANCE_METRIC_KEY
  | typeof COMMITTED_CASH_METRIC_KEY
  | typeof RESTRICTED_CASH_METRIC_KEY;

export type CurrentCashBalance = {
  cashBalanceCents: number | null;
  cashBalanceAsOf: Date | null;
  cashBalanceAvailable: boolean;
  currency: string;
};

export type CashPositionSnapshot = {
  currency: string;
  total: CashComponent;
  committed: CashComponent;
  restricted: CashComponent;
  availableOperatingCashCents: number | null;
  availableOperatingCashAvailable: boolean;
  commitmentGapCents: number;
  commitmentGapPresent: boolean;
  currencyMismatch: boolean;
  allocationIncomplete: boolean;
  advisorEvidence: ReturnType<typeof toAdvisorCashEvidence>;
};

/**
 * Append-only dated observation for a cash-position component.
 * Never updates or deletes prior snapshots.
 * Total business cash also refreshes Organization.cashBalanceCents for compatibility.
 */
export async function recordCashComponentObservation(params: {
  organizationId: string;
  metricKey: CashMetricKey;
  amountCents: number;
  source: CashObservationSource;
  currency?: string;
  asOf?: Date;
}) {
  const asOf = params.asOf ?? new Date();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
    select: { currency: true },
  });
  const currency = params.currency || org.currency || 'CAD';
  if (
    params.currency &&
    params.currency.toUpperCase() !== (org.currency || 'CAD').toUpperCase()
  ) {
    throw new Error('CURRENCY_MISMATCH');
  }

  const snapshot = await prisma.metricSnapshot.create({
    data: {
      organizationId: params.organizationId,
      metricKey: params.metricKey,
      asOf,
      value: params.amountCents,
      unit: currency,
      dimensions: { source: params.source, currency },
      evidence: {
        amountCents: params.amountCents,
        currency,
        source: params.source,
      },
    },
  });

  if (params.metricKey === CASH_BALANCE_METRIC_KEY) {
    await prisma.organization.update({
      where: { id: params.organizationId },
      data: {
        cashBalanceCents: params.amountCents,
        cashBalanceAsOf: asOf,
      },
    });
  }

  return snapshot;
}

export async function recordCashBalanceObservation(params: {
  organizationId: string;
  amountCents: number;
  source: CashObservationSource;
  currency?: string;
  asOf?: Date;
}) {
  return recordCashComponentObservation({
    ...params,
    metricKey: CASH_BALANCE_METRIC_KEY,
  });
}

export async function latestCashComponentObservation(
  organizationId: string,
  metricKey: CashMetricKey
) {
  return prisma.metricSnapshot.findFirst({
    where: { organizationId, metricKey },
    orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function latestCashBalanceObservation(organizationId: string) {
  return latestCashComponentObservation(organizationId, CASH_BALANCE_METRIC_KEY);
}

export function currentCashFromOrganization(org: {
  cashBalanceCents: number;
  cashBalanceAsOf: Date | null;
  currency: string;
}): CurrentCashBalance {
  const available = cashIsRecorded(org.cashBalanceAsOf);
  return {
    cashBalanceCents: available ? org.cashBalanceCents : null,
    cashBalanceAsOf: org.cashBalanceAsOf,
    cashBalanceAvailable: available,
    currency: org.currency || 'CAD',
  };
}

/**
 * Latest snapshot wins when present. Otherwise the organization cache is used
 * only when cashBalanceAsOf is set (legacy onboarding without a snapshot row).
 */
export async function resolveCurrentCash(
  organizationId: string
): Promise<CurrentCashBalance> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      cashBalanceCents: true,
      cashBalanceAsOf: true,
      currency: true,
    },
  });
  const snap = await latestCashBalanceObservation(organizationId);
  if (snap) {
    return {
      cashBalanceCents: Math.round(snap.value),
      cashBalanceAsOf: snap.asOf,
      cashBalanceAvailable: true,
      currency: snap.unit || org.currency || 'CAD',
    };
  }
  return currentCashFromOrganization(org);
}

function componentFromSnapshot(
  snap: { value: number; asOf: Date; unit: string | null } | null,
  organizationCurrency: string
): CashComponent {
  if (!snap) {
    return componentFromObservation({
      amountCents: null,
      available: false,
      asOf: null,
      currency: organizationCurrency,
    });
  }
  return componentFromObservation({
    amountCents: Math.round(snap.value),
    available: true,
    asOf: snap.asOf,
    currency: snap.unit || organizationCurrency,
  });
}

export async function resolveCashPosition(
  organizationId: string
): Promise<CashPositionSnapshot> {
  const [current, committedSnap, restrictedSnap, org] = await Promise.all([
    resolveCurrentCash(organizationId),
    latestCashComponentObservation(organizationId, COMMITTED_CASH_METRIC_KEY),
    latestCashComponentObservation(organizationId, RESTRICTED_CASH_METRIC_KEY),
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { currency: true },
    }),
  ]);
  const currency = org.currency || current.currency || 'CAD';
  const total = componentFromObservation({
    amountCents: current.cashBalanceCents,
    available: current.cashBalanceAvailable,
    asOf: current.cashBalanceAsOf,
    currency,
  });
  const committed = componentFromSnapshot(committedSnap, currency);
  const restricted = componentFromSnapshot(restrictedSnap, currency);
  const derived = deriveOperatingCash({
    total,
    committed,
    restricted,
    organizationCurrency: currency,
  });
  const allocationIncomplete =
    total.available && (!committed.available || !restricted.available);

  return {
    currency,
    total,
    committed,
    restricted,
    availableOperatingCashCents: derived.availableOperatingCashCents,
    availableOperatingCashAvailable: derived.availableOperatingCashAvailable,
    commitmentGapCents: derived.commitmentGapCents,
    commitmentGapPresent: derived.commitmentGapPresent,
    currencyMismatch: derived.currencyMismatch,
    allocationIncomplete,
    advisorEvidence: toAdvisorCashEvidence({
      total,
      committed,
      restricted,
      derived,
      organizationCurrency: currency,
    }),
  };
}

export async function updateCashPosition(params: {
  organizationId: string;
  totalBusinessCashCents?: number;
  committedCashCents?: number;
  restrictedCashCents?: number;
  source?: CashObservationSource;
}) {
  const source = params.source || CASH_SOURCE_UPDATE;
  const writes: Array<Promise<unknown>> = [];
  if (params.totalBusinessCashCents !== undefined) {
    writes.push(
      recordCashComponentObservation({
        organizationId: params.organizationId,
        metricKey: CASH_BALANCE_METRIC_KEY,
        amountCents: params.totalBusinessCashCents,
        source,
      })
    );
  }
  if (params.committedCashCents !== undefined) {
    writes.push(
      recordCashComponentObservation({
        organizationId: params.organizationId,
        metricKey: COMMITTED_CASH_METRIC_KEY,
        amountCents: params.committedCashCents,
        source,
      })
    );
  }
  if (params.restrictedCashCents !== undefined) {
    writes.push(
      recordCashComponentObservation({
        organizationId: params.organizationId,
        metricKey: RESTRICTED_CASH_METRIC_KEY,
        amountCents: params.restrictedCashCents,
        source,
      })
    );
  }
  if (writes.length === 0) {
    return resolveCashPosition(params.organizationId);
  }
  await Promise.all(writes);
  await prisma.dataReadinessItem.updateMany({
    where: {
      organizationId: params.organizationId,
      datasetKey: 'loans_cash',
    },
    data: { status: 'MANUAL' },
  });
  return resolveCashPosition(params.organizationId);
}
