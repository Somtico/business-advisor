import { ForecastScenario } from '@prisma/client';
import prisma from '../../config/prisma';

function overlaps(
  start: Date | null,
  end: Date | null,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const s = start ?? new Date(0);
  const e = end ?? new Date('9999-12-31');
  return s <= rangeEnd && e >= rangeStart;
}

export async function countActiveStudents(
  organizationId: string,
  asOf: Date = new Date()
): Promise<number> {
  const engagements = await prisma.engagement.findMany({
    where: {
      organizationId,
      status: { in: ['ACTIVE', 'PAUSED', 'TRIAL'] },
      isTrial: false,
    },
    select: { personId: true, startDate: true, endDate: true, status: true },
  });
  const people = new Set<string>();
  for (const e of engagements) {
    if (overlaps(e.startDate, e.endDate, asOf, asOf)) {
      people.add(e.personId);
    }
  }
  return people.size;
}

export async function enrolmentMetrics(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const activeNow = await countActiveStudents(organizationId, now);
  const activePrev = await countActiveStudents(organizationId, prevMonthEnd);

  const started = await prisma.engagement.count({
    where: {
      organizationId,
      isTrial: false,
      startDate: { gte: monthStart },
    },
  });
  const ended = await prisma.engagement.count({
    where: {
      organizationId,
      isTrial: false,
      endDate: { gte: monthStart, lte: now },
      status: { in: ['CANCELLED', 'COMPLETED'] },
    },
  });

  const trials = await prisma.engagement.count({
    where: { organizationId, isTrial: true },
  });
  const converted = await prisma.lead.count({
    where: { organizationId, convertedAt: { not: null } },
  });
  const trialLeads = await prisma.lead.count({
    where: { organizationId },
  });
  const conversionRate =
    trialLeads > 0 ? converted / trialLeads : trials > 0 ? converted / trials : 0;

  const churnRate =
    activePrev > 0 ? Math.max(0, (activePrev - activeNow + started) / activePrev) : 0;

  return {
    activeStudents: activeNow,
    activeStudentsPriorMonth: activePrev,
    startedThisMonth: started,
    endedThisMonth: ended,
    trialCount: trials,
    conversionRate,
    churnRate,
    monthStart: monthStart.toISOString(),
    priorMonthStart: prevMonthStart.toISOString(),
  };
}

export async function programmePerformance(organizationId: string) {
  const programmes = await prisma.productService.findMany({
    where: { organizationId, isActive: true },
  });
  const results = [];
  for (const p of programmes) {
    const active = await prisma.engagement.count({
      where: {
        organizationId,
        productServiceId: p.id,
        status: { in: ['ACTIVE', 'PAUSED'] },
        isTrial: false,
      },
    });
    const trials = await prisma.engagement.count({
      where: { organizationId, productServiceId: p.id, isTrial: true },
    });
    const capacity = p.capacity ?? null;
    const utilization =
      capacity && capacity > 0 ? Math.min(1, active / capacity) : null;
    results.push({
      id: p.id,
      name: p.name,
      activeEnrolments: active,
      trials,
      capacity,
      utilization,
      priceCents: p.priceCents,
    });
  }
  return results;
}

export async function staffingVersusDemand(organizationId: string) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const shifts = await prisma.shift.findMany({
    where: {
      organizationId,
      startsAt: { gte: now, lte: weekEnd },
    },
    include: {
      staffMember: { include: { compensation: true } },
    },
  });

  const sessions = await prisma.session.findMany({
    where: {
      organizationId,
      startsAt: { gte: now, lte: weekEnd },
    },
  });

  let scheduledHours = 0;
  let labourCostCents = 0;
  for (const s of shifts) {
    const hours =
      s.actualHours ??
      Math.max(0, (s.endsAt.getTime() - s.startsAt.getTime()) / 3600000);
    scheduledHours += hours;
    const hourly = s.staffMember.compensation?.hourlyCents ?? 2500;
    const burden = 1 + (s.staffMember.compensation?.burdenPercent ?? 15) / 100;
    labourCostCents += Math.round(hours * hourly * burden);
  }

  const expectedStudents = sessions.reduce(
    (sum, sess) => sum + (sess.rosterCount ?? sess.attendanceCount ?? 0),
    0
  );
  const sessionHours = sessions.reduce((sum, sess) => {
    if (!sess.endsAt) return sum + 1;
    return sum + Math.max(0, (sess.endsAt.getTime() - sess.startsAt.getTime()) / 3600000);
  }, 0);

  // Rough rule: 1 instructor hour per 6 learner-hours is healthy; surplus = savings opportunity
  const neededInstructorHours = expectedStudents > 0 ? sessionHours : scheduledHours * 0.7;
  const excessHours = Math.max(0, scheduledHours - neededInstructorHours);
  const avgHourly =
    scheduledHours > 0 ? labourCostCents / scheduledHours : 2500;
  const estimatedSavingsCents = Math.round(excessHours * avgHourly);

  return {
    weekWindow: { start: now.toISOString(), end: weekEnd.toISOString() },
    scheduledHours: Number(scheduledHours.toFixed(2)),
    neededInstructorHours: Number(neededInstructorHours.toFixed(2)),
    excessHours: Number(excessHours.toFixed(2)),
    labourCostCents,
    expectedLearnerSlots: expectedStudents,
    estimatedSavingsCents,
  };
}

