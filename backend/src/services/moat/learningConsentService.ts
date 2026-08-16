import prisma from '../../config/prisma';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import { contributorKeyForOrganization } from './contributorKey';

export async function getLearningConsent(
  organizationId: string,
  purposeVersion: string
) {
  return prisma.learningConsent.findUnique({
    where: {
      organizationId_purposeVersion: { organizationId, purposeVersion },
    },
  });
}

export async function hasActiveLearningConsent(
  organizationId: string,
  purposeVersion: string
): Promise<boolean> {
  const row = await getLearningConsent(organizationId, purposeVersion);
  return Boolean(row && !row.withdrawnAt);
}

export async function grantLearningConsent(params: {
  organizationId: string;
  purposeVersion: string;
  grantedByUserId?: string | null;
  notes?: string | null;
}) {
  return prisma.learningConsent.upsert({
    where: {
      organizationId_purposeVersion: {
        organizationId: params.organizationId,
        purposeVersion: params.purposeVersion,
      },
    },
    create: {
      organizationId: params.organizationId,
      purposeVersion: params.purposeVersion,
      grantedByUserId: params.grantedByUserId ?? null,
      notes: params.notes ?? null,
      grantedAt: new Date(),
      withdrawnAt: null,
    },
    update: {
      grantedByUserId: params.grantedByUserId ?? null,
      notes: params.notes ?? null,
      grantedAt: new Date(),
      withdrawnAt: null,
    },
  });
}

/**
 * Withdrawal stops future sharing.
 * Previously shared V2 / benchmark rows are deleted via contributorKey
 * (HMAC of orgId) so we never store organizationId on anonymized tables.
 * somtico_models_v1 anonymized_tactic_outcomes remain (no contributorKey;
 * already irreversible aggregates without org linkage — documented behaviour).
 */
export async function withdrawLearningConsent(params: {
  organizationId: string;
  purposeVersion: string;
}) {
  const consent = await prisma.learningConsent.upsert({
    where: {
      organizationId_purposeVersion: {
        organizationId: params.organizationId,
        purposeVersion: params.purposeVersion,
      },
    },
    create: {
      organizationId: params.organizationId,
      purposeVersion: params.purposeVersion,
      grantedAt: new Date(),
      withdrawnAt: new Date(),
    },
    update: {
      withdrawnAt: new Date(),
    },
  });

  const key = contributorKeyForOrganization(params.organizationId);

  if (params.purposeVersion === OUTCOME_CORPUS_PURPOSE_VERSION_V2) {
    await prisma.anonymizedOutcomeObservationV2.deleteMany({
      where: { contributorKey: key, purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2 },
    });
    await prisma.decisionOutcome.updateMany({
      where: {
        organizationId: params.organizationId,
        learningEligibility: 'SHARED',
        learningPurposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      },
      data: { learningEligibility: 'WITHDRAWN_BLOCKED', anonymizedObservationId: null },
    });
  }

  if (params.purposeVersion === BENCHMARK_SNAPSHOTS_PURPOSE_VERSION) {
    await prisma.anonymizedBenchmarkSnapshot.deleteMany({
      where: {
        contributorKey: key,
        purposeVersion: BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
      },
    });
  }

  // v1: no org-linked cleanup possible by design of anonymized_tactic_outcomes.
  void OUTCOME_CORPUS_PURPOSE_VERSION;

  return consent;
}

export async function listLearningConsents(organizationId: string) {
  return prisma.learningConsent.findMany({
    where: { organizationId },
    orderBy: { purposeVersion: 'asc' },
  });
}
