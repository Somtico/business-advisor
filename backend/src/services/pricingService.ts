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
 */

const WEEKS_PER_MONTH = 4.345;
/** Standard full-time hours used to express an annual salary as hourly. */
const SALARY_HOURS_PER_YEAR = 2080;

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
  verdict: 'BELOW_COST' | 'BELOW_TARGET' | 'ON_TRACK' | null;
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

  const [programmes, totalActiveStudents, expenses, expenseRecordCount, subscriptionCount] =
    await Promise.all([
      prisma.productService.findMany({
        where: { organizationId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      countActiveStudents(organizationId),
      expenseRollup(organizationId),
      prisma.expenseTransaction.count({ where: { organizationId } }),
      prisma.recurringSubscription.count({ where: { organizationId } }),
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

    const price = p.priceCents as number;
    let verdict: ProgrammePricingGuidance['verdict'];
    let note: string | null = null;
    if (price < floorAtCurrentFillCents) {
      verdict = 'BELOW_COST';
      note = `At the current fill of ${activeEnrolments}, each enrolment costs $${(floorAtCurrentFillCents / 100).toFixed(2)}/month to deliver but is priced at $${(price / 100).toFixed(2)}. This programme loses money per student.`;
    } else if (price < recommendedPriceCents) {
      verdict = 'BELOW_TARGET';
      note = `The price covers cost but sits below the ${targetMarginPercent}% target margin. Recommended: $${(recommendedPriceCents / 100).toFixed(2)}/month.`;
    } else {
      verdict = 'ON_TRACK';
      note =
        utilization != null && utilization < 0.6
          ? `Pricing meets the target margin, but the room is ${(utilization * 100).toFixed(0)}% full. Filling seats lowers the per-student floor faster than a price change would.`
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
      verdict,
      note,
      evidence: {
        method:
          'floorAtCurrentFill = (weekly session labour × 4.345 weeks/month ÷ active enrolments) + (monthly expenses + subscriptions ÷ all active students). recommended = floor × (1 + target margin). Salaried wages expressed hourly at 2080 h/year. All inputs below come from your records.',
        weeklyHours: Number(weeklyHours.toFixed(2)),
        weeklyLabourCents,
        monthlyDirectLabourCents,
        overheadMonthlyCents,
        totalActiveStudents,
        overheadPerStudentCents,
        targetMarginPercent,
        sessions: sessionEvidence,
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
