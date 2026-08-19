export type MetricStatus = 'READY' | 'INSUFFICIENT_DATA';

/** A displayed zero is allowed only when the system actually observed the value. */
export function knownOrMissing<T>(available: boolean, value: T): T | null {
  return available ? value : null;
}

export function cashIsRecorded(cashBalanceAsOf: Date | string | null | undefined): boolean {
  return cashBalanceAsOf != null;
}

export function cashOutlookIsReady(params: {
  hasRevenueSignal: boolean;
  hasCostSignal: boolean;
}): boolean {
  return params.hasRevenueSignal && params.hasCostSignal;
}

export function enrolmentCountIsReady(engagementRecordCount: number): boolean {
  return engagementRecordCount > 0;
}

export function labourOpportunityIsReady(params: {
  shiftCount: number;
  sessionCount: number;
}): boolean {
  return params.shiftCount > 0 && params.sessionCount > 0;
}

export function monthExpensesAreReady(expenseRecordCount: number): boolean {
  return expenseRecordCount > 0;
}

export function forecastsAreReady(engagementRecordCount: number): boolean {
  return engagementRecordCount > 0;
}

export function verifiedImpactIsReady(verifiedActionCount: number): boolean {
  return verifiedActionCount > 0;
}
