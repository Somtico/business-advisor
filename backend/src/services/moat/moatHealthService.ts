import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import prisma from '../../config/prisma';
import { impactSummary } from '../impactService';
import { runSyntheticEvaluation } from './evaluationHarness';

/**
 * Internal moat health metrics. No PlatformAdmin UI — callable from scripts/tests.
 * Aggregates must not leak tenant PII.
 */
export async function computeMoatHealthMetrics() {
  const [
    decisionTotal,
    measured,
    userConfirmed,
    noEffect,
    hurt,
    pending,
    withContext,
    consentedV2,
    consentedBenchmark,
    mappingKnowledge,
    mappingApproved,
    mappingCorrections,
    mappingUses,
    v2Observations,
    benchmarkSnapshots,
    orgs,
  ] = await Promise.all([
    prisma.decisionOutcome.count(),
    prisma.decisionOutcome.count({
      where: { outcomeVerificationType: 'MEASURED' },
    }),
    prisma.decisionOutcome.count({
      where: { outcomeVerificationType: 'USER_CONFIRMED' },
    }),
    prisma.decisionOutcome.count({ where: { lifecycleOutcome: 'NO_EFFECT' } }),
    prisma.decisionOutcome.count({ where: { lifecycleOutcome: 'HURT' } }),
    prisma.decisionOutcome.count({ where: { lifecycleOutcome: 'PENDING' } }),
    prisma.decisionOutcome.count({ where: { contextAvailable: true } }),
    prisma.learningConsent.count({
      where: {
        purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
        withdrawnAt: null,
      },
    }),
    prisma.learningConsent.count({
      where: {
        purposeVersion: BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
        withdrawnAt: null,
      },
    }),
    prisma.sourceMappingKnowledge.count(),
    prisma.sourceMappingKnowledge.count({ where: { reviewStatus: 'APPROVED' } }),
    prisma.sourceMappingKnowledge.aggregate({ _sum: { correctionCount: true } }),
    prisma.sourceMappingKnowledge.aggregate({ _sum: { successfulUses: true } }),
    prisma.anonymizedOutcomeObservationV2.count(),
    prisma.anonymizedBenchmarkSnapshot.count(),
    prisma.organization.count(),
  ]);

  const recommendations = await prisma.recommendation.count();
  const lifecycleCoverage =
    recommendations > 0 ? decisionTotal / recommendations : 0;
  const contextCoverage =
    decisionTotal > 0 ? withContext / decisionTotal : 0;

  const uses = mappingUses._sum.successfulUses || 0;
  const corrections = mappingCorrections._sum.correctionCount || 0;
  const mappingDenom = uses + corrections;
  const mappingAcceptanceRate = mappingDenom > 0 ? uses / mappingDenom : null;
  const mappingCorrectionRate =
    mappingDenom > 0 ? corrections / mappingDenom : null;

  const outcomesByDiagnosis = await prisma.decisionOutcome.groupBy({
    by: ['diagnosisCode', 'lifecycleOutcome'],
    _count: { _all: true },
  });

  // Verified ROI rollup across orgs without exposing org ids in the summary
  let verifiedRoiCents = 0;
  const orgIds = await prisma.organization.findMany({
    select: { id: true },
    take: 500,
  });
  for (const o of orgIds) {
    const summary = await impactSummary(o.id);
    verifiedRoiCents += summary.verified.totalCents || 0;
  }

  const evaluation = runSyntheticEvaluation();

  const telemetry = await prisma.onboardingTelemetry.aggregate({
    _avg: { mappingSteps: true },
    _count: { _all: true },
  });

  return {
    decisionOutcomeRecords: decisionTotal,
    outcomes: {
      measured,
      userConfirmed,
      noEffect,
      hurt,
      pending,
    },
    lifecycleCoverage,
    contextSnapshotCoverage: contextCoverage,
    recommendationsGroundedInDeterministicTools: lifecycleCoverage,
    outcomesByDiagnosisPlaybook: outcomesByDiagnosis.map((r) => ({
      diagnosisCode: r.diagnosisCode,
      lifecycleOutcome: r.lifecycleOutcome,
      count: r._count._all,
    })),
    optedInOrganizationsV2: consentedV2,
    benchmarkReadyOrganizations: consentedBenchmark,
    anonymizedV2Observations: v2Observations,
    benchmarkSnapshots,
    benchmarkMetricDefinitions: await prisma.benchmarkMetricDefinition.count(),
    sourceMapping: {
      knowledgeRows: mappingKnowledge,
      approvedRows: mappingApproved,
      reuseSuccessfulUses: uses,
      correctionCount: corrections,
      proposalAcceptanceRate: mappingAcceptanceRate,
      correctionRate: mappingCorrectionRate,
    },
    medianManualMappingSteps: telemetry._avg.mappingSteps,
    onboardingTelemetryRows: telemetry._count._all,
    organizationCount: orgs,
    verifiedRoiCents,
    chukVersusGenericEvaluation: {
      somticoOverall: evaluation.somtico.overall,
      genericOverall: evaluation.generic.overall,
      somticoBeatsGeneric: evaluation.somticoBeatsGeneric,
      provider: evaluation.provider,
      model: evaluation.model,
    },
    // Forecast error trend placeholder until forecast error ledger is denser
    forecastErrorTrend: null as null,
  };
}
