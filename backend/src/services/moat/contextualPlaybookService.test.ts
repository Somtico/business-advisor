import { contextualPeerPatterns } from './contextualPlaybookService';

jest.mock('../../config/prisma', () => ({
  __esModule: true,
  default: {
    anonymizedOutcomeObservationV2: {
      findMany: jest.fn(),
    },
  },
}));

import prisma from '../../config/prisma';

describe('contextualPeerPatterns', () => {
  const findMany = prisma.anonymizedOutcomeObservationV2.findMany as jest.Mock;

  beforeEach(() => {
    findMany.mockReset();
  });

  it('refuses peer evidence below the configured cohort threshold', async () => {
    findMany.mockResolvedValue([
      { interventionCategory: 'TRIAL_FOLLOWUP', outcome: 'HELPED' },
      { interventionCategory: 'TRIAL_FOLLOWUP', outcome: 'HELPED' },
      { interventionCategory: 'TRIAL_FOLLOWUP', outcome: 'NO_EFFECT' },
    ]);

    const result = await contextualPeerPatterns({
      diagnosedLeak: 'CONVERSION_LEAK',
      minSample: 8,
    });

    expect(result.peerEvidenceSufficient).toBe(false);
    expect(result.helpedShare).toBeNull();
    expect(result.message).toMatch(/need at least 8/i);
    expect(result.groups).toEqual([]);
  });

  it('ranks interventions when cohort meets threshold', async () => {
    findMany.mockResolvedValue([
      ...Array.from({ length: 8 }, () => ({
        interventionCategory: 'TRIAL_FOLLOWUP',
        outcome: 'HELPED' as const,
      })),
      ...Array.from({ length: 8 }, () => ({
        interventionCategory: 'PAID_ADS',
        outcome: 'NO_EFFECT' as const,
      })),
    ]);

    const result = await contextualPeerPatterns({
      diagnosedLeak: 'CONVERSION_LEAK',
      minSample: 8,
    });

    expect(result.peerEvidenceSufficient).toBe(true);
    expect(result.groups[0].interventionCategory).toBe('TRIAL_FOLLOWUP');
    expect(result.groups[0].helpedShare).toBe(1);
  });
});
