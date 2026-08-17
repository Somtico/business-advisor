import prisma from '../../config/prisma';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES,
  HELP_IMPROVE_ADVISOR_SETTING_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import { writeAudit } from '../auditService';
import { captureBenchmarkSnapshotsForOrg } from './benchmarkSnapshotService';
import {
  getLearningConsent,
  grantLearningConsent,
  hasActiveLearningConsent,
  withdrawLearningConsent,
} from './learningConsentService';

const INVITE_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export type HelpImproveAdvisorStatus = {
  enabled: boolean;
  settingVersion: string;
  internalPurposes: readonly string[];
  grantedAt: string | null;
  grantedByUserId: string | null;
  /** Soft invite for OFF orgs; never shown when enabled. */
  invite: {
    show: boolean;
    snoozedUntil: string | null;
  };
};

/**
 * Customer-facing Help Improve Advisor is ON when the primary learning
 * purpose (V2) is actively consented. Enabling also grants benchmark consent.
 */
export async function isHelpImproveAdvisorEnabled(
  organizationId: string
): Promise<boolean> {
  return hasActiveLearningConsent(
    organizationId,
    OUTCOME_CORPUS_PURPOSE_VERSION_V2
  );
}

export async function getHelpImproveAdvisorStatus(
  organizationId: string,
  opts?: { canManage?: boolean }
): Promise<HelpImproveAdvisorStatus> {
  const [v2, org] = await Promise.all([
    getLearningConsent(organizationId, OUTCOME_CORPUS_PURPOSE_VERSION_V2),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { learningInviteSnoozedUntil: true },
    }),
  ]);

  const enabled = Boolean(v2 && !v2.withdrawnAt);
  const snoozedUntil = org?.learningInviteSnoozedUntil ?? null;
  const now = Date.now();
  const snoozeActive = snoozedUntil != null && snoozedUntil.getTime() > now;
  const showInvite =
    Boolean(opts?.canManage) && !enabled && !snoozeActive;

  return {
    enabled,
    settingVersion: HELP_IMPROVE_ADVISOR_SETTING_VERSION,
    internalPurposes: HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES,
    grantedAt: enabled && v2 ? v2.grantedAt.toISOString() : null,
    grantedByUserId: enabled && v2 ? v2.grantedByUserId : null,
    invite: {
      show: showInvite,
      snoozedUntil: snoozedUntil ? snoozedUntil.toISOString() : null,
    },
  };
}

export async function enableHelpImproveAdvisor(params: {
  organizationId: string;
  grantedByUserId: string;
}) {
  const notes = `Help Improve Advisor (${HELP_IMPROVE_ADVISOR_SETTING_VERSION})`;
  const grants = [];
  for (const purposeVersion of HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES) {
    grants.push(
      await grantLearningConsent({
        organizationId: params.organizationId,
        purposeVersion,
        grantedByUserId: params.grantedByUserId,
        notes,
      })
    );
  }

  await prisma.organization.update({
    where: { id: params.organizationId },
    data: { learningInviteSnoozedUntil: null },
  });

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.grantedByUserId,
    action: 'learning.help_improve_enabled',
    resourceType: 'LearningConsent',
    resourceId: params.organizationId,
    metadata: {
      settingVersion: HELP_IMPROVE_ADVISOR_SETTING_VERSION,
      internalPurposes: [...HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES],
      grantedAt: new Date().toISOString(),
    },
  });

  await captureBenchmarkSnapshotsForOrg(params.organizationId).catch((err) =>
    console.error('benchmark snapshot after Help Improve enable failed', err)
  );

  return getHelpImproveAdvisorStatus(params.organizationId, { canManage: true });
}

export async function disableHelpImproveAdvisor(params: {
  organizationId: string;
  actorUserId: string;
}) {
  for (const purposeVersion of HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES) {
    await withdrawLearningConsent({
      organizationId: params.organizationId,
      purposeVersion,
    });
  }

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: 'learning.help_improve_disabled',
    resourceType: 'LearningConsent',
    resourceId: params.organizationId,
    metadata: {
      settingVersion: HELP_IMPROVE_ADVISOR_SETTING_VERSION,
      internalPurposes: [...HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES],
      withdrawnAt: new Date().toISOString(),
    },
  });

  return getHelpImproveAdvisorStatus(params.organizationId, { canManage: true });
}

/**
 * "Not now" — leaves consent OFF and suppresses the invite for ≥30 days.
 * Does not grant consent.
 */
export async function dismissHelpImproveInvite(params: {
  organizationId: string;
  actorUserId: string;
}) {
  const snoozedUntil = new Date(Date.now() + INVITE_SNOOZE_MS);
  await prisma.organization.update({
    where: { id: params.organizationId },
    data: { learningInviteSnoozedUntil: snoozedUntil },
  });

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: 'learning.help_improve_invite_dismissed',
    resourceType: 'Organization',
    resourceId: params.organizationId,
    metadata: {
      settingVersion: HELP_IMPROVE_ADVISOR_SETTING_VERSION,
      snoozedUntil: snoozedUntil.toISOString(),
      consentGranted: false,
    },
  });

  return getHelpImproveAdvisorStatus(params.organizationId, { canManage: true });
}

/** Convenience: both V2 learning and benchmarks are active under Help Improve. */
export async function hasActiveBenchmarkConsent(
  organizationId: string
): Promise<boolean> {
  return hasActiveLearningConsent(
    organizationId,
    BENCHMARK_SNAPSHOTS_PURPOSE_VERSION
  );
}
