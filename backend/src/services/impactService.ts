import prisma from '../config/prisma';

/**
 * Advice impact ledger rollups.
 *
 * Trust rules:
 * - Only COMPLETED recommendations with a verified realizedSource
 *   (MEASURED or USER_CONFIRMED) count as verified impact.
 * - Completed recommendations with an expected figure but no verification yet
 *   are reported separately as "estimated pending" — never blended into the
 *   verified number.
 * - OPEN / ACCEPTED / IN_PROGRESS expected impact is the pipeline, also kept
 *   separate.
 */

export interface ImpactBucket {
  savedCents: number;
  earnedCents: number;
  otherCents: number;
  totalCents: number;
}

export interface ImpactSummary {
  verified: ImpactBucket & { actionCount: number };
  thisMonth: ImpactBucket;
  estimatedPendingCents: number;
  estimatedPendingCount: number;
  pipelineExpectedCents: number;
  pipelineCount: number;
  awaitingConfirmationCount: number;
  completedActionCount: number;
  monthly: { month: string; savedCents: number; earnedCents: number }[];
}

function emptyBucket(): ImpactBucket {
  return { savedCents: 0, earnedCents: 0, otherCents: 0, totalCents: 0 };
}

function addToBucket(
  bucket: ImpactBucket,
  impactType: string | null,
  cents: number
) {
  if (impactType === 'SAVINGS') bucket.savedCents += cents;
  else if (impactType === 'REVENUE') bucket.earnedCents += cents;
  else bucket.otherCents += cents;
  bucket.totalCents += cents;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function impactSummary(
  organizationId: string
): Promise<ImpactSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [verifiedRows, completedRows, pipelineRows] = await Promise.all([
    prisma.recommendation.findMany({
      where: {
        organizationId,
        status: 'COMPLETED',
        realizedSource: { in: ['MEASURED', 'USER_CONFIRMED'] },
        realizedImpactCents: { not: null },
      },
      select: {
        impactType: true,
        realizedImpactCents: true,
        realizedAt: true,
      },
    }),
    prisma.recommendation.findMany({
      where: { organizationId, status: 'COMPLETED' },
      select: {
        expectedImpactCents: true,
        realizedSource: true,
        verificationDueAt: true,
      },
    }),
    prisma.recommendation.findMany({
      where: {
        organizationId,
        status: { in: ['OPEN', 'ACCEPTED', 'IN_PROGRESS'] },
        expectedImpactCents: { not: null, gt: 0 },
      },
      select: { expectedImpactCents: true },
    }),
  ]);

  const verified: ImpactBucket & { actionCount: number } = {
    ...emptyBucket(),
    actionCount: verifiedRows.length,
  };
  const thisMonth = emptyBucket();
  const monthlyMap = new Map<
    string,
    { savedCents: number; earnedCents: number }
  >();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyMap.set(monthKey(d), { savedCents: 0, earnedCents: 0 });
  }

  for (const row of verifiedRows) {
    const cents = row.realizedImpactCents ?? 0;
    addToBucket(verified, row.impactType, cents);
    const at = row.realizedAt ?? now;
    if (at >= monthStart) addToBucket(thisMonth, row.impactType, cents);
    if (at >= sixMonthsStart) {
      const key = monthKey(at);
      const slot = monthlyMap.get(key);
      if (slot) {
        if (row.impactType === 'REVENUE') slot.earnedCents += cents;
        else slot.savedCents += cents;
      }
    }
  }

  let estimatedPendingCents = 0;
  let estimatedPendingCount = 0;
  let awaitingConfirmationCount = 0;
  for (const row of completedRows) {
    if (row.realizedSource) continue;
    awaitingConfirmationCount += 1;
    if (row.expectedImpactCents != null && row.expectedImpactCents > 0) {
      estimatedPendingCents += row.expectedImpactCents;
      estimatedPendingCount += 1;
    }
  }

  const pipelineExpectedCents = pipelineRows.reduce(
    (sum, r) => sum + (r.expectedImpactCents ?? 0),
    0
  );

  return {
    verified,
    thisMonth,
    estimatedPendingCents,
    estimatedPendingCount,
    pipelineExpectedCents,
    pipelineCount: pipelineRows.length,
    awaitingConfirmationCount,
    completedActionCount: completedRows.length,
    monthly: Array.from(monthlyMap.entries()).map(([month, v]) => ({
      month,
      ...v,
    })),
  };
}
