import { ForecastScenario } from '@prisma/client';
import prisma from '../../config/prisma';
import { impactSummary } from '../impactService';
import { resolveCurrentCash } from './cashObservationService';
import {
  cashOutlookIsReady,
  enrolmentCountIsReady,
  forecastsAreReady,
  knownOrMissing,
  labourOpportunityIsReady,
  monthExpensesAreReady,
  verifiedImpactIsReady,
} from './metricAvailability';

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

  const engagementRecordCount = await prisma.engagement.count({
    where: { organizationId },
  });
  const hasEnrolmentRecords = enrolmentCountIsReady(engagementRecordCount);

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
    hasEnrolmentRecords,
    engagementRecordCount,
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

  const staffingReady = labourOpportunityIsReady({
    shiftCount: shifts.length,
    sessionCount: sessions.length,
  });
  const missingData: string[] = [];
  if (shifts.length === 0) {
    missingData.push(
      'Add this week\'s instructor shifts so labour opportunity can be measured.'
    );
  }
  if (sessions.length === 0) {
    missingData.push(
      'Schedule this week\'s class sessions so staffing can be compared with demand.'
    );
  }

  const neededInstructorHours = sessionHours;
  const excessHours = staffingReady
    ? Math.max(0, scheduledHours - neededInstructorHours)
    : 0;
  const avgHourly =
    scheduledHours > 0 ? labourCostCents / scheduledHours : 2500;
  const estimatedSavingsCents = staffingReady
    ? Math.round(excessHours * avgHourly)
    : 0;

  return {
    status: staffingReady ? ('READY' as const) : ('INSUFFICIENT_DATA' as const),
    missingData,
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
  const [expenses, expenseRecordCount, subscriptions] = await Promise.all([
    prisma.expenseTransaction.findMany({
      where: { organizationId, occurredAt: { gte: monthStart } },
    }),
    prisma.expenseTransaction.count({ where: { organizationId } }),
    prisma.recurringSubscription.findMany({
      where: { organizationId, isActive: true },
    }),
  ]);
  const monthExpensesAvailable = monthExpensesAreReady(expenseRecordCount);
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
    monthExpensesAvailable,
    expenseRecordCount,
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
  const [currentCash, expenses, staffing, revenues, programmes] = await Promise.all([
    resolveCurrentCash(organizationId),
    expenseRollup(organizationId),
    staffingVersusDemand(organizationId),
    prisma.revenueTransaction.findMany({
      where: {
        organizationId,
        isRecurring: true,
      },
    }),
    prisma.productService.findMany({
      where: { organizationId, isActive: true, priceCents: { not: null } },
    }),
  ]);
  const recurringRevenueMonthly = revenues.reduce((s, r) => {
    return s + r.amountCents;
  }, 0);

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
    staffing.labourCostCents;
  const hasRevenueSignal = monthlyIn > 0;
  const hasCostSignal =
    expenses.monthExpensesAvailable ||
    expenses.subscriptionCount > 0 ||
    staffing.status === 'READY';
  const outlookReady = cashOutlookIsReady({ hasRevenueSignal, hasCostSignal });
  const missingData: string[] = [];
  if (!hasRevenueSignal) {
    missingData.push(
      'Record tuition or recurring revenue so a monthly cash outlook can be calculated.'
    );
  }
  if (!hasCostSignal) {
    missingData.push(
      'Record expenses, subscriptions, or this week\'s staffing so outflow can be calculated.'
    );
  }

  const net = monthlyIn - monthlyOut;
  const cash = currentCash.cashBalanceCents;
  const runwayWeeks =
    !outlookReady || net >= 0 || cash == null || cash <= 0
      ? null
      : Number(((cash / Math.abs(net)) * 4.345).toFixed(1));

  return {
    ...currentCash,
    monthlyInCents: monthlyIn,
    monthlyOutCents: monthlyOut,
    hasRevenueSignal,
    hasCostSignal,
    outlookStatus: outlookReady ? ('READY' as const) : ('INSUFFICIENT_DATA' as const),
    missingData,
    netMonthlyCents: outlookReady ? net : null,
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
  if (!forecastsAreReady(metrics.engagementRecordCount)) {
    return [];
  }
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
  const [enrolment, programmes, staffing, expenses, cash, targets, advisorImpact] =
    await Promise.all([
      enrolmentMetrics(organizationId),
      programmePerformance(organizationId),
      staffingVersusDemand(organizationId),
      expenseRollup(organizationId),
      cashOutlook(organizationId),
      targetProgress(organizationId),
      impactSummary(organizationId),
    ]);

  const forecastReady = forecastsAreReady(enrolment.engagementRecordCount);
  const forecasts = forecastReady
    ? await prisma.forecast.findMany({
        where: { organizationId, metricKey: 'active_students' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      })
    : [];

  return {
    enrolment: {
      ...enrolment,
      activeStudents: knownOrMissing(
        enrolment.hasEnrolmentRecords,
        enrolment.activeStudents
      ),
      activeStudentsPriorMonth: knownOrMissing(
        enrolment.hasEnrolmentRecords,
        enrolment.activeStudentsPriorMonth
      ),
      activeStudentsAvailable: enrolment.hasEnrolmentRecords,
    },
    programmes,
    staffing: {
      ...staffing,
      estimatedSavingsCents: knownOrMissing(
        staffing.status === 'READY',
        staffing.estimatedSavingsCents
      ),
      excessHours: knownOrMissing(staffing.status === 'READY', staffing.excessHours),
    },
    expenses: {
      ...expenses,
      monthExpenseCents: knownOrMissing(
        expenses.monthExpensesAvailable,
        expenses.monthExpenseCents
      ),
    },
    cash,
    targets,
    forecasts,
    forecastStatus: forecastReady ? ('READY' as const) : ('INSUFFICIENT_DATA' as const),
    forecastMissingData: forecastReady
      ? []
      : [
          'Advisor needs enrolment history before it can build reliable growth, expected and conservative forecasts.',
        ],
    advisorImpact: {
      ...advisorImpact,
      verifiedAvailable: verifiedImpactIsReady(advisorImpact.verified.actionCount),
    },
    generatedAt: new Date().toISOString(),
  };
}

function medianCents(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Instructor labour per learner-hour from the next 7 days of scheduled sessions.
 * Missing wages or session end times produce INSUFFICIENT_DATA, not a guess.
 */
export async function instructorCostPerSeatHour(organizationId: string) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sessions = await prisma.session.findMany({
    where: { organizationId, startsAt: { gte: now, lte: weekEnd } },
    include: {
      staffMember: { include: { compensation: true } },
    },
  });

  const missing: string[] = [];
  if (sessions.length === 0) {
    missing.push(
      'Schedule this week\'s class sessions with start and end times and an instructor.'
    );
  }

  let labourCents = 0;
  let seatHours = 0;
  let hoursMissingEnd = 0;
  let hoursMissingWage = 0;
  for (const s of sessions) {
    if (!s.endsAt) {
      hoursMissingEnd += 1;
      continue;
    }
    const hours = Math.max(
      0,
      (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000
    );
    const roster = s.rosterCount ?? 0;
    seatHours += hours * roster;
    const c = s.staffMember?.compensation;
    if (!c || (c.hourlyCents == null && c.salaryAnnualCents == null)) {
      hoursMissingWage += 1;
      continue;
    }
    const hourly =
      c.hourlyCents ?? Math.round((c.salaryAnnualCents as number) / 2080);
    const burden = 1 + (c.burdenPercent ?? 0) / 100;
    labourCents += Math.round(hours * hourly * burden);
  }

  if (hoursMissingEnd > 0) {
    missing.push(
      `${hoursMissingEnd} session(s) are missing an end time, so seat-hours cannot be calculated.`
    );
  }
  if (hoursMissingWage > 0) {
    missing.push(
      `${hoursMissingWage} session(s) have an instructor without a wage profile.`
    );
  }
  if (seatHours <= 0 && sessions.length > 0) {
    missing.push(
      'Add roster counts on this week\'s sessions so labour can be divided by learner-hours.'
    );
  }

  if (missing.length > 0 || seatHours <= 0 || labourCents <= 0) {
    return {
      status: 'INSUFFICIENT_DATA' as const,
      missingData: missing,
      centsPerSeatHour: null,
      labourCents,
      seatHours: Number(seatHours.toFixed(2)),
      sessionCount: sessions.length,
    };
  }

  return {
    status: 'READY' as const,
    missingData: [] as string[],
    centsPerSeatHour: Math.round(labourCents / seatHours),
    labourCents,
    seatHours: Number(seatHours.toFixed(2)),
    sessionCount: sessions.length,
  };
}

/**
 * Monthly tuition per household (or per student when no household is linked).
 * No names. Annualized figure is 12 × current monthly list price, not a forecast.
 */
export async function householdLtv(organizationId: string) {
  const engagements = await prisma.engagement.findMany({
    where: {
      organizationId,
      isTrial: false,
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    select: {
      personId: true,
      person: { select: { householdId: true } },
      productService: { select: { priceCents: true } },
    },
  });

  const missing: string[] = [];
  if (engagements.length === 0) {
    missing.push('Record paid enrolments before household value can be calculated.');
  }

  const byGroup = new Map<string, number>();
  let missingPrice = 0;
  for (const e of engagements) {
    const price = e.productService?.priceCents;
    if (price == null) {
      missingPrice += 1;
      continue;
    }
    const key = e.person.householdId || `person:${e.personId}`;
    byGroup.set(key, (byGroup.get(key) || 0) + price);
  }
  if (missingPrice > 0) {
    missing.push(
      `${missingPrice} paid enrolment(s) sit on a programme with no list price.`
    );
  }

  const monthly = [...byGroup.values()];
  if (monthly.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA' as const,
      missingData: missing.length
        ? missing
        : ['Add programme list prices so household value can be calculated.'],
      householdCount: 0,
      averageMonthlyCents: null,
      medianMonthlyCents: null,
      annualizedAverageCents: null,
    };
  }

  const averageMonthlyCents = Math.round(
    monthly.reduce((s, n) => s + n, 0) / monthly.length
  );
  return {
    status: 'READY' as const,
    missingData: missing,
    householdCount: monthly.length,
    averageMonthlyCents,
    medianMonthlyCents: medianCents(monthly),
    annualizedAverageCents: averageMonthlyCents * 12,
    note: 'Annualized value is 12 × current monthly list price on active enrolments, not a predicted lifetime.',
  };
}

/**
 * Trial-to-paid conversion per programme from recorded engagements.
 * A conversion is a person who has both a trial and a later paid enrolment
 * on the same programme. No invented rates.
 */
export async function trialToPaidByProgramme(organizationId: string) {
  const programmes = await prisma.productService.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true },
  });
  const missing: string[] = [];
  if (programmes.length === 0) {
    missing.push('Add at least one active programme.');
  }

  const rows = [];
  let anyTrials = false;
  for (const p of programmes) {
    const engagements = await prisma.engagement.findMany({
      where: { organizationId, productServiceId: p.id },
      select: { personId: true, isTrial: true, createdAt: true, startDate: true },
    });
    const trialAt = new Map<string, Date>();
    const paidAt = new Map<string, Date>();
    for (const e of engagements) {
      const when = e.startDate ?? e.createdAt;
      if (e.isTrial) {
        const prev = trialAt.get(e.personId);
        if (!prev || when < prev) trialAt.set(e.personId, when);
      } else {
        const prev = paidAt.get(e.personId);
        if (!prev || when < prev) paidAt.set(e.personId, when);
      }
    }
    if (trialAt.size > 0) anyTrials = true;
    let converted = 0;
    for (const [personId, trialDate] of trialAt) {
      const paidDate = paidAt.get(personId);
      if (paidDate && paidDate >= trialDate) converted += 1;
    }
    rows.push({
      programmeId: p.id,
      name: p.name,
      trialPeople: trialAt.size,
      convertedPeople: converted,
      conversionRate:
        trialAt.size > 0 ? Number((converted / trialAt.size).toFixed(2)) : null,
    });
  }

  if (programmes.length > 0 && !anyTrials) {
    missing.push(
      'Record trials or enquiries per programme so conversion can be measured.'
    );
  }

  return {
    status: missing.length > 0 && rows.every((r) => r.trialPeople === 0)
      ? ('INSUFFICIENT_DATA' as const)
      : ('READY' as const),
    missingData: missing,
    programmes: rows,
  };
}

