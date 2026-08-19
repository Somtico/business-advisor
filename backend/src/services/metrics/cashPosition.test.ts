import {
  componentFromObservation,
  deriveOperatingCash,
  startingCashForRunway,
  toAdvisorCashEvidence,
} from './cashPosition';

function known(amountCents: number, currency = 'CAD') {
  return componentFromObservation({
    amountCents,
    available: true,
    asOf: '2026-08-18T00:00:00Z',
    currency,
  });
}

function unknown(currency = 'CAD') {
  return componentFromObservation({
    amountCents: null,
    available: false,
    asOf: null,
    currency,
  });
}

describe('deriveOperatingCash', () => {
  it('returns 1500000 available from 4000000 total, 1800000 committed, 700000 restricted', () => {
    const derived = deriveOperatingCash({
      total: known(4_000_000),
      committed: known(1_800_000),
      restricted: known(700_000),
      organizationCurrency: 'CAD',
    });
    expect(derived.availableOperatingCashAvailable).toBe(true);
    expect(derived.availableOperatingCashCents).toBe(1_500_000);
    expect(derived.commitmentGapPresent).toBe(false);
  });

  it('returns total as available when committed and restricted are known zeros', () => {
    const derived = deriveOperatingCash({
      total: known(1_500_000),
      committed: known(0),
      restricted: known(0),
      organizationCurrency: 'CAD',
    });
    expect(derived.availableOperatingCashCents).toBe(1_500_000);
    expect(derived.commitmentGapCents).toBe(0);
  });

  it('does not treat unknown committed cash as zero', () => {
    const derived = deriveOperatingCash({
      total: known(1_500_000),
      committed: unknown(),
      restricted: known(0),
      organizationCurrency: 'CAD',
    });
    expect(derived.availableOperatingCashAvailable).toBe(false);
    expect(derived.availableOperatingCashCents).toBeNull();
    expect(derived.missingComponents).toContain('committed');
  });

  it('does not treat unknown restricted cash as zero', () => {
    const derived = deriveOperatingCash({
      total: known(1_500_000),
      committed: known(0),
      restricted: unknown(),
      organizationCurrency: 'CAD',
    });
    expect(derived.availableOperatingCashAvailable).toBe(false);
    expect(derived.missingComponents).toContain('restricted');
  });

  it('caps available at zero and reports a commitment gap when allocations exceed cash', () => {
    const derived = deriveOperatingCash({
      total: known(1_500_000),
      committed: known(1_200_000),
      restricted: known(500_000),
      organizationCurrency: 'CAD',
    });
    expect(derived.availableOperatingCashCents).toBe(0);
    expect(derived.commitmentGapPresent).toBe(true);
    expect(derived.commitmentGapCents).toBe(200_000);
  });

  it('cannot derive available operating cash when total cash is unknown', () => {
    const derived = deriveOperatingCash({
      total: unknown(),
      committed: known(0),
      restricted: known(0),
      organizationCurrency: 'CAD',
    });
    expect(derived.availableOperatingCashAvailable).toBe(false);
    expect(derived.availableOperatingCashCents).toBeNull();
    expect(derived.missingComponents).toContain('total');
  });

  it('does not silently combine mismatched currencies', () => {
    const derived = deriveOperatingCash({
      total: known(1_500_000, 'CAD'),
      committed: known(100_000, 'USD'),
      restricted: known(0, 'CAD'),
      organizationCurrency: 'CAD',
    });
    expect(derived.currencyMismatch).toBe(true);
    expect(derived.availableOperatingCashAvailable).toBe(false);
    expect(derived.availableOperatingCashCents).toBeNull();
  });
});

describe('missing versus known zero for cash components', () => {
  it.each(['total', 'committed', 'restricted'] as const)(
    '%s: no observation is unknown, 0 is known zero, positive is known positive',
    (key) => {
      const missing = unknown();
      const zero = known(0);
      const positive = known(250_000);
      expect(missing.status).toBe('unknown');
      expect(missing.available).toBe(false);
      expect(missing.amountCents).toBeNull();
      expect(zero.status).toBe('known_zero');
      expect(zero.amountCents).toBe(0);
      expect(positive.status).toBe('known_positive');
      expect(positive.amountCents).toBe(250_000);
      void key;
    }
  );
});

describe('forecast protection', () => {
  it('uses total business cash for runway, not available operating cash', () => {
    const total = known(2_000_000);
    const derived = deriveOperatingCash({
      total,
      committed: known(500_000),
      restricted: known(0),
      organizationCurrency: 'CAD',
    });
    expect(startingCashForRunway(total)).toBe(2_000_000);
    expect(startingCashForRunway(total)).not.toBe(derived.availableOperatingCashCents);
  });
});

describe('advisor cash evidence', () => {
  it('distinguishes total cash from available cash and does not coerce missing to zero', () => {
    const total = known(4_000_000);
    const committed = known(1_800_000);
    const restricted = known(700_000);
    const derived = deriveOperatingCash({
      total,
      committed,
      restricted,
      organizationCurrency: 'CAD',
    });
    const evidence = toAdvisorCashEvidence({
      total,
      committed,
      restricted,
      derived,
      organizationCurrency: 'CAD',
    });
    expect(evidence.totalBusinessCashCents).toBe(4_000_000);
    expect(evidence.availableOperatingCashCents).toBe(1_500_000);
    expect(evidence.totalBusinessCashKnown).toBe(true);
    expect(evidence.note).toMatch(/not expenses/i);
    expect(evidence.note).toMatch(/Do not treat total cash as freely available/);
  });

  it('exposes unknown statuses and commitment-gap information', () => {
    const total = known(1_500_000);
    const committed = unknown();
    const restricted = unknown();
    const derived = deriveOperatingCash({
      total,
      committed,
      restricted,
      organizationCurrency: 'CAD',
    });
    const evidence = toAdvisorCashEvidence({
      total,
      committed,
      restricted,
      derived,
      organizationCurrency: 'CAD',
    });
    expect(evidence.committedCashKnown).toBe(false);
    expect(evidence.committedCashCents).toBeNull();
    expect(evidence.availableOperatingCashKnown).toBe(false);
    expect(evidence.commitmentGapPresent).toBe(false);

    const gap = deriveOperatingCash({
      total: known(1_500_000),
      committed: known(1_200_000),
      restricted: known(500_000),
      organizationCurrency: 'CAD',
    });
    const gapEvidence = toAdvisorCashEvidence({
      total: known(1_500_000),
      committed: known(1_200_000),
      restricted: known(500_000),
      derived: gap,
      organizationCurrency: 'CAD',
    });
    expect(gapEvidence.commitmentGapPresent).toBe(true);
    expect(gapEvidence.commitmentGapCents).toBe(200_000);
    expect(gapEvidence.availableOperatingCashCents).toBe(0);
  });
});
