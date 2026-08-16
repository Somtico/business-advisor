import {
  grantLearningConsent,
  withdrawLearningConsent,
  hasActiveLearningConsent,
} from './learningConsentService';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import { deriveContributorKey } from './contributorKey';

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
    process.env.NODE_ENV = 'test';
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

  it('V2 withdrawal deletes only V2 rows for the purpose-specific contributor key', async () => {
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

    const expectedKey = deriveContributorKey(
      'orgA',
      OUTCOME_CORPUS_PURPOSE_VERSION_V2
    );
    const where = (prisma.anonymizedOutcomeObservationV2.deleteMany as jest.Mock)
      .mock.calls[0][0].where;
    expect(where.purposeVersion).toBe(OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    expect(where.contributorKey).toBe(expectedKey);
    expect(where.contributorKey).not.toContain('orgA');
    expect(prisma.anonymizedBenchmarkSnapshot.deleteMany).not.toHaveBeenCalled();
  });

  it('benchmark withdrawal deletes only benchmark rows for that purpose key', async () => {
    (prisma.learningConsent.upsert as jest.Mock).mockResolvedValue({
      organizationId: 'orgA',
      purposeVersion: BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
      withdrawnAt: new Date(),
    });
    (prisma.anonymizedBenchmarkSnapshot.deleteMany as jest.Mock).mockResolvedValue({
      count: 3,
    });

    await withdrawLearningConsent({
      organizationId: 'orgA',
      purposeVersion: BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
    });

    const expectedKey = deriveContributorKey(
      'orgA',
      BENCHMARK_SNAPSHOTS_PURPOSE_VERSION
    );
    const where = (prisma.anonymizedBenchmarkSnapshot.deleteMany as jest.Mock)
      .mock.calls[0][0].where;
    expect(where.purposeVersion).toBe(BENCHMARK_SNAPSHOTS_PURPOSE_VERSION);
    expect(where.contributorKey).toBe(expectedKey);
    expect(prisma.anonymizedOutcomeObservationV2.deleteMany).not.toHaveBeenCalled();
  });

  it('withdrawing one purpose does not use the other purpose contributor key', () => {
    const v2Key = deriveContributorKey('orgA', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    const benchKey = deriveContributorKey(
      'orgA',
      BENCHMARK_SNAPSHOTS_PURPOSE_VERSION
    );
    expect(v2Key).not.toBe(benchKey);
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
