import prisma from '../src/config/prisma';
import {
  enrolmentGuidance,
  recordEnrolmentTactic,
} from '../src/services/enrolmentService';
import { enableHelpImproveAdvisor } from '../src/services/moat/helpImproveAdvisorService';

async function main() {
  const slug = `smoke-enrol-${Date.now()}`;
  const org = await prisma.organization.create({
    data: { name: 'Smoke Enrolment', slug },
  });
  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `smoke-${Date.now()}@example.com`,
      passwordHash: 'x',
      firstName: 'Smoke',
      lastName: 'Owner',
      role: 'OWNER',
      termsAcceptedAt: new Date(),
      termsVersion: '2026-08-16.2',
      privacyAcceptedAt: new Date(),
      privacyVersion: '2026-08-16.2',
      emailVerified: true,
    },
  });
  try {
    const empty = await enrolmentGuidance(org.id);
    const emptyOk =
      empty.leak === 'INSUFFICIENT_DATA' &&
      empty.helpImproveAdvisor.enabled === false;
    console.log('empty leak:', empty.leak);
    console.log(emptyOk ? 'EMPTY OK' : 'EMPTY FAILED');

    const programme = await prisma.productService.create({
      data: {
        organizationId: org.id,
        name: 'Smoke Robotics',
        capacity: 12,
        priceCents: 19900,
      },
    });
    const paid = await prisma.person.create({
      data: { organizationId: org.id, firstName: 'Paid', lastName: 'Student' },
    });
    await prisma.engagement.create({
      data: {
        organizationId: org.id,
        personId: paid.id,
        productServiceId: programme.id,
        status: 'ACTIVE',
        isTrial: false,
        startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });
    for (let i = 0; i < 4; i += 1) {
      const person = await prisma.person.create({
        data: {
          organizationId: org.id,
          firstName: `Trial${i}`,
          lastName: 'Student',
        },
      });
      await prisma.engagement.create({
        data: {
          organizationId: org.id,
          personId: person.id,
          productServiceId: programme.id,
          status: 'TRIAL',
          isTrial: true,
          startDate: new Date(),
        },
      });
    }

    const leak = await enrolmentGuidance(org.id);
    const leakOk =
      leak.leak === 'CONVERSION_LEAK' &&
      leak.askTriedAndResults === true &&
      leak.paidTest.eligible === false &&
      leak.cheapNextSteps.length > 0;
    console.log('leak:', leak.leak, 'askTried', leak.askTriedAndResults);
    console.log(leakOk ? 'LEAK OK' : 'LEAK FAILED');

    // Without Help Improve ON, shareAnonymized stays false and no V2 row is written.
    const without = await recordEnrolmentTactic(org.id, {
      tacticKey: 'FAMILY_REFERRAL',
      resultSummary: 'Asked three families; no referrals yet.',
      outcome: 'NO_EFFECT',
      costBand: 'FREE',
      shareAnonymized: true, // ignored — must not auto-enable learning
    });
    const withoutOk = without.shareAnonymized === false;
    console.log(withoutOk ? 'OFF SHARE OK' : 'OFF SHARE FAILED');

    await enableHelpImproveAdvisor({
      organizationId: org.id,
      grantedByUserId: owner.id,
    });

    const saved = await recordEnrolmentTactic(org.id, {
      tacticKey: 'TRIAL_FOLLOWUP',
      resultSummary: 'Called 4 trial families; one said the Tuesday slot is the blocker.',
      outcome: 'NO_EFFECT',
      costBand: 'FREE',
    });
    const after = await enrolmentGuidance(org.id);
    const v2 = await prisma.anonymizedOutcomeObservationV2.findMany({
      where: {
        diagnosedLeak: 'CONVERSION_LEAK',
        interventionCategory: 'TRIAL_FOLLOWUP',
      },
    });
    const v1New = await prisma.anonymizedTacticOutcome.findMany({
      where: {
        leakType: 'CONVERSION_LEAK',
        tacticKey: 'TRIAL_FOLLOWUP',
        purposeVersion: 'somtico_models_v1',
      },
    });
    const savedOk =
      after.askTriedAndResults === false &&
      after.helpImproveAdvisor.enabled === true &&
      after.tacticsTried.some((t) => t.id === saved.id && t.shareAnonymized) &&
      v2.some(
        (row) =>
          row.outcome === 'NO_EFFECT' &&
          row.effortOrCostBand === 'free' &&
          row.purposeVersion === 'somtico_models_v2' &&
          Boolean(row.contributorKey)
      ) &&
      v1New.length === 0;
    console.log(
      'saved askTried',
      after.askTriedAndResults,
      'v2 rows',
      v2.length,
      'legacy v1 new',
      v1New.length
    );
    console.log(savedOk ? 'SAVE OK' : 'SAVE FAILED');

    const ok = emptyOk && leakOk && withoutOk && savedOk;
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
