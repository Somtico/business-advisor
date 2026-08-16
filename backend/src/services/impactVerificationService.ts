import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import {
  staffingVersusDemand,
  expenseRollup,
} from './metrics/analyticsService';
import {
  inferLifecycleFromRealizedImpact,
  recordLifecycleOutcome,
} from './moat/decisionOutcomeService';

export const IMPACT_VERIFICATION_DELAY_DAYS = 30;

/** Ignore measured deltas under $1 — noise, not evidence. */
const MIN_MEASURABLE_DELTA_CENTS = 100;

interface ImpactBaseline {
  capturedAt: string;
  staffing?: { labourCostCents: number; scheduledHours: number };
  expenses?: {
    recurringSubscriptionMonthlyCents: number;
    monthExpenseCents: number;
  };
}

/**
 * Snapshot the metrics we know how to re-measure later. Failure here must
 * never block completing an action — the user prompt is the fallback.
 */
export async function captureImpactBaseline(
  organizationId: string
): Promise<ImpactBaseline | null> {
  try {
    const [staffing, expenses] = await Promise.all([
      staffingVersusDemand(organizationId),
      expenseRollup(organizationId),
    ]);
    return {
      capturedAt: new Date().toISOString(),
      staffing: {
        labourCostCents: staffing.labourCostCents,
        scheduledHours: staffing.scheduledHours,
      },
      expenses: {
        recurringSubscriptionMonthlyCents:
          expenses.recurringSubscriptionMonthlyCents,
        monthExpenseCents: expenses.monthExpenseCents,
      },
    };
  } catch (err) {
    console.error('captureImpactBaseline failed', err);
    return null;
  }
}

interface MeasuredResult {
  cents: number;
  note: string;
}

function capToExpected(
  deltaCents: number,
  expectedCents: number | null
): { cents: number; capped: boolean } {
  if (expectedCents != null && expectedCents > 0 && deltaCents > expectedCents) {
    return { cents: expectedCents, capped: true };
  }
  return { cents: deltaCents, capped: false };
}

async function measureRecommendation(
  organizationId: string,
  rec: {
    expectedImpactCents: number | null;
    baselineJson: Prisma.JsonValue | null;
    insight: { metricKeys: string[] } | null;
  }
): Promise<MeasuredResult | null> {
  const baseline = rec.baselineJson as ImpactBaseline | null;
  if (!baseline) return null;
  const metricKeys = rec.insight?.metricKeys ?? [];

  if (metricKeys.includes('staffing_vs_demand') && baseline.staffing) {
    const current = await staffingVersusDemand(organizationId);
    const delta =
      baseline.staffing.labourCostCents - current.labourCostCents;
    if (delta >= MIN_MEASURABLE_DELTA_CENTS) {
      const { cents, capped } = capToExpected(delta, rec.expectedImpactCents);
      return {
        cents,
        note: `Weekly labour cost moved from $${(baseline.staffing.labourCostCents / 100).toFixed(2)} to $${(current.labourCostCents / 100).toFixed(2)} after completion${capped ? ' (conservatively capped at the original estimate)' : ''}.`,
      };
    }
    return null;
  }

  if (metricKeys.includes('subscriptions') && baseline.expenses) {
    const current = await expenseRollup(organizationId);
    const delta =
      baseline.expenses.recurringSubscriptionMonthlyCents -
      current.recurringSubscriptionMonthlyCents;
    if (delta >= MIN_MEASURABLE_DELTA_CENTS) {
      const { cents, capped } = capToExpected(delta, rec.expectedImpactCents);
      return {
        cents,
        note: `Monthly recurring subscription spend moved from $${(baseline.expenses.recurringSubscriptionMonthlyCents / 100).toFixed(2)} to $${(current.recurringSubscriptionMonthlyCents / 100).toFixed(2)} after completion${capped ? ' (conservatively capped at the original estimate)' : ''}.`,
      };
    }
    return null;
  }

  return null;
}

/**
 * Process completed recommendations whose verification window has arrived.
 * Measured wins where the data supports it; otherwise the user is prompted
 * (alert + Action Centre confirmation form). Never writes a figure it cannot
 * back with data.
 */
export async function runImpactVerificationForOrg(organizationId: string) {
  const due = await prisma.recommendation.findMany({
    where: {
      organizationId,
      status: 'COMPLETED',
      realizedSource: null,
      verificationDueAt: { lte: new Date() },
    },
    include: { insight: { select: { metricKeys: true } } },
  });

  let measuredCount = 0;
  let awaitingUserCount = 0;

  for (const rec of due) {
    try {
      const measured = await measureRecommendation(organizationId, rec);
      if (measured) {
        await prisma.recommendation.update({
          where: { id: rec.id },
          data: {
            realizedImpactCents: measured.cents,
            realizedNote: measured.note,
            realizedSource: 'MEASURED',
            realizedAt: new Date(),
            verificationDueAt: null,
          },
        });
        await recordLifecycleOutcome({
          organizationId,
          recommendationId: rec.id,
          lifecycleOutcome: inferLifecycleFromRealizedImpact(measured.cents),
          outcomeVerificationType: 'MEASURED',
          realizedImpactCents: measured.cents,
        }).catch((err) =>
          console.error('recordLifecycleOutcome after measure failed', err)
        );
        measuredCount += 1;
      } else {
        await prisma.recommendation.update({
          where: { id: rec.id },
          data: { verificationDueAt: null },
        });
        await prisma.alert.create({
          data: {
            organizationId,
            title: `Confirm the Impact of "${rec.title}"`,
            body: 'You completed this action. Confirm what it saved or earned (or record no impact) in the Action Centre so your impact ledger stays accurate.',
            severity: 'info',
          },
        });
        awaitingUserCount += 1;
      }
    } catch (err) {
      console.error(`Impact verification failed for ${rec.id}`, err);
    }
  }

  return { due: due.length, measured: measuredCount, awaitingUser: awaitingUserCount };
}

export async function runImpactVerificationAllOrgs() {
  const orgs = await prisma.organization.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true },
  });
  const results = [];
  for (const org of orgs) {
    try {
      const r = await runImpactVerificationForOrg(org.id);
      results.push({ organizationId: org.id, slug: org.slug, ok: true, ...r });
    } catch (err) {
      console.error(`Impact verification failed for ${org.slug}`, err);
      results.push({
        organizationId: org.id,
        slug: org.slug,
        ok: false,
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }
  return results;
}
