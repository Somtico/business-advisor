import {
  CASH_BALANCE_METRIC_KEY,
  COMMITTED_CASH_METRIC_KEY,
  CASH_SOURCE_ONBOARDING,
  CASH_SOURCE_UPDATE,
  RESTRICTED_CASH_METRIC_KEY,
  latestCashComponentObservation,
  recordCashComponentObservation,
  resolveCashPosition,
  updateCashPosition,
} from './cashObservationService';

jest.mock('../../config/prisma', () => ({
  __esModule: true,
  default: {
    organization: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    metricSnapshot: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    dataReadinessItem: {
      updateMany: jest.fn(),
    },
    expenseTransaction: {
      create: jest.fn(),
    },
  },
}));

import prisma from '../../config/prisma';

describe('cash component observations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.organization.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      currency: 'CAD',
      cashBalanceCents: 0,
      cashBalanceAsOf: null,
    });
    (prisma.metricSnapshot.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `snap-${data.metricKey}`,
        ...data,
      })
    );
    (prisma.metricSnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organization.update as jest.Mock).mockResolvedValue({});
    (prisma.dataReadinessItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('keeps committed and restricted snapshots append-only and org-scoped', async () => {
    await recordCashComponentObservation({
      organizationId: 'org-a',
      metricKey: COMMITTED_CASH_METRIC_KEY,
      amountCents: 1_200_000,
      source: CASH_SOURCE_UPDATE,
    });
    await recordCashComponentObservation({
      organizationId: 'org-a',
      metricKey: RESTRICTED_CASH_METRIC_KEY,
      amountCents: 500_000,
      source: CASH_SOURCE_UPDATE,
    });
    const keys = (prisma.metricSnapshot.create as jest.Mock).mock.calls.map(
      (c) => c[0].data.metricKey
    );
    expect(keys).toEqual([COMMITTED_CASH_METRIC_KEY, RESTRICTED_CASH_METRIC_KEY]);
    expect(prisma.metricSnapshot.update).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
    for (const call of (prisma.metricSnapshot.create as jest.Mock).mock.calls) {
      expect(call[0].data.organizationId).toBe('org-a');
      expect(call[0].data.organizationId).not.toBe('org-b');
      expect(call[0].data.unit).toBe('CAD');
    }
  });

  it('does not create an expense when a cash commitment is recorded', async () => {
    await updateCashPosition({
      organizationId: 'org-a',
      committedCashCents: 500_000,
    });
    expect(prisma.expenseTransaction.create).not.toHaveBeenCalled();
    expect(prisma.metricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metricKey: COMMITTED_CASH_METRIC_KEY,
          value: 500_000,
          organizationId: 'org-a',
        }),
      })
    );
  });

  it('queries committed observations only for the requested organization', async () => {
    await latestCashComponentObservation('org-a', COMMITTED_CASH_METRIC_KEY);
    const where = (prisma.metricSnapshot.findFirst as jest.Mock).mock.calls[0][0]
      .where;
    expect(where.organizationId).toBe('org-a');
    expect(where.organizationId).not.toBe('org-b');
    expect(where.metricKey).toBe(COMMITTED_CASH_METRIC_KEY);
  });

  it('rejects a currency that does not match the organization base currency', async () => {
    await expect(
      recordCashComponentObservation({
        organizationId: 'org-a',
        metricKey: CASH_BALANCE_METRIC_KEY,
        amountCents: 100,
        source: CASH_SOURCE_UPDATE,
        currency: 'USD',
      })
    ).rejects.toThrow('CURRENCY_MISMATCH');
    expect(prisma.metricSnapshot.create).not.toHaveBeenCalled();
  });

  it('treats missing committed and restricted snapshots as unknown, not zero', async () => {
    (prisma.metricSnapshot.findFirst as jest.Mock).mockImplementation(
      async ({ where }: { where: { metricKey: string } }) => {
        if (where.metricKey === CASH_BALANCE_METRIC_KEY) {
          return {
            value: 1_500_000,
            asOf: new Date('2026-08-18T00:00:00Z'),
            unit: 'CAD',
          };
        }
        return null;
      }
    );
    const position = await resolveCashPosition('org-a');
    expect(position.total.available).toBe(true);
    expect(position.total.amountCents).toBe(1_500_000);
    expect(position.committed.status).toBe('unknown');
    expect(position.committed.amountCents).toBeNull();
    expect(position.restricted.status).toBe('unknown');
    expect(position.availableOperatingCashAvailable).toBe(false);
    expect(position.allocationIncomplete).toBe(true);
  });

  it('records deposited cash as total business cash even if it was borrowed', async () => {
    await recordCashComponentObservation({
      organizationId: 'org-a',
      metricKey: CASH_BALANCE_METRIC_KEY,
      amountCents: 1_500_000,
      source: CASH_SOURCE_ONBOARDING,
    });
    expect(prisma.metricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metricKey: CASH_BALANCE_METRIC_KEY,
          value: 1_500_000,
        }),
      })
    );
  });
});
