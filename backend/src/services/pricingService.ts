import prisma from '../config/prisma';
import { countActiveStudents, expenseRollup } from './metrics/analyticsService';
import { ADVICE_DISCLAIMER } from '../config/legal';

/**
 * Pricing guidance with a hard no-guessing rule.
 *
 * A programme gets numeric guidance ONLY when every input is present in the
 * database: a list price, at least one active paid enrolment, scheduled
 * sessions with start AND end times, an instructor on every session, and a
 * wage profile for every one of those instructors, plus at least one recorded
 * expense or subscription for overhead. Anything missing produces an
 * INSUFFICIENT_DATA result with a concrete ask — never a fabricated number.
 * (Contrast: staffingVersusDemand tolerates fallback wages; pricing must not.)
 *
 * Cost-plus verdicts: Below Cost, Below Target Margin, On Track. An Above Target
 * price test is offered only when price sits clearly above recommended, fill has
 * been low for at least 4 weeks, spare seats exist, and a recorded demand signal
 * (trial-to-paid, enquiry-to-enrol, or enrolment velocity) is weak. Empty seats
 * alone never trigger a cut. Household income is not used.
 */

const WEEKS_PER_MONTH = 4.345;
/** Standard full-time hours used to express an annual salary as hourly. */
const SALARY_HOURS_PER_YEAR = 2080;
const LOW_UTILIZATION = 0.6;
/** Price must sit at least this far above cost + target margin to count as "clearly above." */
const PRICE_PREMIUM_RATIO = 1.15;
const MIN_PREMIUM_CENTS = 1000;
const PERSISTENCE_DAYS = 28;
const PRICE_TEST_MONITOR_WEEKS = 6;
const MIN_TRIALS_FOR_SIGNAL = 3;
const MIN_LEADS_FOR_SIGNAL = 5;
const MIN_PRIOR_STARTS_FOR_VELOCITY = 2;
const WEAK_CONVERSION_RATE = 0.3;
const VELOCITY_DECLINE_RATIO = 0.8;

export type PricingVerdict =
  | 'BELOW_COST'
  | 'BELOW_TARGET'
  | 'ON_TRACK'
  | 'ABOVE_TARGET';

