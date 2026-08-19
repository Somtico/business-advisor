import {
  parseDollarInputToCents,
  parseOptionalCashBalanceCents,
} from '../lib/parseMoney';
import { completeOnboarding, OnboardingError } from './onboardingService';
import {
  CASH_BALANCE_METRIC_KEY,
  CASH_SOURCE_ONBOARDING,
  currentCashFromOrganization,
  latestCashBalanceObservation,
  recordCashBalanceObservation,
} from './metrics/cashObservationService';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    organization: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    metricSnapshot: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

import prisma from '../config/prisma';

describe('parseDollarInputToCents', () => {
  it('keeps blank distinct from zero', () => {
    expect(parseDollarInputToCents('')).toBeNull();
    expect(parseDollarInputToCents('   ')).toBeNull();
    expect(parseDollarInputToCents('0')).toBe(0);
    expect(parseDollarInputToCents('0.00')).toBe(0);
  });

  it('strips commas and stores integer cents', () => {
    expect(parseDollarInputToCents('15,000')).toBe(1_500_000);
    expect(parseDollarInputToCents('15000.50')).toBe(1_500_050);
  });
});

describe('parseOptionalCashBalanceCents', () => {
  it('omits blank and keeps a known zero', () => {
    expect(parseOptionalCashBalanceCents(undefined)).toBeUndefined();
    expect(parseOptionalCashBalanceCents(null)).toBeUndefined();
    expect(parseOptionalCashBalanceCents('')).toBeUndefined();
    expect(parseOptionalCashBalanceCents(0)).toBe(0);
    expect(parseOptionalCashBalanceCents(1500000)).toBe(1_500_000);
  });
});

describe('current cash availability', () => {
  it('does not treat a default Organization.cashBalanceCents of 0 as recorded', () => {
    const unknown = currentCashFromOrganization({
      cashBalanceCents: 0,
      cashBalanceAsOf: null,
      currency: 'CAD',
    });
    expect(unknown.cashBalanceAvailable).toBe(false);
    expect(unknown.cashBalanceCents).toBeNull();

    const knownZero = currentCashFromOrganization({
      cashBalanceCents: 0,
      cashBalanceAsOf: new Date('2026-08-18T12:00:00Z'),
      currency: 'CAD',
    });
    expect(knownZero.cashBalanceAvailable).toBe(true);
    expect(knownZero.cashBalanceCents).toBe(0);
  });
});

describe('recordCashBalanceObservation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.organization.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      currency: 'CAD',
    });
    (prisma.metricSnapshot.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'snap-1',
        ...data,
      })
    );
    (prisma.organization.update as jest.Mock).mockResolvedValue({});
  });

  it('creates an append-only snapshot scoped to the organization', async () => {
    await recordCashBalanceObservation({
      organizationId: 'org-a',
      amountCents: 1_500_000,
      source: CASH_SOURCE_ONBOARDING,
    });
    expect(prisma.metricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-a',
          metricKey: CASH_BALANCE_METRIC_KEY,
          value: 1_500_000,
          unit: 'CAD',
        }),
      })
    );
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-a' },
        data: expect.objectContaining({ cashBalanceCents: 1_500_000 }),
      })
    );
  });

  it('does not read another organization when recording cash', async () => {
    await recordCashBalanceObservation({
      organizationId: 'org-a',
      amountCents: 100,
      source: CASH_SOURCE_ONBOARDING,
    });
    const createArg = (prisma.metricSnapshot.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.organizationId).toBe('org-a');
    expect(createArg.data.organizationId).not.toBe('org-b');
  });
});

describe('latestCashBalanceObservation organization scoping', () => {
  it('queries snapshots only for the requested organization', async () => {
    (prisma.metricSnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    await latestCashBalanceObservation('org-a');
    expect(prisma.metricSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          metricKey: CASH_BALANCE_METRIC_KEY,
        }),
      })
    );
    const where = (prisma.metricSnapshot.findFirst as jest.Mock).mock.calls[0][0]
      .where;
    expect(where.organizationId).not.toBe('org-b');
  });
});

describe('completeOnboarding', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.organization.update as jest.Mock).mockResolvedValue({
      id: 'org-a',
      educationSubtype: 'STEM_ACADEMY',
    });
    (prisma.organization.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'org-a',
      currency: 'CAD',
      educationSubtype: 'STEM_ACADEMY',
      cashBalanceCents: 0,
      cashBalanceAsOf: null,
    });
    (prisma.metricSnapshot.create as jest.Mock).mockResolvedValue({ id: 'snap-1' });
  });

  it('requires education subtype', async () => {
    await expect(
      completeOnboarding({
        organizationId: 'org-a',
        educationSubtype: '',
      })
    ).rejects.toMatchObject({ code: 'EDUCATION_SUBTYPE_REQUIRED' });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('does not convert blank cash to zero or write a snapshot', async () => {
    await completeOnboarding({
      organizationId: 'org-a',
      educationSubtype: 'STEM_ACADEMY',
    });
    expect(prisma.metricSnapshot.create).not.toHaveBeenCalled();
    const updateData = (prisma.organization.update as jest.Mock).mock.calls[0][0]
      .data;
    expect(updateData.cashBalanceCents).toBeUndefined();
    expect(updateData.onboardingCompleted).toBe(true);
  });

  it('records a known zero cash observation when 0 is supplied', async () => {
    await completeOnboarding({
      organizationId: 'org-a',
      educationSubtype: 'STEM_ACADEMY',
      cashBalanceCents: 0,
    });
    expect(prisma.metricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-a',
          value: 0,
        }),
      })
    );
  });

  it('creates a dated cash observation for a supplied amount without rewriting prior snapshots', async () => {
    await completeOnboarding({
      organizationId: 'org-a',
      educationSubtype: 'STEM_ACADEMY',
      cashBalanceCents: 1_500_000,
    });
    expect(prisma.metricSnapshot.create).toHaveBeenCalledTimes(1);
    expect(prisma.metricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-a',
          metricKey: CASH_BALANCE_METRIC_KEY,
          value: 1_500_000,
        }),
      })
    );
    expect(prisma.metricSnapshot.update).toBeUndefined();
  });

  it('scopes the cash observation to the onboarding organization', async () => {
    await completeOnboarding({
      organizationId: 'org-a',
      educationSubtype: 'STEM_ACADEMY',
      cashBalanceCents: 500,
    });
    expect(
      (prisma.metricSnapshot.create as jest.Mock).mock.calls[0][0].data
        .organizationId
    ).toBe('org-a');
  });

  it('keeps Other subtype required', async () => {
    await expect(
      completeOnboarding({
        organizationId: 'org-a',
        educationSubtype: 'OTHER',
        educationSubtypeOther: '  ',
      })
    ).rejects.toBeInstanceOf(OnboardingError);
  });
});
