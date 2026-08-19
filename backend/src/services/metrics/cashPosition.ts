export const CASH_BALANCE_METRIC_KEY = 'cash_balance';
export const COMMITTED_CASH_METRIC_KEY = 'committed_cash';
export const RESTRICTED_CASH_METRIC_KEY = 'restricted_cash';

export type CashComponentStatus = 'unknown' | 'known_zero' | 'known_positive';

export type CashComponent = {
  amountCents: number | null;
  available: boolean;
  asOf: Date | string | null;
  currency: string | null;
  status: CashComponentStatus;
};

export type DerivedOperatingCash = {
  availableOperatingCashCents: number | null;
  availableOperatingCashAvailable: boolean;
  commitmentGapCents: number;
  commitmentGapPresent: boolean;
  currencyMismatch: boolean;
  missingComponents: Array<'total' | 'committed' | 'restricted'>;
};

export function cashComponentStatus(amountCents: number | null, available: boolean): CashComponentStatus {
  if (!available || amountCents == null) return 'unknown';
  if (amountCents === 0) return 'known_zero';
  return 'known_positive';
}

export function componentFromObservation(params: {
  amountCents: number | null;
  available: boolean;
  asOf: Date | string | null;
  currency: string | null;
}): CashComponent {
  return {
    ...params,
    amountCents: params.available ? params.amountCents : null,
    status: cashComponentStatus(
      params.available ? params.amountCents : null,
      params.available
    ),
  };
}

/**
 * Available Operating Cash is derived, never stored.
 * Unknown committed or restricted cash must not be treated as $0.
 * Currencies that do not match the organization base currency are not combined.
 */
export function deriveOperatingCash(params: {
  total: CashComponent;
  committed: CashComponent;
  restricted: CashComponent;
  organizationCurrency: string;
}): DerivedOperatingCash {
  const missing: Array<'total' | 'committed' | 'restricted'> = [];
  if (!params.total.available || params.total.amountCents == null) missing.push('total');
  if (!params.committed.available || params.committed.amountCents == null) {
    missing.push('committed');
  }
  if (!params.restricted.available || params.restricted.amountCents == null) {
    missing.push('restricted');
  }

  const known = [params.total, params.committed, params.restricted].filter(
    (c) => c.available && c.currency
  );
  const currencyMismatch = known.some(
    (c) => (c.currency || '').toUpperCase() !== params.organizationCurrency.toUpperCase()
  );

  if (missing.length > 0 || currencyMismatch) {
    return {
      availableOperatingCashCents: null,
      availableOperatingCashAvailable: false,
      commitmentGapCents: 0,
      commitmentGapPresent: false,
      currencyMismatch,
      missingComponents: missing,
    };
  }

  const total = params.total.amountCents as number;
  const committed = params.committed.amountCents as number;
  const restricted = params.restricted.amountCents as number;
  const remainder = total - committed - restricted;

  return {
    availableOperatingCashCents: Math.max(remainder, 0),
    availableOperatingCashAvailable: true,
    commitmentGapCents: Math.max(-remainder, 0),
    commitmentGapPresent: remainder < 0,
    currencyMismatch: false,
    missingComponents: [],
  };
}

/**
 * Runway and cash-flow forecasts start from Total Business Cash.
 * Committed / restricted amounts classify cash already on hand; they are not extra expenses.
 */
export function startingCashForRunway(total: CashComponent): number | null {
  if (!total.available || total.amountCents == null) return null;
  return total.amountCents;
}

export function toAdvisorCashEvidence(params: {
  total: CashComponent;
  committed: CashComponent;
  restricted: CashComponent;
  derived: DerivedOperatingCash;
  organizationCurrency: string;
}) {
  return {
    totalBusinessCashCents: params.total.amountCents,
    totalBusinessCashKnown: params.total.available,
    totalBusinessCashStatus: params.total.status,
    committedCashCents: params.committed.amountCents,
    committedCashKnown: params.committed.available,
    committedCashStatus: params.committed.status,
    restrictedCashCents: params.restricted.amountCents,
    restrictedCashKnown: params.restricted.available,
    restrictedCashStatus: params.restricted.status,
    availableOperatingCashCents: params.derived.availableOperatingCashCents,
    availableOperatingCashKnown: params.derived.availableOperatingCashAvailable,
    commitmentGapCents: params.derived.commitmentGapPresent
      ? params.derived.commitmentGapCents
      : 0,
    commitmentGapPresent: params.derived.commitmentGapPresent,
    currency: params.organizationCurrency,
    currencyMismatch: params.derived.currencyMismatch,
    note:
      'Total business cash is money actually in the bank, including deposited borrowed funds. ' +
      'Committed and restricted cash are still cash, not expenses. ' +
      'Do not treat total cash as freely available unless available operating cash is known. ' +
      'Do not invent committed or restricted amounts.',
  };
}
