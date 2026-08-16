import {
  BENCHMARK_SNAPSHOT_SCHEMA_VERSION,
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
} from '../../config/legal';
import prisma from '../../config/prisma';
import { enrolmentMetrics } from '../metrics/analyticsService';
import { contributorKeyForOrganization } from './contributorKey';
import { hasActiveLearningConsent } from './learningConsentService';
import {
  activeEnrolmentBand,
  locationCountBand,
  seasonOrPeriod,
} from './privacyBands';

/** Customer-facing benchmarks remain disabled until roadmap gates are met. */
export const CUSTOMER_BENCHMARKS_ENABLED = false;

/** Minimum cohort size before any future customer-facing benchmark may display. */
export const BENCHMARK_COHORT_SUPPRESSION_MIN = Number(
  process.env.BENCHMARK_COHORT_SUPPRESSION_MIN || 8
);

const DEFAULT_METRICS: Array<{
  metricKey: string;
  definitionVersion: string;
  label: string;
  unit: string;
  formulaSummary: string;
  provenance: string;
}> = [
  {
    metricKey: 'utilization_proxy',
    definitionVersion: 'v1',
    label: 'Utilization Proxy',
    unit: 'ratio',
    formulaSummary: 'neededInstructorHours / scheduledHours (capped at 1)',
    provenance: 'staffingVersusDemand deterministic service',
  },
  {
    metricKey: 'trial_conversion',
    definitionVersion: 'v1',
    label: 'Trial / Lead Conversion',
    unit: 'ratio',
    formulaSummary: 'converted leads / leads (or trials fallback)',
    provenance: 'enrolmentMetrics deterministic service',
  },
  {
    metricKey: 'churn_rate',
    definitionVersion: 'v1',
    label: 'Monthly Churn Proxy',
    unit: 'ratio',
    formulaSummary: '(priorActive - activeNow + started) / priorActive',
    provenance: 'enrolmentMetrics deterministic service',
  },
  {
    metricKey: 'enrolment_velocity',
    definitionVersion: 'v1',
    label: 'Enrolment Velocity',
    unit: 'count',
    formulaSummary: 'engagements started this calendar month',
    provenance: 'enrolmentMetrics deterministic service',
  },
];

export async function ensureBenchmarkMetricDefinitions() {
  for (const m of DEFAULT_METRICS) {
    await prisma.benchmarkMetricDefinition.upsert({
      where: {
        metricKey_definitionVersion: {
          metricKey: m.metricKey,
          definitionVersion: m.definitionVersion,
        },
      },
      create: m,
      update: {
        label: m.label,
        unit: m.unit,
        formulaSummary: m.formulaSummary,
        provenance: m.provenance,
        enabled: true,
      },
    });
  }
}

/**
 * Capture opt-in privacy-safe benchmark snapshots from trusted deterministic metrics.
 * Does not expose values to other tenants. Customer dashboard remains disabled.
 */
export async function captureBenchmarkSnapshotsForOrg(
  organizationId: string
): Promise<{ created: number; reason?: string }> {
  if (!(await hasActiveLearningConsent(organizationId, BENCHMARK_SNAPSHOTS_PURPOSE_VERSION))) {
    return { created: 0, reason: 'NO_CONSENT' };
  }

  await ensureBenchmarkMetricDefinitions();

  const [org, enrolment, locations, staffing] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { educationSubtype: true },
    }),
    enrolmentMetrics(organizationId),
    prisma.location.count({ where: { organizationId } }),
    import('../metrics/analyticsService').then((m) =>
      m.staffingVersusDemand(organizationId)
    ),
  ]);

  const utilization =
    staffing.scheduledHours > 0
      ? Math.min(
          1,
          staffing.neededInstructorHours / Math.max(staffing.scheduledHours, 0.01)
        )
      : null;

  const values: Array<{ metricKey: string; value: number; quality: string }> = [];
  if (utilization != null) {
    values.push({
      metricKey: 'utilization_proxy',
      value: utilization,
      quality: 'ok',
    });
  }
  values.push({
    metricKey: 'trial_conversion',
    value: enrolment.conversionRate,
    quality: enrolment.trialCount > 0 || enrolment.conversionRate > 0 ? 'ok' : 'sparse',
  });
  values.push({
    metricKey: 'churn_rate',
    value: enrolment.churnRate,
    quality: enrolment.activeStudentsPriorMonth > 0 ? 'ok' : 'sparse',
  });
  values.push({
    metricKey: 'enrolment_velocity',
    value: enrolment.startedThisMonth,
    quality: 'ok',
  });

  const contributorKey = contributorKeyForOrganization(organizationId);
  const period = seasonOrPeriod();
  const snapshotDate = new Date();
  let created = 0;

  for (const v of values) {
    const def = await prisma.benchmarkMetricDefinition.findUnique({
      where: {
        metricKey_definitionVersion: {
          metricKey: v.metricKey,
          definitionVersion: 'v1',
        },
      },
    });
    if (!def || !def.enabled) continue;

    await prisma.anonymizedBenchmarkSnapshot.create({
      data: {
        schemaVersion: BENCHMARK_SNAPSHOT_SCHEMA_VERSION,
        purposeVersion: BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
        contributorKey,
        metricDefinitionId: def.id,
        metricKey: def.metricKey,
        definitionVersion: def.definitionVersion,
        value: v.value,
        educationSubtype: org.educationSubtype,
        activeLearnerBand: activeEnrolmentBand(enrolment.activeStudents),
        locationCountBand: locationCountBand(locations),
        geographyLevel: 'country_CA',
        reportingPeriod: period,
        dataQualityStatus: v.quality,
        snapshotDate,
      },
    });
    created += 1;
  }

  return { created };
}

/**
 * Cohort suppression gate for a future customer-facing API.
 * Always returns suppressed while CUSTOMER_BENCHMARKS_ENABLED is false.
 */
export function canExposeCustomerBenchmark(cohortSize: number): {
  allowed: boolean;
  reason: string;
} {
  if (!CUSTOMER_BENCHMARKS_ENABLED) {
    return {
      allowed: false,
      reason: 'Customer-facing benchmarks are disabled until beachhead expansion gates are met.',
    };
  }
  if (cohortSize < BENCHMARK_COHORT_SUPPRESSION_MIN) {
    return {
      allowed: false,
      reason: `Cohort size ${cohortSize} is below suppression minimum ${BENCHMARK_COHORT_SUPPRESSION_MIN}.`,
    };
  }
  return { allowed: true, reason: 'ok' };
}
