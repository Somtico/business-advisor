import prisma from '../src/config/prisma';
import {
  enrolmentGuidance,
  recordEnrolmentTactic,
} from '../src/services/enrolmentService';

async function main() {
  const slug = `smoke-enrol-${Date.now()}`;
  const org = await prisma.organization.create({
    data: { name: 'Smoke Enrolment', slug },
  });
  try {
    const empty = await enrolmentGuidance(org.id);
    const emptyOk =
      empty.leak === 'INSUFFICIENT_DATA' && empty.canShareAnonymized === false;
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
      leak.canShareAnonymized === true &&
      leak.paidTest.eligible === false &&
      leak.cheapNextSteps.length > 0;
    console.log('leak:', leak.leak, 'askTried', leak.askTriedAndResults);
    console.log(leakOk ? 'LEAK OK' : 'LEAK FAILED');

    const saved = await recordEnrolmentTactic(org.id, {
      tacticKey: 'TRIAL_FOLLOWUP',
      resultSummary: 'Called 4 trial families; one said the Tuesday slot is the blocker.',
      outcome: 'NO_EFFECT',
      costBand: 'FREE',
      shareAnonymized: true,
    });
    const after = await enrolmentGuidance(org.id);
    const anon = await prisma.anonymizedTacticOutcome.findMany({
      where: { leakType: 'CONVERSION_LEAK', tacticKey: 'TRIAL_FOLLOWUP' },
    });
    const savedOk =
      after.askTriedAndResults === false &&
      after.tacticsTried.some((t) => t.id === saved.id) &&
      anon.some(
        (row) =>
          row.outcome === 'NO_EFFECT' &&
          row.costBand === 'FREE' &&
          row.purposeVersion === 'somtico_models_v1' &&
          !('resultSummary' in row)
      );
    console.log('saved askTried', after.askTriedAndResults, 'anon rows', anon.length);
    console.log(savedOk ? 'SAVE OK' : 'SAVE FAILED');

    const ok = emptyOk && leakOk && savedOk;
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
