import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma';
import { runBusinessInsights } from '../src/services/businessInsightService';

/**
 * Temporary local-only seed for capturing marketing screenshots.
 * Creates a fictional organization with realistic data, then prints login
 * details. Delete the org afterwards with:
 *   npx tsx scripts/seed-demo-screenshots.ts --cleanup
 */
const SLUG = 'northlight-demo-screenshots';

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (org) {
    await prisma.organization.delete({ where: { id: org.id } });
    console.log('Demo org deleted.');
  } else {
    console.log('Demo org not found; nothing to delete.');
  }
}

async function main() {
  if (process.argv.includes('--cleanup')) return cleanup();

  await cleanup();
  const org = await prisma.organization.create({
    data: {
      name: 'Northlight Learning Studio',
      slug: SLUG,
      pricingTargetMarginPercent: 30,
      status: 'ACTIVE',
      onboardingCompleted: true,
    },
  });

  const passwordHash = await bcrypt.hash('DemoPass!234', 12);
  await prisma.user.create({
    data: {
      email: 'demo@northlight.test',
      passwordHash,
      firstName: 'John',
      lastName: 'Smith',
      emailVerified: true,
      termsAcceptedAt: new Date(),
      termsVersion: '2026-08-16.2',
      privacyAcceptedAt: new Date(),
      privacyVersion: '2026-08-16.2',
      memberships: {
        create: { organizationId: org.id, role: 'OWNER' },
      },
    },
  });
    },
  });

  const programmes = await Promise.all(
    [
      { name: 'Robotics Club', priceCents: 21900, capacity: 16 },
      { name: 'Coding Foundations', priceCents: 18900, capacity: 14 },
      { name: 'Math Mastery', priceCents: 15900, capacity: 12 },
    ].map((p) =>
      prisma.productService.create({ data: { organizationId: org.id, ...p } })
    )
  );

  const firstNames = ['Liam', 'Emma', 'Noah', 'Olivia', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Sofia', 'Jack', 'Chloe', 'Owen', 'Zoe', 'Leo', 'Isla', 'Ben', 'Ruby', 'Max', 'Nora', 'Sam', 'Ivy', 'Theo', 'Elle', 'Kai', 'June', 'Cole', 'Faye', 'Reid', 'Tess', 'Finn'];
  const enrolPlan: Array<{ prog: number; count: number; trials?: number }> = [
    { prog: 0, count: 12 },
    { prog: 1, count: 9, trials: 2 },
    { prog: 2, count: 7 },
  ];
  let nameIdx = 0;
  for (const plan of enrolPlan) {
    for (let i = 0; i < plan.count; i += 1) {
      const person = await prisma.person.create({
        data: {
          organizationId: org.id,
          firstName: firstNames[nameIdx % firstNames.length],
          lastName: `Student${nameIdx + 1}`,
        },
      });
      nameIdx += 1;
      await prisma.engagement.create({
        data: {
          organizationId: org.id,
          personId: person.id,
          productServiceId: programmes[plan.prog].id,
          status: 'ACTIVE',
          isTrial: plan.trials ? i < plan.trials : false,
          startDate: new Date(Date.now() - (30 + i * 5) * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  const staff = await Promise.all(
    [
      { firstName: 'Priya', lastName: 'Sharma', hourlyCents: 2800 },
      { firstName: 'Marcus', lastName: 'Deng', hourlyCents: 2600 },
      { firstName: 'Elena', lastName: 'Kovac', hourlyCents: 2400 },
    ].map((s) =>
      prisma.staffMember.create({
        data: {
          organizationId: org.id,
          firstName: s.firstName,
          lastName: s.lastName,
          compensation: {
            create: {
              organizationId: org.id,
              payType: 'hourly',
              hourlyCents: s.hourlyCents,
              burdenPercent: 12,
            },
          },
        },
      })
    )
  );

  // Sessions this week per programme
  const sessionPlan = [
    { prog: 0, staff: 0, hours: 2, count: 2 },
    { prog: 1, staff: 1, hours: 1.5, count: 2 },
    { prog: 2, staff: 2, hours: 1, count: 2 },
  ];
  for (const plan of sessionPlan) {
    for (let i = 0; i < plan.count; i += 1) {
      const startsAt = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000);
      startsAt.setHours(16 + i, 0, 0, 0);
      await prisma.session.create({
        data: {
          organizationId: org.id,
          productServiceId: programmes[plan.prog].id,
          staffMemberId: staff[plan.staff].id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + plan.hours * 60 * 60 * 1000),
        },
      });
    }
  }

  // Overhead this month
  const expenses = [
    { amountCents: 320000, category: 'Rent', description: 'Studio lease — August' },
    { amountCents: 45000, category: 'Utilities', description: 'Power and internet' },
    { amountCents: 26000, category: 'Insurance', description: 'Liability insurance' },
    { amountCents: 38000, category: 'Supplies', description: 'Robotics kits and materials' },
  ];
  for (const e of expenses) {
    await prisma.expenseTransaction.create({
      data: { organizationId: org.id, ...e, isRecurring: e.category === 'Rent' },
    });
  }

  await prisma.recurringSubscription.createMany({
    data: [
      { organizationId: org.id, name: 'Class scheduling software', amountCents: 8900, cadence: 'monthly', category: 'Software' },
      { organizationId: org.id, name: 'Video conferencing', amountCents: 2200, cadence: 'monthly', category: 'Software' },
      { organizationId: org.id, name: 'Design tool (unused)', amountCents: 5400, cadence: 'monthly', category: 'Software', usageNotes: 'No logins in 60 days' },
    ],
  });

  // Revenue this month
  const revenue = [
    { amountCents: 262800, category: 'Tuition', description: 'Robotics Club — August tuition' },
    { amountCents: 132300, category: 'Tuition', description: 'Coding Foundations — August tuition' },
    { amountCents: 111300, category: 'Tuition', description: 'Math Mastery — August tuition' },
  ];
  for (const r of revenue) {
    await prisma.revenueTransaction.create({ data: { organizationId: org.id, ...r } });
  }

  const now = new Date();
  await prisma.target.create({
    data: {
      organizationId: org.id,
      metricKey: 'monthly_revenue',
      label: 'Monthly revenue target',
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      targetValue: 5600,
      unit: 'dollars',
    },
  });

  // A completed, verified recommendation so the impact ledger has history
  await prisma.recommendation.create({
    data: {
      organizationId: org.id,
      source: 'INSIGHT',
      title: 'Cancel duplicate scheduling software',
      description: 'Two scheduling tools were active. Cancelling the duplicate saves $89.00/month.',
      impactType: 'SAVINGS',
      expectedImpactCents: 106800,
      expectedImpactNote: 'Annualized from $89.00/month duplicate subscription',
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      realizedImpactCents: 106800,
      realizedNote: 'Measured from subscription records',
      realizedSource: 'MEASURED',
      realizedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });

  await runBusinessInsights(org.id);

  console.log('Demo org seeded.');
  console.log('Login: demo@northlight.test / DemoPass!234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
