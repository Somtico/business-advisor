import prisma from '../config/prisma';
import { impactSummary } from './impactService';
import { enrolmentGuidance, TACTIC_CATALOG } from './enrolmentService';

const MEMORY_DAYS = 90;

function tacticLabel(key: string, otherLabel: string | null): string {
  if (key === 'OTHER' && otherLabel) return otherLabel;
  return TACTIC_CATALOG.find((t) => t.key === key)?.label || key;
}

/**
 * This centre's last 90 days: actions, verified impact, and enrolment tactics.
 * Sent to Chuk so answers remember what already happened here.
 * No wage rates, household names, or formula internals.
 */
export async function organizationMemory(organizationId: string) {
  const since = new Date(Date.now() - MEMORY_DAYS * 86_400_000);
  const [actions, tactics, impact] = await Promise.all([
    prisma.recommendation.findMany({
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        title: true,
        status: true,
        impactType: true,
        source: true,
        expectedImpactCents: true,
        realizedImpactCents: true,
        realizedSource: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.enrolmentTacticTried.findMany({
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        tacticKey: true,
        otherLabel: true,
        outcome: true,
        costBand: true,
        leakTypeAtReport: true,
        resultSummary: true,
        createdAt: true,
      },
    }),
    impactSummary(organizationId),
  ]);

  return {
    windowDays: MEMORY_DAYS,
    verifiedImpactCents: impact.verified.totalCents,
    awaitingConfirmationCount: impact.awaitingConfirmationCount,
    pipelineCount: impact.pipelineCount,
    actions: actions.map((a) => ({
      title: a.title,
      status: a.status,
      impactType: a.impactType,
      source: a.source,
      expectedImpactCents: a.expectedImpactCents,
      realizedImpactCents: a.realizedImpactCents,
      realizedSource: a.realizedSource,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    tacticsTried: tactics.map((t) => ({
      label: tacticLabel(t.tacticKey, t.otherLabel),
      tacticKey: t.tacticKey,
      outcome: t.outcome,
      costBand: t.costBand,
      leakType: t.leakTypeAtReport,
      resultSummary: t.resultSummary,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * Monday operating loop for Command Centre and the weekly brief.
 * Verdicts stay deterministic (enrolment leak, playbook counts, open actions).
 */
export async function operatingLoop(organizationId: string) {
  const [guidance, impact, openActions] = await Promise.all([
    enrolmentGuidance(organizationId),
    impactSummary(organizationId),
    prisma.recommendation.findMany({
      where: { organizationId, status: { in: ['OPEN', 'ACCEPTED', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        expectedImpactCents: true,
        impactType: true,
      },
    }),
  ]);

  const lastTactic = guidance.tacticsTried[0]
    ? {
        label: tacticLabel(
          guidance.tacticsTried[0].tacticKey,
          guidance.tacticsTried[0].otherLabel
        ),
        outcome: guidance.tacticsTried[0].outcome,
        createdAt: guidance.tacticsTried[0].createdAt.toISOString(),
      }
    : null;

  return {
    leak: guidance.leak,
    leakLabel: guidance.leakLabel,
    focus: guidance.note,
    cheapNextStep: guidance.cheapNextSteps[0] ?? null,
    lastTactic,
    tacticsTriedCount: guidance.tacticsTried.length,
    askTriedAndResults: guidance.askTriedAndResults,
    peerPlaybook: guidance.peerPatterns.slice(0, 3),
    openActions,
    awaitingConfirmationCount: impact.awaitingConfirmationCount,
    verifiedImpactCents: impact.verified.totalCents,
    paidTestEligible: guidance.paidTest.eligible,
    weeklySpendCapCents: guidance.paidTest.weeklySpendCapCents ?? null,
    weeklyBriefNote:
      'The Monday brief emails this same loop: the named leak, open actions, and verified impact.',
  };
}
