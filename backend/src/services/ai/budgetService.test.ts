jest.mock('../../config/prisma', () => {
  const aggregate = jest.fn();
  const tx = {
    aiOrgSpendLock: { upsert: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
    aiUsageEvent: { aggregate },
  };
  return {
    __esModule: true,
    default: {
      __aggregate: aggregate,
      __tx: tx,
      aiBudgetConfig: { findMany: jest.fn().mockResolvedValue([]) },
      aiUsageEvent: { aggregate },
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx)
      ),
    },
  };
});

import prisma from '../../config/prisma';
import {
  assertBudgetAllows,
  assertProviderBudgetAllows,
  resolveOrgBudgets,
} from './budgetService';

type MockPrisma = typeof prisma & {
  __aggregate: jest.Mock;
};

const mockPrisma = prisma as MockPrisma;

describe('AI budget service', () => {
  beforeEach(() => {
    process.env.AI_DEFAULT_ORG_DAILY_BUDGET_USD = '2';
    process.env.AI_DEFAULT_ORG_MONTHLY_BUDGET_USD = '25';
    process.env.AI_GLOBAL_DAILY_BUDGET_USD = '5';
    process.env.AI_GLOBAL_MONTHLY_BUDGET_USD = '100';
    process.env.ANTHROPIC_MONTHLY_COST_CAP_USD = '80';
    process.env.AI_BUDGET_HARD_BLOCK_PERCENT = '100';
    process.env.AI_BUDGET_WARNING_PERCENTAGES = '50,80,100';
    (prisma.aiBudgetConfig.findMany as jest.Mock).mockResolvedValue([]);
    mockPrisma.__aggregate.mockResolvedValue({
      _sum: { estimatedCostUsdMicros: 0n },
    });
  });

  it('uses an organization override over environment defaults', async () => {
    (prisma.aiBudgetConfig.findMany as jest.Mock).mockResolvedValue([
      {
        scope: 'ORGANIZATION',
        organizationId: 'org-1',
        monthlyBudgetUsdMicros: 9_000_000n,
        dailyBudgetUsdMicros: 900_000n,
        hardBlockAtPercent: 95,
        softThresholdsPercent: [60, 85],
      },
    ]);
    const budgets = await resolveOrgBudgets('org-1');
    expect(budgets.monthlyMicros).toBe(9_000_000n);
    expect(budgets.dailyMicros).toBe(900_000n);
    expect(budgets.hardBlockAtPercent).toBe(95);
    expect(budgets.softThresholds).toEqual([60, 85]);
  });

  it('blocks before a provider call would exceed the organization daily cap', async () => {
    let call = 0;
    mockPrisma.__aggregate.mockImplementation(async () => {
      call += 1;
      return {
        _sum: {
          estimatedCostUsdMicros: call === 2 ? 1_900_000n : 0n,
        },
      };
    });
    await expect(
      assertBudgetAllows({
        organizationId: 'org-1',
        feature: 'ask_advisor',
        reserveMicros: 500_000n,
      })
    ).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
      details: { scope: 'organization_daily' },
    });
  });

  it('returns soft thresholds while spend remains below the hard cap', async () => {
    let call = 0;
    mockPrisma.__aggregate.mockImplementation(async () => {
      call += 1;
      // 1 = org monthly (~52% of $25); keep daily/global under caps
      return {
        _sum: {
          estimatedCostUsdMicros: call === 1 ? 13_000_000n : 0n,
        },
      };
    });
    const decision = await assertBudgetAllows({
      organizationId: 'org-1',
      feature: 'ask_advisor',
      reserveMicros: 0n,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.softWarnings).toContain(50);
  });

  it('blocks a provider whose monthly application cap is reached', async () => {
    mockPrisma.__aggregate.mockResolvedValue({
      _sum: { estimatedCostUsdMicros: 80_000_000n },
    });
    await expect(
      assertProviderBudgetAllows('anthropic', 1n)
    ).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
      details: { scope: 'provider_monthly', provider: 'anthropic' },
    });
  });
});