const CASH_SAFE_MAX_WEEKLY_CENTS = 15_000;
const CASH_SAFE_MIN_WEEKLY_CENTS = 2_500;
const SURPLUS_SHARE = 0.25;
const MONTHLY_IN_SHARE = 0.05;
const MIN_RUNWAY_WEEKS = 8;

/**
 * Largest weekly paid-test spend this centre's cash can absorb.
 * Never a promise that ads will fill seats.
 */
export async function cashSafeTestSize(organizationId: string) {
  const cash = await cashOutlook(organizationId);
  const missing: string[] = [...cash.missingData];
  if (cash.outlookStatus !== 'READY' || cash.netMonthlyCents == null) {
    return {
      status: 'INSUFFICIENT_DATA' as const,
      missingData: missing.length
        ? missing
        : [
            'Record tuition or recurring revenue so a cash-safe weekly spend cap can be calculated.',
          ],
      eligible: false,
      weeklyCapCents: 0,
      netMonthlyCents: cash.netMonthlyCents,
      runwayWeeks: cash.runwayWeeks,
      note: missing[0] || 'Not enough data to size a cash-safe paid test.',
    };
  }

  const weeklySurplus = cash.netMonthlyCents / 4.345;
  const fromSurplus =
    weeklySurplus > 0 ? Math.floor(weeklySurplus * SURPLUS_SHARE) : 0;
  const fromRevenue =
    cash.monthlyInCents > 0
      ? Math.floor((cash.monthlyInCents * MONTHLY_IN_SHARE) / 4.345)
      : 0;
  const rawCap = Math.min(
    CASH_SAFE_MAX_WEEKLY_CENTS,
    ...[fromSurplus, fromRevenue].filter((n) => n > 0)
  );
  const shrinking =
    cash.netMonthlyCents < 0 &&
    (cash.runwayWeeks == null || cash.runwayWeeks < MIN_RUNWAY_WEEKS);

  if (shrinking) {
    return {
      status: 'READY' as const,
      missingData: missing,
      eligible: false,
      weeklyCapCents: 0,
      netMonthlyCents: cash.netMonthlyCents,
      runwayWeeks: cash.runwayWeeks,
      note: 'Cash is shrinking and runway is under 8 weeks. A paid test is not cash-safe.',
    };
  }

  if (missing.length > 0 || rawCap < CASH_SAFE_MIN_WEEKLY_CENTS) {
    return {
      status: missing.length > 0 ? ('INSUFFICIENT_DATA' as const) : ('READY' as const),
      missingData: missing,
      eligible: false,
      weeklyCapCents: 0,
      netMonthlyCents: cash.netMonthlyCents,
      runwayWeeks: cash.runwayWeeks,
      note:
        missing.length > 0
          ? missing[0]
          : 'Weekly surplus is too small for a paid test. Cheap fills come first.',
    };
  }

  return {
    status: 'READY' as const,
    missingData: [] as string[],
    eligible: true,
    weeklyCapCents: rawCap,
    netMonthlyCents: cash.netMonthlyCents,
    runwayWeeks: cash.runwayWeeks,
    note: `Cash can absorb a time-boxed paid test up to $${(rawCap / 100).toFixed(0)}/week. That is a spend cap, not a forecast of new students.`,
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
  advisorImpact: impactSummary,
  instructorCostPerSeatHour,
  householdLtv,
  trialToPaidByProgramme,
  cashSafeTestSize,
};