type EngagementSlice = {
  personId: string;
  isTrial: boolean;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface DemandSignal {
  key: string;
  label: string;
  detail: string;
  weak: boolean;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function engagementStart(e: EngagementSlice): Date {
  return e.startDate ?? e.createdAt;
}

function wasPaidActiveAt(e: EngagementSlice, asOf: Date): boolean {
  if (e.isTrial) return false;
  if (engagementStart(e) > asOf) return false;
  if (e.endDate && e.endDate < asOf) return false;
  if (
    !e.endDate &&
    (e.status === 'CANCELLED' || e.status === 'COMPLETED') &&
    e.updatedAt < asOf
  ) {
    return false;
  }
  return true;
}

function paidStartsInRange(
  engagements: EngagementSlice[],
  from: Date,
  to: Date
): number {
  return engagements.filter((e) => {
    if (e.isTrial) return false;
    const start = engagementStart(e);
    return start >= from && start < to;
  }).length;
}

function collectDemandSignals(
  engagements: EngagementSlice[],
  now: Date,
  leadTotal: number,
  leadConverted: number
): DemandSignal[] {
  const signals: DemandSignal[] = [];

  const trialPersonIds = new Set(
    engagements.filter((e) => e.isTrial).map((e) => e.personId)
  );
  const paidPersonIds = new Set(
    engagements.filter((e) => !e.isTrial).map((e) => e.personId)
  );
  const trialCount = trialPersonIds.size;
  let convertedTrials = 0;
  for (const id of trialPersonIds) {
    if (paidPersonIds.has(id)) convertedTrials += 1;
  }
  if (trialCount >= MIN_TRIALS_FOR_SIGNAL) {
    const rate = convertedTrials / trialCount;
    signals.push({
      key: 'trial_to_paid',
      label: 'Trial-to-Paid Conversion',
      detail: `${convertedTrials} of ${trialCount} trial students (${(rate * 100).toFixed(0)}%) continued to a paid enrolment.`,
      weak: rate < WEAK_CONVERSION_RATE,
    });
  }

  if (leadTotal >= MIN_LEADS_FOR_SIGNAL) {
    const rate = leadConverted / leadTotal;
    signals.push({
      key: 'enquiry_to_enrol',
      label: 'Enquiry-to-Enrol Conversion',
      detail: `${leadConverted} of ${leadTotal} enquiries (${(rate * 100).toFixed(0)}%) converted to an enrolment.`,
      weak: rate < WEAK_CONVERSION_RATE,
    });
  }

  const recentFrom = new Date(now.getTime() - PERSISTENCE_DAYS * 86_400_000);
  const priorFrom = new Date(now.getTime() - 2 * PERSISTENCE_DAYS * 86_400_000);
  const recentStarts = paidStartsInRange(engagements, recentFrom, now);
  const priorStarts = paidStartsInRange(engagements, priorFrom, recentFrom);
  if (priorStarts >= MIN_PRIOR_STARTS_FOR_VELOCITY) {
    const ratio = recentStarts / priorStarts;
    signals.push({
      key: 'enrolment_velocity',
      label: 'Enrolment Velocity',
      detail: `${recentStarts} paid start(s) in the last ${PERSISTENCE_DAYS} days vs ${priorStarts} in the ${PERSISTENCE_DAYS} days before that.`,
      weak: ratio < VELOCITY_DECLINE_RATIO,
    });
  }

  return signals;
}

function evaluatePriceTest(args: {
  priceCents: number;
  recommendedPriceCents: number;
  floorAtCurrentFillCents: number;
  targetMarginPercent: number;
  utilization: number | null;
  capacity: number | null;
  activeEnrolments: number;
  engagements: EngagementSlice[];
  now: Date;
  leadTotal: number;
  leadConverted: number;
}): {
  eligible: boolean;
  testPriceCents: number;
  note: string;
  evidence: Record<string, unknown>;
} {
  const testPriceCents = args.recommendedPriceCents;
  const premiumRatio =
    args.recommendedPriceCents > 0
      ? args.priceCents / args.recommendedPriceCents
      : 0;
  const premiumCents = args.priceCents - args.recommendedPriceCents;
  const clearlyAbove =
    premiumRatio >= PRICE_PREMIUM_RATIO && premiumCents >= MIN_PREMIUM_CENTS;

  const spareSeats =
    args.capacity != null && args.capacity > 0
      ? Math.max(0, args.capacity - args.activeEnrolments)
      : 0;
  const hasSpareCapacity = spareSeats > 0;

  const priorAsOf = new Date(
    args.now.getTime() - PERSISTENCE_DAYS * 86_400_000
  );
  const priorCount = args.engagements.filter((e) =>
    wasPaidActiveAt(e, priorAsOf)
  ).length;
  const utilizationPrior =
    args.capacity && args.capacity > 0
      ? Math.min(1, priorCount / args.capacity)
      : null;
  const earliest = args.engagements.reduce<Date | null>((min, e) => {
    const s = engagementStart(e);
    return min == null || s < min ? s : min;
  }, null);
  const hasPersistenceWindow = earliest != null && earliest <= priorAsOf;
  const persistentlyLow =
    args.utilization != null &&
    args.utilization < LOW_UTILIZATION &&
    utilizationPrior != null &&
    utilizationPrior < LOW_UTILIZATION &&
    hasPersistenceWindow;

  const demandSignals = collectDemandSignals(
    args.engagements,
    args.now,
    args.leadTotal,
    args.leadConverted
  );
  const weakSignals = demandSignals.filter((s) => s.weak);
  const demandWeak = weakSignals.length > 0;

  const eligible =
    clearlyAbove && persistentlyLow && hasSpareCapacity && demandWeak;

  const weakList = weakSignals.map((s) => s.detail).join(' ');
  const note = eligible
    ? `Your price of ${dollars(args.priceCents)}/month sits ${((premiumRatio - 1) * 100).toFixed(0)}% above the recommended ${dollars(args.recommendedPriceCents)} (cost + ${args.targetMarginPercent}% target margin). The room has been under ${Math.round(LOW_UTILIZATION * 100)}% full for at least ${PERSISTENCE_DAYS} days, ${spareSeats} seat${spareSeats === 1 ? ' is' : 's are'} open, and demand looks weak: ${weakList} Consider a ${PRICE_TEST_MONITOR_WEEKS}-week test at ${dollars(testPriceCents)}/month, which still clears the ${dollars(args.floorAtCurrentFillCents)} cost floor, or a limited number of promo or scholarship seats at that rate. Then watch enrolments and conversion. Empty seats have many causes; a cut that does not fill them is a permanent margin loss.`
    : '';

  return {
    eligible,
    testPriceCents,
    note,
    evidence: {
      clearlyAbove,
      premiumRatio: Number(premiumRatio.toFixed(3)),
      premiumCents,
      persistentlyLow,
      utilizationNow: args.utilization,
      utilization28dAgo: utilizationPrior,
      paidEnrolments28dAgo: priorCount,
      hasPersistenceWindow,
      spareSeats,
      hasSpareCapacity,
      demandWeak,
      demandSignals,
      testPriceCents,
      monitorWeeks: PRICE_TEST_MONITOR_WEEKS,
      stillClearsFloor: testPriceCents >= args.floorAtCurrentFillCents,
      eligible,
    },
  };
}

export interface MissingDataItem {
  key: string;
  label: string;
  detail: string;
  fixPath: string;
}

export interface ProgrammePricingGuidance {
  programmeId: string;
  name: string;
  priceCents: number | null;
  activeEnrolments: number;
  capacity: number | null;
  utilization: number | null;
  status: 'READY' | 'INSUFFICIENT_DATA';
  missingData: MissingDataItem[];
  monthlyDirectLabourCents: number | null;
  overheadPerStudentCents: number | null;
  floorAtCurrentFillCents: number | null;
  floorAtCapacityCents: number | null;
  recommendedPriceCents: number | null;
  testPriceCents: number | null;
  priceTestMonitorWeeks: number | null;
  verdict: PricingVerdict | null;
  note: string | null;
  evidence: Record<string, unknown> | null;
}

export interface PricingGuidanceResult {
  targetMarginPercent: number;
  totalActiveStudents: number;
  overheadMonthlyCents: number;
  programmes: ProgrammePricingGuidance[];
  disclaimer: string;
  generatedAt: string;
}

export async function pricingGuidance(
  organizationId: string
): Promise<PricingGuidanceResult> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { pricingTargetMarginPercent: true },
  });
  const targetMarginPercent = org.pricingTargetMarginPercent;

  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    programmes,
    totalActiveStudents,
    expenses,
    expenseRecordCount,
    subscriptionCount,
    leadTotal,
    leadConverted,
  ] = await Promise.all([
    prisma.productService.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    }),
    countActiveStudents(organizationId),
    expenseRollup(organizationId),
    prisma.expenseTransaction.count({ where: { organizationId } }),
    prisma.recurringSubscription.count({ where: { organizationId } }),
    prisma.lead.count({ where: { organizationId } }),
    prisma.lead.count({ where: { organizationId, convertedAt: { not: null } } }),
  ]);

  const overheadMonthlyCents =
    expenses.monthExpenseCents + expenses.recurringSubscriptionMonthlyCents;
  const overheadDataExists = expenseRecordCount > 0 || subscriptionCount > 0;

  const results: ProgrammePricingGuidance[] = [];

  for (const p of programmes) {
    const missing: MissingDataItem[] = [];

    const activeEnrolments = await prisma.engagement.count({
      where: {
        organizationId,
        productServiceId: p.id,
        status: { in: ['ACTIVE', 'PAUSED'] },
        isTrial: false,
      },
    });

    const sessions = await prisma.session.findMany({
      where: {
        organizationId,
        productServiceId: p.id,
        startsAt: { gte: now, lte: weekEnd },
      },
      include: { staffMember: { include: { compensation: true } } },
    });

    if (p.priceCents == null) {
      missing.push({
        key: 'price',
        label: 'List Price',
        detail: `Set the current price for ${p.name} so guidance can compare it against the cost floor.`,
        fixPath: '/app/programmes',
      });
    }
    if (activeEnrolments === 0) {
      missing.push({
        key: 'enrolments',
        label: 'Active Enrolments',
        detail: `Record at least one active paid enrolment in ${p.name}; the cost floor is calculated per enrolled student.`,
        fixPath: '/app/programmes',
      });
    }
    if (sessions.length === 0) {
      missing.push({
        key: 'sessions',
        label: 'Scheduled Sessions',
        detail: `No sessions are scheduled for ${p.name} in the next 7 days. Add this week's class sessions (with an instructor) so labour cost can be measured.`,
        fixPath: '/app/pricing',
      });
    }

    const sessionsWithoutEnd = sessions.filter((s) => !s.endsAt);
    if (sessionsWithoutEnd.length > 0) {
      missing.push({
        key: 'session_times',
        label: 'Session End Times',
        detail: `${sessionsWithoutEnd.length} session(s) for ${p.name} have no end time, so their duration cannot be measured.`,
        fixPath: '/app/pricing',
      });
    }
    const sessionsWithoutStaff = sessions.filter((s) => !s.staffMember);
    if (sessionsWithoutStaff.length > 0) {
      missing.push({
        key: 'session_staff',
        label: 'Instructor on Each Session',
        detail: `${sessionsWithoutStaff.length} session(s) for ${p.name} have no instructor assigned, so labour cost cannot be attributed.`,
        fixPath: '/app/pricing',
      });
    }

    const staffMissingWage = sessions
      .filter((s) => s.staffMember)
      .filter((s) => {
        const c = s.staffMember!.compensation;
        return !c || (c.hourlyCents == null && c.salaryAnnualCents == null);
      })
      .map((s) => `${s.staffMember!.firstName} ${s.staffMember!.lastName}`);
    if (staffMissingWage.length > 0) {
      missing.push({
        key: 'wages',
        label: 'Instructor Wages',
        detail: `Add a wage profile for: ${Array.from(new Set(staffMissingWage)).join(', ')}. Labour cost cannot be calculated without real wages.`,
        fixPath: '/app/staffing',
      });
    }

    if (!overheadDataExists) {
      missing.push({
        key: 'expenses',
        label: 'Operating Expenses',
        detail:
          'Record your operating expenses and recurring subscriptions so overhead can be allocated per student. Without them the floor would understate your true cost.',
        fixPath: '/app/expenses',
      });
    }

    const utilization =
      p.capacity && p.capacity > 0
        ? Math.min(1, activeEnrolments / p.capacity)
        : null;

    if (missing.length > 0) {
      results.push({
        programmeId: p.id,
        name: p.name,
        priceCents: p.priceCents,
        activeEnrolments,
        capacity: p.capacity,
        utilization,
        status: 'INSUFFICIENT_DATA',
        missingData: missing,
        monthlyDirectLabourCents: null,
        overheadPerStudentCents: null,
        floorAtCurrentFillCents: null,
        floorAtCapacityCents: null,
        recommendedPriceCents: null,
        testPriceCents: null,
        priceTestMonitorWeeks: null,
        verdict: null,
        note: null,
        evidence: null,
      });
      continue;
    }

    // Every input verified — compute.
    let weeklyLabourCents = 0;
    let weeklyHours = 0;
    const sessionEvidence = [];
    for (const s of sessions) {
      const hours =
        (s.endsAt!.getTime() - s.startsAt.getTime()) / 3_600_000;
      const c = s.staffMember!.compensation!;
      const hourlyCents =
        c.hourlyCents ??
        Math.round((c.salaryAnnualCents as number) / SALARY_HOURS_PER_YEAR);
      const burden = 1 + c.burdenPercent / 100;
      const cost = Math.round(hours * hourlyCents * burden);
      weeklyLabourCents += cost;
      weeklyHours += hours;
      sessionEvidence.push({
        sessionId: s.id,
        startsAt: s.startsAt.toISOString(),
        hours: Number(hours.toFixed(2)),
        instructor: `${s.staffMember!.firstName} ${s.staffMember!.lastName}`,
        hourlyCents,
        burdenPercent: c.burdenPercent,
        costCents: cost,
      });
    }

    const monthlyDirectLabourCents = Math.round(
      weeklyLabourCents * WEEKS_PER_MONTH
    );
    const overheadPerStudentCents =
      totalActiveStudents > 0
        ? Math.round(overheadMonthlyCents / totalActiveStudents)
        : 0;

    const floorAtCurrentFillCents = Math.round(
      monthlyDirectLabourCents / activeEnrolments + overheadPerStudentCents
    );
    const floorAtCapacityCents =
      p.capacity && p.capacity > 0
        ? Math.round(
            monthlyDirectLabourCents / p.capacity + overheadPerStudentCents
          )
        : null;
    const recommendedPriceCents = Math.round(
      floorAtCurrentFillCents * (1 + targetMarginPercent / 100)
    );

    const programmeEngagements = await prisma.engagement.findMany({
      where: { organizationId, productServiceId: p.id },
      select: {
        personId: true,
        isTrial: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const price = p.priceCents as number;
    const priceTest = evaluatePriceTest({
      priceCents: price,
      recommendedPriceCents,
      floorAtCurrentFillCents,
      targetMarginPercent,
      utilization,
      capacity: p.capacity,
      activeEnrolments,
      engagements: programmeEngagements,
      now,
      leadTotal,
      leadConverted,
    });

    let verdict: ProgrammePricingGuidance['verdict'];
    let note: string | null = null;
    let testPriceCents: number | null = null;
    let priceTestMonitorWeeks: number | null = null;
    if (price < floorAtCurrentFillCents) {
      verdict = 'BELOW_COST';
      note = `At the current fill of ${activeEnrolments}, each enrolment costs ${dollars(floorAtCurrentFillCents)}/month to deliver but is priced at ${dollars(price)}. This programme loses money per student.`;
    } else if (price < recommendedPriceCents) {
      verdict = 'BELOW_TARGET';
      note = `The price covers cost but sits below the ${targetMarginPercent}% target margin. Recommended: ${dollars(recommendedPriceCents)}/month.`;
    } else if (priceTest.eligible) {
      verdict = 'ABOVE_TARGET';
      testPriceCents = priceTest.testPriceCents;
      priceTestMonitorWeeks = PRICE_TEST_MONITOR_WEEKS;
      note = priceTest.note;
    } else {
      verdict = 'ON_TRACK';
      note =
        utilization != null && utilization < LOW_UTILIZATION
          ? `Pricing meets the target margin, but the room is ${(utilization * 100).toFixed(0)}% full. Filling seats lowers the per-student floor faster than a price change would. Empty seats alone are not a reason to cut price.`
          : 'Pricing meets the target margin at the current fill.';
    }

    results.push({
      programmeId: p.id,
      name: p.name,
      priceCents: price,
      activeEnrolments,
      capacity: p.capacity,
      utilization,
      status: 'READY',
      missingData: [],
      monthlyDirectLabourCents,
      overheadPerStudentCents,
      floorAtCurrentFillCents,
      floorAtCapacityCents,
      recommendedPriceCents,
      testPriceCents,
      priceTestMonitorWeeks,
      verdict,
      note,
      evidence: {
        method:
          'floorAtCurrentFill = (weekly session labour × 4.345 weeks/month ÷ active enrolments) + (monthly expenses + subscriptions ÷ all active students). recommended = floor × (1 + target margin). Salaried wages expressed hourly at 2080 h/year. All inputs below come from your records. A price test is offered only when price sits clearly above recommended, utilization has been low for at least 4 weeks, spare seats exist, and a recorded demand signal is weak. Household income is not used.',
        weeklyHours: Number(weeklyHours.toFixed(2)),
        weeklyLabourCents,
        monthlyDirectLabourCents,
        overheadMonthlyCents,
        totalActiveStudents,
        overheadPerStudentCents,
        targetMarginPercent,
        sessions: sessionEvidence,
        priceTest: priceTest.evidence,
      },
    });
  }

  return {
    targetMarginPercent,
    totalActiveStudents,
    overheadMonthlyCents,
    programmes: results,
    disclaimer: ADVICE_DISCLAIMER,
    generatedAt: now.toISOString(),
  };
}

/**
 * HTTP response for Pricing Advisor. Drops per-instructor hourly rates and
 * burden percents so a Network-tab copy cannot replay the wage formula.
 * Chuk still receives the full `pricingGuidance` tool result server-side.
 */
export function sanitizePricingGuidanceForClient(
  data: PricingGuidanceResult
): PricingGuidanceResult {
  return {
    ...data,
    programmes: data.programmes.map((p) => {
      if (!p.evidence || typeof p.evidence !== 'object') return p;
      const ev = p.evidence as {
        sessions?: Array<Record<string, unknown>>;
        [key: string]: unknown;
      };
      const sessions = Array.isArray(ev.sessions)
        ? ev.sessions.map((s) => ({
            sessionId: s.sessionId,
            startsAt: s.startsAt,
            hours: s.hours,
            instructor: s.instructor,
            costCents: s.costCents,
          }))
        : [];
      return {
        ...p,
        evidence: {
          ...ev,
          sessions,
        },
      };
    }),
  };
}
