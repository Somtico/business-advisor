import prisma from '../src/config/prisma';
import { pricingGuidance } from '../src/services/pricingService';

/**
 * Self-contained smoke test for pricing guidance (local dev DB only).
 * Phase 1 verifies the no-guessing gate (missing data → asks, no numbers).
 * Phase 2 verifies the floor/recommended math against hand-calculated values.
 */
async function main() {
  const slug = `smoke-pricing-${Date.now()}`;
  const org = await prisma.organization.create({
    data: { name: 'Smoke Pricing Test', slug },
  });
  try {
    const programme = await prisma.productService.create({
      data: { organizationId: org.id, name: 'Smoke Robotics', capacity: 12 },
    });

    // Phase 1: nothing else recorded → must refuse with concrete asks.
    const gated = await pricingGuidance(org.id);
    const g = gated.programmes[0];
    const gateOk =
      g.status === 'INSUFFICIENT_DATA' &&
      g.recommendedPriceCents === null &&
      g.floorAtCurrentFillCents === null &&
      ['price', 'enrolments', 'sessions', 'expenses'].every((k) =>
        g.missingData.some((m) => m.key === k)
      );
    console.log('gate result:', g.status, g.missingData.map((m) => m.key));
    console.log(gateOk ? 'GATE OK' : 'GATE FAILED');

    // Phase 2: add every required record.
    await prisma.productService.update({
      where: { id: programme.id },
      data: { priceCents: 19900 },
    });
    const person = await prisma.person.create({
      data: { organizationId: org.id, firstName: 'Smoke', lastName: 'Student' },
    });
    await prisma.engagement.create({
      data: {
        organizationId: org.id,
        personId: person.id,
        productServiceId: programme.id,
        status: 'ACTIVE',
        isTrial: false,
        startDate: new Date(),
      },
    });
    const staff = await prisma.staffMember.create({
      data: {
        organizationId: org.id,
        firstName: 'Smoke',
        lastName: 'Instructor',
        compensation: {
          create: {
            organizationId: org.id,
            payType: 'hourly',
            hourlyCents: 2500,
            burdenPercent: 15,
          },
        },
      },
    });
    const starts = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        organizationId: org.id,
        productServiceId: programme.id,
        staffMemberId: staff.id,
        startsAt: starts,
        endsAt: new Date(starts.getTime() + 2 * 60 * 60 * 1000),
      },
    });
    await prisma.expenseTransaction.create({
      data: { organizationId: org.id, amountCents: 10000, category: 'Rent' },
    });

    const ready = await pricingGuidance(org.id);
    const r = ready.programmes[0];
    console.log('ready result:', {
      status: r.status,
      floorAtCurrentFillCents: r.floorAtCurrentFillCents,
      floorAtCapacityCents: r.floorAtCapacityCents,
      recommendedPriceCents: r.recommendedPriceCents,
      verdict: r.verdict,
    });

    // Hand-calculated: weekly labour 2h × $25.00 × 1.15 = 5750c;
    // monthly = round(5750 × 4.345) = 24984c; overhead/student = 10000c;
    // floor = 34984c; recommended @30% = round(45479.2) = 45479c;
    // price 19900c < floor → BELOW_COST.
    const expectedFloor = Math.round(5750 * 4.345) + 10000;
    const expectedRecommended = Math.round(expectedFloor * 1.3);
    const mathOk =
      r.status === 'READY' &&
      r.floorAtCurrentFillCents === expectedFloor &&
      r.recommendedPriceCents === expectedRecommended &&
      r.floorAtCapacityCents === Math.round(Math.round(5750 * 4.345) / 12) + 10000 &&
      r.verdict === 'BELOW_COST';
    console.log(mathOk ? 'MATH OK' : `MATH FAILED (expected floor ${expectedFloor}, recommended ${expectedRecommended})`);

    // Phase 3: price clearly above recommended, persistently low fill, spare
    // seats, and weak trial conversion → ABOVE_TARGET price test.
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.productService.update({
      where: { id: programme.id },
      data: { priceCents: 60000 },
    });
    await prisma.engagement.updateMany({
      where: { organizationId: org.id, productServiceId: programme.id, isTrial: false },
      data: { startDate: fortyDaysAgo },
    });
    for (let i = 0; i < 4; i += 1) {
      const trialPerson = await prisma.person.create({
        data: {
          organizationId: org.id,
          firstName: `Trial${i + 1}`,
          lastName: 'Student',
        },
      });
      await prisma.engagement.create({
        data: {
          organizationId: org.id,
          personId: trialPerson.id,
          productServiceId: programme.id,
          status: 'TRIAL',
          isTrial: true,
          startDate: fortyDaysAgo,
        },
      });
    }
    const above = await pricingGuidance(org.id);
    const a = above.programmes.find((p) => p.programmeId === programme.id);
    const aboveOk =
      a != null &&
      a.status === 'READY' &&
      a.verdict === 'ABOVE_TARGET' &&
      a.testPriceCents === expectedRecommended &&
      a.priceTestMonitorWeeks === 6 &&
      a.testPriceCents != null &&
      a.floorAtCurrentFillCents != null &&
      a.testPriceCents >= a.floorAtCurrentFillCents;
    console.log('price-test result:', {
      status: a?.status,
      verdict: a?.verdict,
      testPriceCents: a?.testPriceCents,
      monitorWeeks: a?.priceTestMonitorWeeks,
    });
    console.log(aboveOk ? 'PRICE TEST OK' : 'PRICE TEST FAILED');

    // Phase 4: high price and empty seats, but no demand signal on record →
    // stay ON_TRACK. Empty seats alone must not trigger a cut.
    const quiet = await prisma.productService.create({
      data: {
        organizationId: org.id,
        name: 'Smoke Chess',
        capacity: 12,
        priceCents: 60000,
      },
    });
    const quietPerson = await prisma.person.create({
      data: { organizationId: org.id, firstName: 'Quiet', lastName: 'Student' },
    });
    await prisma.engagement.create({
      data: {
        organizationId: org.id,
        personId: quietPerson.id,
        productServiceId: quiet.id,
        status: 'ACTIVE',
        isTrial: false,
        startDate: fortyDaysAgo,
      },
    });
    const quietStarts = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        organizationId: org.id,
        productServiceId: quiet.id,
        staffMemberId: staff.id,
        startsAt: quietStarts,
        endsAt: new Date(quietStarts.getTime() + 2 * 60 * 60 * 1000),
      },
    });
    const quietResult = (await pricingGuidance(org.id)).programmes.find(
      (p) => p.programmeId === quiet.id
    );
    const quietOk =
      quietResult != null &&
      quietResult.status === 'READY' &&
      quietResult.verdict === 'ON_TRACK' &&
      quietResult.testPriceCents === null;
    console.log('quiet-room result:', {
      status: quietResult?.status,
      verdict: quietResult?.verdict,
    });
    console.log(quietOk ? 'NO-GUESS CUT OK' : 'NO-GUESS CUT FAILED');

    const ok = gateOk && mathOk && aboveOk && quietOk;
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
