import {
  grantLearningConsent,
  withdrawLearningConsent,
  hasActiveLearningConsent,
} from './learningConsentService';
import {
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';

jest.mock('../../config/prisma', () => ({
  __esModule: true,
  default: {
    learningConsent: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
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
  },
}));

import prisma from '../../config/prisma';

describe('learning consent and withdrawal', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-salt';
  });

  it('reports inactive consent when withdrawn', async () => {
    (prisma.learningConsent.findUnique as jest.Mock).mockResolvedValue({
      withdrawnAt: new Date(),
    });
    expect(
      await hasActiveLearningConsent('orgA', OUTCOME_CORPUS_PURPOSE_VERSION_V2)
    ).toBe(false);
  });

  it('withdrawal deletes previously shared V2 rows via contributorKey', async () => {
    (prisma.learningConsent.upsert as jest.Mock).mockResolvedValue({
      organizationId: 'orgA',
      purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      withdrawnAt: new Date(),
    });
    (prisma.anonymizedOutcomeObservationV2.deleteMany as jest.Mock).mockResolvedValue({
      count: 2,
    });
    (prisma.decisionOutcome.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await withdrawLearningConsent({
      organizationId: 'orgA',
      purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
    });

    expect(prisma.anonymizedOutcomeObservationV2.deleteMany).toHaveBeenCalled();
    const where = (prisma.anonymizedOutcomeObservationV2.deleteMany as jest.Mock)
      .mock.calls[0][0].where;
    expect(where.purposeVersion).toBe(OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    expect(where.contributorKey).toEqual(expect.any(String));
    expect(where.contributorKey).not.toContain('orgA');
  });

  it('grant clears withdrawnAt', async () => {
    (prisma.learningConsent.upsert as jest.Mock).mockResolvedValue({
      withdrawnAt: null,
    });
    await grantLearningConsent({
      organizationId: 'orgA',
      purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      grantedByUserId: 'user1',
    });
    const update = (prisma.learningConsent.upsert as jest.Mock).mock.calls[0][0]
      .update;
    expect(update.withdrawnAt).toBeNull();
  });
});
