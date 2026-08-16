import type { DecisionOutcome, LifecycleOutcome } from '@prisma/client';
import {
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
  OUTCOME_OBSERVATION_V2_SCHEMA_VERSION,
} from '../../config/legal';
import prisma from '../../config/prisma';
import { contributorKeyForOrganization } from './contributorKey';
import { hasActiveLearningConsent } from './learningConsentService';
import type { DecisionContextV1 } from './decisionContextService';
import {
  activeEnrolmentBand,
  cashSafetyBand,
  conversionHealth,
  effortOrCostBand,
  locationCountBand,
  retentionHealth,
  spareCapacityState,
  utilizationBand,
} from './privacyBands';

const PROHIBITED_KEYS = [
  'organizationId',
  'organizationName',
  'email',
  'phone',
  'address',
  'student',
  'guardian',
  'employee',
  'conversation',
  'resultSummary',
  'notes',
  'freeText',
] as const;

export function assertNoProhibitedFields(record: Record<string, unknown>): void {
  const flat = JSON.stringify(record).toLowerCase();
  for (const key of PROHIBITED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`PROHIBITED_FIELD:${key}`);
    }
  }
  // Soft check: org cuid-like ids should not appear as values we intentionally set
  if (typeof record.organizationId !== 'undefined') {
    throw new Error('PROHIBITED_FIELD:organizationId');
  }
  void flat;
}

/**
 * Create a privacy-safe V2 observation from a tenant-private DecisionOutcome.
 * Requires active learning consent for somtico_models_v2.
 * Does NOT copy private context verbatim — only coarse bands.
 */
export async function maybeShareDecisionOutcomeV2(
  decisionOutcomeId: string
): Promise<{ shared: boolean; reason?: string; observationId?: string }> {
  const decision = await prisma.decisionOutcome.findUnique({
    where: { id: decisionOutcomeId },
  });
  if (!decision) return { shared: false, reason: 'NOT_FOUND' };

  if (
    decision.lifecycleOutcome !== 'HELPED' &&
    decision.lifecycleOutcome !== 'NO_EFFECT' &&
    decision.lifecycleOutcome !== 'HURT'
  ) {
    return { shared: false, reason: 'OUTCOME_NOT_FINAL' };
  }

  const consented = await hasActiveLearningConsent(
    decision.organizationId,
    OUTCOME_CORPUS_PURPOSE_VERSION_V2
  );
  if (!consented) {
    await prisma.decisionOutcome.update({
      where: { id: decision.id },
      data: { learningEligibility: 'ELIGIBLE_PENDING_CONSENT' },
    });
    return { shared: false, reason: 'NO_CONSENT' };
  }

  if (decision.anonymizedObservationId) {
    return {
      shared: true,
      reason: 'ALREADY_SHARED',
      observationId: decision.anonymizedObservationId,
    };
  }

  const payload = buildV2Payload(decision);
  assertNoProhibitedFields(payload as unknown as Record<string, unknown>);

  const observation = await prisma.anonymizedOutcomeObservationV2.create({
    data: payload,
  });

  await prisma.decisionOutcome.update({
    where: { id: decision.id },
    data: {
      learningEligibility: 'SHARED',
      learningPurposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      anonymizedObservationId: observation.id,
    },
  });

  return { shared: true, observationId: observation.id };
}

export function buildV2Payload(decision: DecisionOutcome) {
  const ctx = (decision.contextJson || {}) as Partial<DecisionContextV1>;
  const contributorKey = contributorKeyForOrganization(decision.organizationId);

  return {
    schemaVersion: OUTCOME_OBSERVATION_V2_SCHEMA_VERSION,
    purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
    contributorKey,
    educationSubtype: ctx.educationSubtype ?? null,
    programmeCategory: ctx.programmeCategory ?? null,
    activeEnrolmentBand: activeEnrolmentBand(ctx.activeLearnerCount ?? 0),
    locationCountBand: locationCountBand(ctx.locationCount ?? 0),
    utilizationBand: utilizationBand(ctx.utilization),
    conversionHealth: conversionHealth(ctx.trialConversion),
    retentionHealth: retentionHealth(ctx.churnRate),
    spareCapacityState: spareCapacityState({
      utilization: ctx.utilization,
      spareSeats: ctx.spareCapacity,
    }),
    cashSafetyBand: cashSafetyBand({
      runwayWeeks: ctx.cashRunwayWeeks,
      cashBalanceCents: ctx.cashBalanceCents,
    }),
    seasonOrPeriod: ctx.seasonOrPeriod ?? null,
    diagnosedLeak: decision.diagnosisCode ?? ctx.diagnosedLeak ?? null,
    interventionCategory: decision.interventionCode ?? null,
    effortOrCostBand: effortOrCostBand(null),
    outcome: decision.lifecycleOutcome as LifecycleOutcome,
    outcomeHorizonDays: decision.expectedOutcomeHorizonDays ?? null,
    verificationType: decision.outcomeVerificationType,
  };
}
