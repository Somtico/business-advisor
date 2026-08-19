import type { Prisma } from '@prisma/client';
import {
  DECISION_CONTEXT_SCHEMA_VERSION,
} from '../../config/legal';
import prisma from '../../config/prisma';
import {
  cashOutlook,
  enrolmentMetrics,
  expenseRollup,
  staffingVersusDemand,
} from '../metrics/analyticsService';
import { enrolmentGuidance } from '../enrolmentService';

/**
 * Versioned tenant-private context captured WHEN a recommendation is created.
 * Exact values stay org-scoped; only coarse bands may enter anonymized V2 tables.
 */
export interface DecisionContextV1 {
  schemaVersion: typeof DECISION_CONTEXT_SCHEMA_VERSION;
  capturedAt: string;
  educationSubtype: string;
  educationSubtypeOther: string | null;
  programmeCategory: string | null;
  activeLearnerCount: number;
  locationCount: number;
  utilization: number | null;
  spareCapacity: number | null;
  trialConversion: number | null;
  enquiryToEnrolConversion: number | null;
  retentionProxy: number | null;
  churnRate: number | null;
  enrolmentVelocity: number | null;
  labourRatio: number | null;
  marginRelevant: {
    pricingTargetMarginPercent: number | null;
  };
  cashRunwayWeeks: number | null;
  cashBalanceCents: number | null;
  programmeDemandState: string | null;
  seasonOrPeriod: string;
  targetStatus: string | null;
  dataFreshness: string;
  missingDataLimitations: string[];
  diagnosedLeak: string | null;
}

function seasonOrPeriod(asOf: Date): string {
  const month = asOf.getMonth() + 1;
  if (month >= 9 && month <= 11) return 'fall_term';
  if (month === 12 || month <= 2) return 'winter_term';
  if (month >= 3 && month <= 5) return 'spring_term';
  return 'summer';
}

export async function captureDecisionContext(
  organizationId: string,
  hints?: { diagnosisCode?: string | null; programmeCategory?: string | null }
): Promise<DecisionContextV1> {
  const [org, enrolment, staffing, cash, expenses, locations, guidance] =
    await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          educationSubtype: true,
          educationSubtypeOther: true,
          pricingTargetMarginPercent: true,
          cashBalanceCents: true,
          cashBalanceAsOf: true,
        },
      }),
      enrolmentMetrics(organizationId),
      staffingVersusDemand(organizationId),
      cashOutlook(organizationId),
      expenseRollup(organizationId),
      prisma.location.count({ where: { organizationId } }),
      enrolmentGuidance(organizationId).catch(() => null),
    ]);

  const missing: string[] = [];
  if (!enrolment.hasEnrolmentRecords) missing.push('active_students');
  if (staffing.status !== 'READY') missing.push('staffing_schedule');
  if (!expenses.monthExpensesAvailable && !expenses.recurringSubscriptionMonthlyCents) {
    missing.push('expenses_or_subscriptions');
  }

  const utilization =
    staffing.scheduledHours > 0
      ? Math.min(
          1,
          (staffing.neededInstructorHours || 0) /
            Math.max(staffing.scheduledHours, 0.01)
        )
      : null;

  const labourRatio =
    enrolment.activeStudents > 0
      ? staffing.labourCostCents / Math.max(enrolment.activeStudents, 1)
      : null;

  const capturedAt = new Date();
  const leak =
    guidance && guidance.leak !== 'INSUFFICIENT_DATA' ? guidance.leak : null;

  return {
    schemaVersion: DECISION_CONTEXT_SCHEMA_VERSION,
    capturedAt: capturedAt.toISOString(),
    educationSubtype: org.educationSubtype,
    educationSubtypeOther: org.educationSubtypeOther,
    programmeCategory: hints?.programmeCategory ?? null,
    activeLearnerCount: enrolment.activeStudents,
    locationCount: locations,
    utilization,
    spareCapacity:
      typeof staffing.excessHours === 'number' ? staffing.excessHours : null,
    trialConversion: enrolment.conversionRate ?? null,
    enquiryToEnrolConversion: enrolment.conversionRate ?? null,
    retentionProxy:
      enrolment.churnRate != null ? Math.max(0, 1 - enrolment.churnRate) : null,
    churnRate: enrolment.churnRate ?? null,
    enrolmentVelocity: enrolment.startedThisMonth ?? null,
    labourRatio,
    marginRelevant: {
      pricingTargetMarginPercent: org.pricingTargetMarginPercent,
    },
    cashRunwayWeeks: cash.runwayWeeks ?? null,
    cashBalanceCents: cash.cashBalanceCents,
    programmeDemandState: leak,
    seasonOrPeriod: seasonOrPeriod(capturedAt),
    targetStatus: null,
    dataFreshness: 'live_deterministic',
    missingDataLimitations: missing,
    diagnosedLeak: hints?.diagnosisCode ?? leak,
  };
}

export function contextAsJson(
  ctx: DecisionContextV1
): Prisma.InputJsonValue {
  return ctx as unknown as Prisma.InputJsonValue;
}
