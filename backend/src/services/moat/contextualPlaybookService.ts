import {
  DEFAULT_MIN_PEER_CONTEXT_SAMPLE,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import prisma from '../../config/prisma';

export type ContextualPeerQuery = {
  diagnosedLeak: string;
  interventionCategory?: string | null;
  educationSubtype?: string | null;
  spareCapacityState?: string | null;
  conversionHealth?: string | null;
  retentionHealth?: string | null;
  minSample?: number;
};

export type ContextualPeerResult = {
  peerEvidenceSufficient: boolean;
  minSample: number;
  comparableCount: number;
  helpedShare: number | null;
  noEffectShare: number | null;
  hurtShare: number | null;
  message: string;
  groups: Array<{
    interventionCategory: string;
    total: number;
    helped: number;
    noEffect: number;
    hurt: number;
    helpedShare: number;
  }>;
};

/**
 * Transparent contextual playbook ranking foundation.
 * Falls back clearly when the cohort is below the configured threshold.
 * Does not claim statistical confidence or fabricate percentages.
 */
export async function contextualPeerPatterns(
  query: ContextualPeerQuery
): Promise<ContextualPeerResult> {
  const minSample = query.minSample ?? DEFAULT_MIN_PEER_CONTEXT_SAMPLE;

  const rows = await prisma.anonymizedOutcomeObservationV2.findMany({
    where: {
      purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      diagnosedLeak: query.diagnosedLeak,
      ...(query.interventionCategory
        ? { interventionCategory: query.interventionCategory }
        : {}),
      ...(query.educationSubtype
        ? { educationSubtype: query.educationSubtype }
        : {}),
      ...(query.spareCapacityState
        ? { spareCapacityState: query.spareCapacityState }
        : {}),
      ...(query.conversionHealth
        ? { conversionHealth: query.conversionHealth }
        : {}),
      ...(query.retentionHealth
        ? { retentionHealth: query.retentionHealth }
        : {}),
    },
    select: {
      interventionCategory: true,
      outcome: true,
    },
  });

  const byIntervention = new Map<
    string,
    { total: number; helped: number; noEffect: number; hurt: number }
  >();

  for (const row of rows) {
    const key = row.interventionCategory || 'UNKNOWN';
    const stats = byIntervention.get(key) || {
      total: 0,
      helped: 0,
      noEffect: 0,
      hurt: 0,
    };
    stats.total += 1;
    if (row.outcome === 'HELPED') stats.helped += 1;
    if (row.outcome === 'NO_EFFECT') stats.noEffect += 1;
    if (row.outcome === 'HURT') stats.hurt += 1;
    byIntervention.set(key, stats);
  }

  const groups = [...byIntervention.entries()]
    .map(([interventionCategory, s]) => ({
      interventionCategory,
      total: s.total,
      helped: s.helped,
      noEffect: s.noEffect,
      hurt: s.hurt,
      helpedShare: s.total > 0 ? s.helped / s.total : 0,
    }))
    .filter((g) => g.total >= minSample)
    .sort((a, b) => b.helpedShare - a.helpedShare || b.total - a.total);

  const comparableCount = rows.length;
  const peerEvidenceSufficient = groups.length > 0;

  if (!peerEvidenceSufficient) {
    return {
      peerEvidenceSufficient: false,
      minSample,
      comparableCount,
      helpedShare: null,
      noEffectShare: null,
      hurtShare: null,
      message:
        comparableCount === 0
          ? 'No comparable privacy-safe peer observations yet. Use deterministic education playbooks.'
          : `Only ${comparableCount} comparable observation(s); need at least ${minSample} before peer evidence is shown. Use deterministic education playbooks.`,
      groups: [],
    };
  }

  const top = groups[0];
  return {
    peerEvidenceSufficient: true,
    minSample,
    comparableCount,
    helpedShare: top.helpedShare,
    noEffectShare: top.total > 0 ? top.noEffect / top.total : null,
    hurtShare: top.total > 0 ? top.hurt / top.total : null,
    message: `Peer evidence from ${top.total}+ comparable centres (contextual cohort).`,
    groups,
  };
}
