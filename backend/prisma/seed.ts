import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { EDUCATION_DATASETS } from '../src/catalog/educationBlueprint';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('StemLantern123!', 12);

  const org = await prisma.organization.upsert({
    where: { slug: 'stem-lantern' },
    create: {
      name: 'STEM Lantern Education Inc.',
      slug: 'stem-lantern',
      displayName: 'STEM Lantern',
      timezone: 'America/Regina',
      currency: 'CAD',
      country: 'CA',
      fiscalYearStartMonth: 9,
      industryBlueprintKey: 'after_school_tutoring_enrichment',
      educationSubtype: 'STEM_CODING_ACADEMY',
      status: 'ACTIVE',
      onboardingCompleted: false,
      cashBalanceCents: 1500000,
      cashBalanceAsOf: new Date(),
      entitlement: {
        create: {
          plan: 'PILOT',
          adminSeatLimit: 5,
          aiMonthlyTokenCap: 500000,
          connectorLimit: 3,
        },
      },
      subscription: {
        create: {
          plan: 'PILOT',
          status: 'ACTIVE',
          unitAmountCents: 500,
          currency: 'CAD',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      domains: {
        create: {
          hostname: `stem-lantern.${process.env.ROOT_DOMAIN || 'businessadvisor.app'}`,
        },
      },
      users: {
        create: {
          email: 'owner@stemlantern.local',
          passwordHash,
          firstName: 'STEM',
          lastName: 'Owner',
          role: 'OWNER',
        },
      },
    },
    update: {
      name: 'STEM Lantern Education Inc.',
      displayName: 'STEM Lantern',
      status: 'ACTIVE',
    },
    include: { users: true },
  });

  for (const ds of EDUCATION_DATASETS) {
    await prisma.dataReadinessItem.upsert({
      where: {
        organizationId_datasetKey: {
          organizationId: org.id,
          datasetKey: ds.datasetKey,
        },
      },
      create: {
        organizationId: org.id,
        datasetKey: ds.datasetKey,
        label: ds.label,
        whyItMatters: ds.whyItMatters,
        exampleInsight: ds.exampleInsight,
        priority: ds.priority,
        status: 'MISSING',
      },
      update: {
        label: ds.label,
        whyItMatters: ds.whyItMatters,
        exampleInsight: ds.exampleInsight,
        priority: ds.priority,
      },
    });
  }

  const location = await prisma.location.upsert({
    where: { id: 'seed-stem-lantern-main' },
    create: {
      id: 'seed-stem-lantern-main',
      organizationId: org.id,
      name: 'Saskatoon Main',
      city: 'Saskatoon',
      province: 'Saskatchewan',
      postalCode: 'S7K 0J5',
    },
    update: { name: 'Saskatoon Main' },
  });

  const coding = await prisma.productService.upsert({
    where: { id: 'seed-programme-coding' },
    create: {
      id: 'seed-programme-coding',
      organizationId: org.id,
      name: 'Coding Club',
      category: 'class',
      priceCents: 19900,
      capacity: 16,
      deliveryMode: 'in_person',
    },
    update: { capacity: 16 },
  });

  // Seed sample active students matching pilot baseline signal (~13)
  for (let i = 1; i <= 13; i++) {
    const personId = `seed-person-${i}`;
    await prisma.person.upsert({
      where: { id: personId },
      create: {
        id: personId,
        organizationId: org.id,
        firstName: `Student`,
        lastName: `${i}`,
        gradeOrAge: i <= 12 ? `Grade ${i}` : 'Grade 8',
        status: 'active',
        startDate: new Date('2026-01-15'),
      },
      update: { status: 'active' },
    });
    await prisma.engagement.upsert({
      where: { id: `seed-engagement-${i}` },
      create: {
        id: `seed-engagement-${i}`,
        organizationId: org.id,
        personId,
        productServiceId: coding.id,
        status: 'ACTIVE',
        isTrial: false,
        startDate: new Date('2026-01-15'),
      },
      update: { status: 'ACTIVE' },
    });
  }

  const staff = await prisma.staffMember.upsert({
    where: { id: 'seed-staff-1' },
    create: {
      id: 'seed-staff-1',
      organizationId: org.id,
      locationId: location.id,
      firstName: 'Alex',
      lastName: 'Instructor',
      roleTitle: 'Lead Instructor',
      compensation: {
        create: {
          organizationId: org.id,
          payType: 'hourly',
          hourlyCents: 2800,
          burdenPercent: 15,
        },
      },
    },
    update: { roleTitle: 'Lead Instructor' },
  });

  const weekStart = new Date();
  weekStart.setHours(16, 0, 0, 0);
  await prisma.shift.upsert({
    where: { id: 'seed-shift-1' },
    create: {
      id: 'seed-shift-1',
      organizationId: org.id,
      staffMemberId: staff.id,
      locationId: location.id,
      startsAt: weekStart,
      endsAt: new Date(weekStart.getTime() + 3 * 3600000),
    },
    update: {},
  });

  await prisma.recurringSubscription.upsert({
    where: { id: 'seed-sub-portal' },
    create: {
      id: 'seed-sub-portal',
      organizationId: org.id,
      name: 'Registration Portal Hosting',
      amountCents: 4900,
      cadence: 'monthly',
      category: 'software',
      reviewPriority: 1,
    },
    update: { amountCents: 4900 },
  });

  await prisma.expenseTransaction.createMany({
    data: [
      {
        organizationId: org.id,
        amountCents: 250000,
        category: 'rent',
        description: 'Studio rent',
        isRecurring: true,
      },
      {
        organizationId: org.id,
        amountCents: 18000,
        category: 'supplies',
        description: 'Classroom supplies',
      },
    ],
    skipDuplicates: true,
  });

  const yearStart = new Date('2026-09-01');
  const yearEnd = new Date('2027-06-30');
  await prisma.target.upsert({
    where: { id: 'seed-target-students' },
    create: {
      id: 'seed-target-students',
      organizationId: org.id,
      metricKey: 'active_students',
      label: 'Active Paid Students (2026-27)',
      periodStart: yearStart,
      periodEnd: yearEnd,
      targetValue: 25,
      unit: 'count',
    },
    update: { targetValue: 25 },
  });

  console.log('Seeded STEM Lantern org:', org.slug);
  console.log('Login: owner@stemlantern.local / StemLantern123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
