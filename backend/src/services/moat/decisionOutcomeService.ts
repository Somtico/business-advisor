import {
  ImpactType,
  LearningEligibility,
  LifecycleOutcome,
  OutcomeVerificationType,
  OwnerDecision,
  Prisma,
  RecommendationSource,
  RecommendationStatus,
} from '@prisma/client';
import {
  DECISION_CONTEXT_SCHEMA_VERSION,
  DECISION_OUTCOME_SCHEMA_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import prisma from '../../config/prisma';
import {
  captureDecisionContext,
  contextAsJson,
} from './decisionContextService';
import { maybeShareDecisionOutcomeV2 } from './outcomeObservationV2Service';

export function mapStatusToOwnerDecision(
  status: RecommendationStatus
): OwnerDecision {
  switch (status) {
    case 'ACCEPTED':
    case 'IN_PROGRESS':
    case 'COMPLETED':
      return 'ACCEPTED';
    case 'REJECTED':
    case 'DISMISSED':
      return 'REJECTED';
    case 'OPEN':
      return 'NOT_ACTED';
    default:
      return 'UNKNOWN';
  }
}

export function inferDiagnosisCode(input: {
  title?: string;
  metricKeys?: string[];
  source?: RecommendationSource;
}): string {
  const keys = input.metricKeys ?? [];
  if (keys.includes('staffing_vs_demand')) return 'STAFFING_OVERSUPPLY';
  if (keys.includes('subscriptions')) return 'SUBSCRIPTION_AUDIT';
  if (keys.includes('pricing')) return 'PRICING_GAP';
  if (keys.includes('enrolment')) return 'ENROLMENT_LEAK';
  const title = (input.title || '').toLowerCase();
  if (title.includes('staff')) return 'STAFFING_OVERSUPPLY';
  if (title.includes('price') || title.includes('pricing')) return 'PRICING_GAP';
  if (title.includes('enrol') || title.includes('trial') || title.includes('conversion')) {
    return 'ENROLMENT_LEAK';
  }
  if (title.includes('subscription') || title.includes('software')) {
    return 'SUBSCRIPTION_AUDIT';
  }
  if (title.includes('cash') || title.includes('runway')) return 'CASH_PRESSURE';
  if (input.source === 'ADVISOR_CHAT') return 'ADVISOR_CHAT';
  return 'GENERAL';
}

export function inferInterventionCode(input: {
  title?: string;
  diagnosisCode?: string;
}): string {
  const title = (input.title || '').toLowerCase();
  if (title.includes('trim') || title.includes('consolidat')) return 'TRIM_LABOUR';
  if (title.includes('price') || title.includes('pricing')) return 'PRICE_TEST_OR_ADJUST';
  if (title.includes('subscription') || title.includes('cancel') || title.includes('audit')) {
    return 'REVIEW_TOOL_SPEND';
  }
  if (title.includes('follow') || title.includes('trial')) return 'TRIAL_FOLLOWUP';
  if (title.includes('referr')) return 'FAMILY_REFERRAL';
  switch (input.diagnosisCode) {
    case 'STAFFING_OVERSUPPLY':
      return 'TRIM_LABOUR';
    case 'PRICING_GAP':
      return 'PRICE_TEST_OR_ADJUST';
    case 'SUBSCRIPTION_AUDIT':
      return 'REVIEW_TOOL_SPEND';
    case 'ENROLMENT_LEAK':
      return 'ENROLMENT_TACTIC';
    default:
      return 'OWNER_REVIEW';
  }
}

export async function attachDecisionOutcomeForRecommendation(params: {
  organizationId: string;
  recommendationId: string;
  title: string;
  metricKeys?: string[];
  source: RecommendationSource;
  status: RecommendationStatus;
  expectedImpactCents?: number | null;
  impactType?: ImpactType | null;
  captureContext?: boolean;
}) {
  const diagnosisCode = inferDiagnosisCode({
    title: params.title,
    metricKeys: params.metricKeys,
    source: params.source,
  });
  const interventionCode = inferInterventionCode({
    title: params.title,
    diagnosisCode,
  });

  let contextAvailable = false;
  let contextJson: Prisma.InputJsonValue | undefined;
  let contextCapturedAt: Date | undefined;
  let dataFreshness: string | undefined;

  if (params.captureContext !== false) {
    try {
      const ctx = await captureDecisionContext(params.organizationId, {
        diagnosisCode,
      });
      contextAvailable = true;
      contextJson = contextAsJson(ctx);
      contextCapturedAt = new Date(ctx.capturedAt);
      dataFreshness = ctx.dataFreshness;
    } catch (err) {
      console.error('attachDecisionOutcome: context capture failed', err);
    }
  }

  const ownerDecision = mapStatusToOwnerDecision(params.status);

  return prisma.decisionOutcome.create({
    data: {
      organizationId: params.organizationId,
      recommendationId: params.recommendationId,
      schemaVersion: DECISION_OUTCOME_SCHEMA_VERSION,
      diagnosisCode,
      interventionCode,
      contextAvailable,
      contextSchemaVersion: contextAvailable
        ? DECISION_CONTEXT_SCHEMA_VERSION
        : null,
      contextCapturedAt: contextCapturedAt ?? null,
      contextJson: contextJson ?? undefined,
      dataFreshness: dataFreshness ?? null,
      estimatedImpactCents: params.expectedImpactCents ?? null,
      estimatedImpactType: params.impactType ?? null,
      expectedOutcomeHorizonDays: 30,
      ownerDecision,
      decisionAt: ownerDecision === 'NOT_ACTED' || ownerDecision === 'UNKNOWN'
        ? null
        : new Date(),
      lifecycleOutcome: 'PENDING',
      outcomeVerificationType: 'NONE',
      learningEligibility: 'INELIGIBLE',
      learningPurposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      implementationVersion: process.env.npm_package_version || '1.0.0',
      routerVersion: 'claude_first_v1',
    },
  });
}

export async function getDecisionOutcomeForOrg(
  organizationId: string,
  recommendationId: string
) {
  return prisma.decisionOutcome.findFirst({
    where: { organizationId, recommendationId },
  });
}

export async function syncDecisionFromRecommendationStatus(params: {
  organizationId: string;
  recommendationId: string;
  status: RecommendationStatus;
}) {
  const existing = await prisma.decisionOutcome.findFirst({
    where: {
      organizationId: params.organizationId,
      recommendationId: params.recommendationId,
    },
  });
  if (!existing) return null;

  const ownerDecision = mapStatusToOwnerDecision(params.status);
  return prisma.decisionOutcome.update({
    where: { id: existing.id },
    data: {
      ownerDecision,
      decisionAt: new Date(),
    },
  });
}

export async function recordLifecycleOutcome(params: {
  organizationId: string;
  recommendationId: string;
  lifecycleOutcome: LifecycleOutcome;
  outcomeVerificationType: OutcomeVerificationType;
  realizedImpactCents?: number | null;
}) {
  const existing = await prisma.decisionOutcome.findFirst({
    where: {
      organizationId: params.organizationId,
      recommendationId: params.recommendationId,
    },
  });
  if (!existing) return null;

  // Never silently copy estimates into realized — caller must pass realized explicitly.
  const updated = await prisma.decisionOutcome.update({
    where: { id: existing.id },
    data: {
      lifecycleOutcome: params.lifecycleOutcome,
      outcomeAt: new Date(),
      outcomeVerificationType: params.outcomeVerificationType,
      realizedImpactCents:
        params.realizedImpactCents !== undefined
          ? params.realizedImpactCents
          : existing.realizedImpactCents,
      learningEligibility:
        params.lifecycleOutcome === 'PENDING' ||
        params.lifecycleOutcome === 'UNKNOWN'
          ? 'INELIGIBLE'
          : 'ELIGIBLE_PENDING_CONSENT',
    },
  });

  if (
    updated.lifecycleOutcome === 'HELPED' ||
    updated.lifecycleOutcome === 'NO_EFFECT' ||
    updated.lifecycleOutcome === 'HURT'
  ) {
    await maybeShareDecisionOutcomeV2(updated.id);
  }

  return updated;
}

export function inferLifecycleFromRealizedImpact(
  realizedImpactCents: number,
  explicit?: LifecycleOutcome | null
): LifecycleOutcome {
  if (explicit && explicit !== 'PENDING') return explicit;
  if (realizedImpactCents === 0) return 'NO_EFFECT';
  if (realizedImpactCents > 0) return 'HELPED';
  return 'UNKNOWN';
}
