import prisma from '../../config/prisma';
import { cashIsRecorded } from './metricAvailability';

export const CASH_BALANCE_METRIC_KEY = 'cash_balance';

export const CASH_SOURCE_ONBOARDING = 'manual_onboarding';
export const CASH_SOURCE_UPDATE = 'manual_update';

export type CashObservationSource =
  | typeof CASH_SOURCE_ONBOARDING
  | typeof CASH_SOURCE_UPDATE;

export type CurrentCashBalance = {
  cashBalanceCents: number | null;
  cashBalanceAsOf: Date | null;
  cashBalanceAvailable: boolean;
  currency: string;
};

/**
 * Append-only dated cash observation. Never updates or deletes prior snapshots.
 * Organization.cashBalanceCents remains the current-value cache for existing callers.
 */
export async function recordCashBalanceObservation(params: {
  organizationId: string;
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

  const snapshot = await prisma.metricSnapshot.create({
    data: {
      organizationId: params.organizationId,
      metricKey: CASH_BALANCE_METRIC_KEY,
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

  await prisma.organization.update({
    where: { id: params.organizationId },
    data: {
      cashBalanceCents: params.amountCents,
      cashBalanceAsOf: asOf,
    },
  });

  return snapshot;
}

export async function latestCashBalanceObservation(organizationId: string) {
  return prisma.metricSnapshot.findFirst({
    where: { organizationId, metricKey: CASH_BALANCE_METRIC_KEY },
    orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
  });
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
