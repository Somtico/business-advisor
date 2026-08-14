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

    const ok = gateOk && mathOk;
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
