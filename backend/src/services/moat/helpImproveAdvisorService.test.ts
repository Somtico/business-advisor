import {
  disableHelpImproveAdvisor,
  dismissHelpImproveInvite,
  enableHelpImproveAdvisor,
  getHelpImproveAdvisorStatus,
  isHelpImproveAdvisorEnabled,
} from './helpImproveAdvisorService';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  HELP_IMPROVE_ADVISOR_SETTING_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '../../config/legal';
import { hasActiveLearningConsent } from './learningConsentService';

jest.mock('../../config/prisma', () => ({
  __esModule: true,
  default: {
    learningConsent: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    anonymizedOutcomeObservationV2: {
      deleteMany: jest.fn(),
    },
    anonymizedBenchmarkSnapshot: {
      deleteMany: jest.fn(),
    },
    decisionOutcome: {
      updateMany: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
  },
}));

jest.mock('./benchmarkSnapshotService', () => ({
  captureBenchmarkSnapshotsForOrg: jest.fn().mockResolvedValue([]),
}));

jest.mock('../auditService', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../../config/prisma';
import { writeAudit } from '../auditService';
import { captureBenchmarkSnapshotsForOrg } from './benchmarkSnapshotService';

describe('Help Improve Advisor single setting', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-salt';
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
      learningInviteSnoozedUntil: null,
    });
    (prisma.organization.update as jest.Mock).mockResolvedValue({});
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({});
    (writeAudit as jest.Mock).mockResolvedValue(undefined);
    (captureBenchmarkSnapshotsForOrg as jest.Mock).mockResolvedValue([]);
  });

  it('keeps legal versions and V1 purpose distinct from Help Improve', () => {
    expect(TERMS_VERSION).toBe('2026-08-16.2');
    expect(PRIVACY_VERSION).toBe('2026-08-16.2');
    expect(HELP_IMPROVE_ADVISOR_SETTING_VERSION).toBe('help_improve_advisor_v1');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).toBe('somtico_models_v1');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION_V2).toBe('somtico_models_v2');
  });

  it('defaults to OFF when no active V2 consent exists', async () => {
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await isHelpImproveAdvisorEnabled('org1')).toBe(false);
    const status = await getHelpImproveAdvisorStatus('org1', { canManage: true });
    expect(status.enabled).toBe(false);
    expect(status.invite.show).toBe(true);
  });

  it('does not treat prior V1 sharing as enabling Help Improve', async () => {
    // V1 has no LearningConsent row; Help Improve remains off.
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await isHelpImproveAdvisorEnabled('org1')).toBe(false);
  });

  it('enable grants both internal purposes and clears invite snooze', async () => {
    (prisma.learningConsent.upsert as jest.Mock).mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        withdrawnAt: null,
        grantedAt: new Date(),
        grantedByUserId: 'user1',
      })
    );
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue({
      withdrawnAt: null,
      grantedAt: new Date(),
      grantedByUserId: 'user1',
    });

    const status = await enableHelpImproveAdvisor({
      organizationId: 'org1',
      grantedByUserId: 'user1',
    });

    expect(prisma.learningConsent.upsert).toHaveBeenCalledTimes(2);
    const purposes = (prisma.learningConsent.upsert as jest.Mock).mock.calls.map(
      (c) => c[0].where.organizationId_purposeVersion.purposeVersion
    );
    expect(purposes).toEqual(
      expect.arrayContaining([
        OUTCOME_CORPUS_PURPOSE_VERSION_V2,
        BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
      ])
    );
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org1' },
      data: { learningInviteSnoozedUntil: null },
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.help_improve_enabled' })
    );
    expect(captureBenchmarkSnapshotsForOrg).toHaveBeenCalledWith('org1');
    expect(status.enabled).toBe(true);
    expect(status.invite.show).toBe(false);
  });

  it('disable withdraws both purposes and stops invitations when re-enabled path is off', async () => {
    (prisma.learningConsent.upsert as jest.Mock).mockResolvedValue({
      withdrawnAt: new Date(),
    });
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue({
      withdrawnAt: new Date(),
      grantedAt: new Date(),
      grantedByUserId: 'user1',
    });
    (prisma.anonymizedOutcomeObservationV2.deleteMany as jest.Mock).mockResolvedValue(
      { count: 1 }
    );
    (prisma.anonymizedBenchmarkSnapshot.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.decisionOutcome.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const status = await disableHelpImproveAdvisor({
      organizationId: 'org1',
      actorUserId: 'user1',
    });

    expect(prisma.learningConsent.upsert).toHaveBeenCalledTimes(2);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.help_improve_disabled' })
    );
    expect(status.enabled).toBe(false);
  });

  it('dismissing invite does not grant consent and snoozes ≥30 days', async () => {
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue(null);
    const before = Date.now();
    const status = await dismissHelpImproveInvite({
      organizationId: 'org1',
      actorUserId: 'user1',
    });
    expect(status.enabled).toBe(false);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'learning.help_improve_invite_dismissed',
        metadata: expect.objectContaining({ consentGranted: false }),
      })
    );
    const update = (prisma.organization.update as jest.Mock).mock.calls[0][0];
    const snooze: Date = update.data.learningInviteSnoozedUntil;
    expect(snooze.getTime()).toBeGreaterThanOrEqual(before + 29 * 24 * 60 * 60 * 1000);
  });

  it('hides invite while snoozed and when enabled', async () => {
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
      learningInviteSnoozedUntil: new Date(Date.now() + 86400000),
    });
    const snoozed = await getHelpImproveAdvisorStatus('org1', { canManage: true });
    expect(snoozed.invite.show).toBe(false);

    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue({
      withdrawnAt: null,
      grantedAt: new Date(),
      grantedByUserId: 'user1',
    });
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
      learningInviteSnoozedUntil: null,
    });
    const on = await getHelpImproveAdvisorStatus('org1', { canManage: true });
    expect(on.enabled).toBe(true);
    expect(on.invite.show).toBe(false);
  });

  it('does not show invite to non-managers', async () => {
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue(null);
    const status = await getHelpImproveAdvisorStatus('org1', { canManage: false });
    expect(status.invite.show).toBe(false);
  });

  it('legal acceptance alone does not create learning consent', async () => {
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await hasActiveLearningConsent('org1', OUTCOME_CORPUS_PURPOSE_VERSION_V2)).toBe(
      false
    );
    expect(await isHelpImproveAdvisorEnabled('org1')).toBe(false);
  });
});