export async function expenseRollup(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const expenses = await prisma.expenseTransaction.findMany({
    where: { organizationId, occurredAt: { gte: monthStart } },
  });
  const subscriptions = await prisma.recurringSubscription.findMany({
    where: { organizationId, isActive: true },
  });
  const expenseTotal = expenses.reduce((s, e) => s + e.amountCents, 0);
  const recurringMonthly = subscriptions.reduce((s, sub) => {
    if (sub.cadence === 'annual') return s + Math.round(sub.amountCents / 12);
    return s + sub.amountCents;
  }, 0);
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.category || 'Uncategorized';
    byCategory[key] = (byCategory[key] || 0) + e.amountCents;
  }
  return {
    monthExpenseCents: expenseTotal,
    recurringSubscriptionMonthlyCents: recurringMonthly,
    byCategory,
    subscriptionCount: subscriptions.length,
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      amountCents: s.amountCents,
      cadence: s.cadence,
      nextRenewalAt: s.nextRenewalAt,
      reviewPriority: s.reviewPriority,
    })),
  };
}

export async function cashOutlook(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });
  const expenses = await expenseRollup(organizationId);
  const revenues = await prisma.revenueTransaction.findMany({
    where: {
      organizationId,
      isRecurring: true,
    },
  });
  const recurringRevenueMonthly = revenues.reduce((s, r) => {
    return s + r.amountCents;
  }, 0);

  const programmes = await prisma.productService.findMany({
    where: { organizationId, isActive: true, priceCents: { not: null } },
  });
  let tuitionEstimate = 0;
  for (const p of programmes) {
    const active = await prisma.engagement.count({
      where: {
        organizationId,
        productServiceId: p.id,
        status: 'ACTIVE',
        isTrial: false,
      },
    });
    tuitionEstimate += active * (p.priceCents || 0);
  }

  const monthlyIn = recurringRevenueMonthly + tuitionEstimate;
  const monthlyOut =
    expenses.monthExpenseCents +
    expenses.recurringSubscriptionMonthlyCents +
    (await staffingVersusDemand(organizationId)).labourCostCents;
  const net = monthlyIn - monthlyOut;
  const cash = org.cashBalanceCents;
  const runwayWeeks =
    net >= 0 ? null : cash > 0 ? Number(((cash / Math.abs(net)) * 4.345).toFixed(1)) : 0;

  return {
    cashBalanceCents: cash,
    cashBalanceAsOf: org.cashBalanceAsOf,
    monthlyInCents: monthlyIn,
    monthlyOutCents: monthlyOut,
    netMonthlyCents: net,
    runwayWeeks,
  };
}

export async function targetProgress(organizationId: string) {
  const now = new Date();
  const targets = await prisma.target.findMany({
    where: {
      organizationId,
      periodStart: { lte: now },
      periodEnd: { gte: now },
    },
  });
  const results = [];
  for (const t of targets) {
    let actual = 0;
    if (t.metricKey === 'active_students') {
      actual = await countActiveStudents(organizationId, now);
    } else if (t.metricKey === 'conversion_rate') {
      const m = await enrolmentMetrics(organizationId);
      actual = m.conversionRate;
    } else if (t.metricKey === 'utilization') {
      const programmes = await programmePerformance(organizationId);
      const withCap = programmes.filter((p) => p.utilization != null);
      actual =
        withCap.length > 0
          ? withCap.reduce((s, p) => s + (p.utilization || 0), 0) / withCap.length
          : 0;
    } else {
      const snap = await prisma.metricSnapshot.findFirst({
        where: { organizationId, metricKey: t.metricKey },
        orderBy: { asOf: 'desc' },
      });
      actual = snap?.value ?? 0;
    }
    const progress = t.targetValue !== 0 ? actual / t.targetValue : 0;
    results.push({
      id: t.id,
      metricKey: t.metricKey,
      label: t.label,
      targetValue: t.targetValue,
      actualValue: actual,
      progress,
      unit: t.unit,
      periodStart: t.periodStart,
      periodEnd: t.periodEnd,
      onTrack: progress >= 0.85,
    });
  }
  return results;
}

export async function buildForecasts(organizationId: string) {
  const metrics = await enrolmentMetrics(organizationId);
  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
  const velocity = metrics.startedThisMonth - metrics.endedThisMonth;
  const scenarios: { scenario: ForecastScenario; factor: number }[] = [
    { scenario: 'CONSERVATIVE', factor: 0.5 },
    { scenario: 'EXPECTED', factor: 1 },
    { scenario: 'GROWTH', factor: 1.5 },
  ];
  const created = [];
  for (const s of scenarios) {
    const projected = Math.max(
      0,
      Math.round(metrics.activeStudents + velocity * 3 * s.factor)
    );
    const row = await prisma.forecast.create({
      data: {
        organizationId,
        metricKey: 'active_students',
        scenario: s.scenario,
        asOf: now,
        horizonEnd: horizon,
        projectedValue: projected,
        assumptions: {
          velocityPerMonth: velocity,
          factor: s.factor,
          baseActive: metrics.activeStudents,
        },
      },
    });
    created.push(row);
  }
  return created;
}

export async function executiveDashboard(organizationId: string) {
  const [enrolment, programmes, staffing, expenses, cash, targets] =
    await Promise.all([
      enrolmentMetrics(organizationId),
      programmePerformance(organizationId),
      staffingVersusDemand(organizationId),
      expenseRollup(organizationId),
      cashOutlook(organizationId),
      targetProgress(organizationId),
    ]);

  const forecasts = await prisma.forecast.findMany({
    where: { organizationId, metricKey: 'active_students' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  return {
    enrolment,
    programmes,
    staffing,
    expenses,
    cash,
    targets,
    forecasts,
    generatedAt: new Date().toISOString(),
  };
}

/** Tool surface for AI advisor — deterministic only */
export const analyticsTools = {
  enrolmentMetrics,
  programmePerformance,
  staffingVersusDemand,
  expenseRollup,
  cashOutlook,
  targetProgress,
  executiveDashboard,
  countActiveStudents,
};
