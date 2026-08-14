import prisma from '../src/config/prisma';
import { impactSummary } from '../src/services/impactService';
import { runImpactVerificationForOrg } from '../src/services/impactVerificationService';

/**
 * Self-contained smoke test for the advice impact ledger (local dev DB only).
 * Creates a throwaway org, exercises measured verification, user-prompt
 * fallback, and the rollup, then deletes the org (cascade).
 */
async function main() {
  const slug = `smoke-impact-${Date.now()}`;
  const org = await prisma.organization.create({
    data: { name: 'Smoke Impact Test', slug },
  });
  try {
    const past = new Date(Date.now() - 60_000);

    // Case 1: measurable — subscription spend dropped $20 since baseline.
    const insight = await prisma.insight.create({
      data: {
        organizationId: org.id,
        severity: 'OPPORTUNITY',
        title: 'Smoke: Review Subscriptions',
        summary: 'smoke',
        metricKeys: ['subscriptions'],
      },
    });
    const measurable = await prisma.recommendation.create({
      data: {
        organizationId: org.id,
        insightId: insight.id,
        title: 'Smoke: Cancel Unused Tool',
        description: 'smoke',
        impactType: 'SAVINGS',
        expectedImpactCents: 5000,
        status: 'COMPLETED',
        completedAt: past,
        verificationDueAt: past,
        baselineJson: {
          capturedAt: past.toISOString(),
          expenses: {
            recurringSubscriptionMonthlyCents: 2000, // current spend is 0 → delta 2000
            monthExpenseCents: 0,
          },
        },
      },
    });

    // Case 2: not measurable — should create an alert and await the user.
    const manual = await prisma.recommendation.create({
      data: {
        organizationId: org.id,
        title: 'Smoke: Qualitative Action',
        description: 'smoke',
        status: 'COMPLETED',
        completedAt: past,
        verificationDueAt: past,
      },
    });

    const verify = await runImpactVerificationForOrg(org.id);
    console.log('verification run:', verify);

    const measured = await prisma.recommendation.findUniqueOrThrow({
      where: { id: measurable.id },
    });
    console.log('measured rec:', {
      realizedImpactCents: measured.realizedImpactCents,
      realizedSource: measured.realizedSource,
      note: measured.realizedNote,
    });

    const awaiting = await prisma.recommendation.findUniqueOrThrow({
      where: { id: manual.id },
    });
    const alerts = await prisma.alert.count({
      where: { organizationId: org.id },
    });
    console.log('awaiting rec:', {
      realizedSource: awaiting.realizedSource,
      verificationDueAt: awaiting.verificationDueAt,
      alertsCreated: alerts,
    });

    const summary = await impactSummary(org.id);
    console.log('summary:', {
      verified: summary.verified,
      estimatedPendingCents: summary.estimatedPendingCents,
      awaitingConfirmationCount: summary.awaitingConfirmationCount,
      thisMonth: summary.thisMonth,
    });

    const ok =
      measured.realizedSource === 'MEASURED' &&
      measured.realizedImpactCents === 2000 &&
      awaiting.realizedSource === null &&
      alerts === 1 &&
      summary.verified.savedCents === 2000 &&
      summary.awaitingConfirmationCount === 1;
    console.log(ok ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED');
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
