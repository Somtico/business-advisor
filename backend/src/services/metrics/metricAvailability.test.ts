import {
  cashIsRecorded,
  cashOutlookIsReady,
  enrolmentCountIsReady,
  forecastsAreReady,
  knownOrMissing,
  labourOpportunityIsReady,
  monthExpensesAreReady,
  verifiedImpactIsReady,
} from './metricAvailability';

describe('missing versus known-zero semantics', () => {
  it('does not treat a missing value as zero', () => {
    expect(knownOrMissing(false, 0)).toBeNull();
    expect(knownOrMissing(true, 0)).toBe(0);
    expect(knownOrMissing(true, 1500000)).toBe(1500000);
  });

  it('treats cash as unrecorded until cashBalanceAsOf is set', () => {
    expect(cashIsRecorded(null)).toBe(false);
    expect(cashIsRecorded(undefined)).toBe(false);
    expect(cashIsRecorded(new Date('2026-08-18T00:00:00Z'))).toBe(true);
  });

  it('requires revenue and cost signals before a cash outlook is ready', () => {
    expect(
      cashOutlookIsReady({ hasRevenueSignal: false, hasCostSignal: false })
    ).toBe(false);
    expect(
      cashOutlookIsReady({ hasRevenueSignal: true, hasCostSignal: false })
    ).toBe(false);
    expect(
      cashOutlookIsReady({ hasRevenueSignal: true, hasCostSignal: true })
    ).toBe(true);
  });

  it('treats Active Students as unavailable when no enrolment records exist', () => {
    expect(enrolmentCountIsReady(0)).toBe(false);
    expect(enrolmentCountIsReady(1)).toBe(true);
    expect(knownOrMissing(enrolmentCountIsReady(0), 0)).toBeNull();
    expect(knownOrMissing(enrolmentCountIsReady(3), 0)).toBe(0);
  });

  it('treats labour opportunity as unavailable without shifts and sessions', () => {
    expect(labourOpportunityIsReady({ shiftCount: 0, sessionCount: 0 })).toBe(
      false
    );
    expect(labourOpportunityIsReady({ shiftCount: 2, sessionCount: 0 })).toBe(
      false
    );
    expect(labourOpportunityIsReady({ shiftCount: 2, sessionCount: 1 })).toBe(
      true
    );
  });

  it('treats month expenses as unavailable when no expense records exist', () => {
    expect(monthExpensesAreReady(0)).toBe(false);
    expect(monthExpensesAreReady(1)).toBe(true);
    expect(knownOrMissing(monthExpensesAreReady(0), 0)).toBeNull();
    expect(knownOrMissing(monthExpensesAreReady(4), 0)).toBe(0);
  });

  it('does not build numeric forecasts without enrolment history', () => {
    expect(forecastsAreReady(0)).toBe(false);
    expect(forecastsAreReady(2)).toBe(true);
  });

  it('shows verified impact of zero only when a verified action exists', () => {
    expect(verifiedImpactIsReady(0)).toBe(false);
    expect(verifiedImpactIsReady(1)).toBe(true);
    expect(knownOrMissing(verifiedImpactIsReady(0), 0)).toBeNull();
    expect(knownOrMissing(verifiedImpactIsReady(1), 0)).toBe(0);
  });
});
