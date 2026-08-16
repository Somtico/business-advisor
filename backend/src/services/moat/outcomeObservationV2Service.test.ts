import { maybeShareDecisionOutcomeV2 } from './outcomeObservationV2Service';

jest.mock('../../config/prisma', () => ({
  __esModule: true,
  default: {
    decisionOutcome: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    anonymizedOutcomeObservationV2: {
      create: jest.fn(),
    },
  },
}));

jest.mock('./learningConsentService', () => ({
  hasActiveLearningConsent: jest.fn(),
}));

import prisma from '../../config/prisma';
import { hasActiveLearningConsent } from './learningConsentService';

describe('maybeShareDecisionOutcomeV2', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-salt';
  });

  it('does not create a V2 row without opt-in consent', async () => {
    (prisma.decisionOutcome.findUnique as jest.Mock).mockResolvedValue({
      id: 'd1',
      organizationId: 'orgA',
      lifecycleOutcome: 'HELPED',
      anonymizedObservationId: null,
      contextJson: { activeLearnerCount: 10, locationCount: 1 },
      diagnosisCode: 'CONVERSION_LEAK',
      interventionCode: 'TRIAL_FOLLOWUP',
      expectedOutcomeHorizonDays: 30,
      outcomeVerificationType: 'USER_CONFIRMED',
    });
    (hasActiveLearningConsent as jest.Mock).mockResolvedValue(false);
    (prisma.decisionOutcome.update as jest.Mock).mockResolvedValue({});

    const result = await maybeShareDecisionOutcomeV2('d1');
    expect(result.shared).toBe(false);
    expect(result.reason).toBe('NO_CONSENT');
    expect(prisma.anonymizedOutcomeObservationV2.create).not.toHaveBeenCalled();
  });

  it('creates a V2 row without organizationId when consented', async () => {
    (prisma.decisionOutcome.findUnique as jest.Mock).mockResolvedValue({
      id: 'd1',
      organizationId: 'orgA',
      lifecycleOutcome: 'NO_EFFECT',
      anonymizedObservationId: null,
      contextJson: {
        educationSubtype: 'STEM_ACADEMY',
        activeLearnerCount: 25,
        locationCount: 1,
        utilization: 0.5,
        trialConversion: 0.2,
        churnRate: 0.05,
        spareCapacity: 2,
        cashRunwayWeeks: 8,
        cashBalanceCents: 100000,
        seasonOrPeriod: 'fall_term',
      },
      diagnosisCode: 'CONVERSION_LEAK',
      interventionCode: 'TRIAL_FOLLOWUP',
      expectedOutcomeHorizonDays: 30,
      outcomeVerificationType: 'USER_CONFIRMED',
    });
    (hasActiveLearningConsent as jest.Mock).mockResolvedValue(true);
    (prisma.anonymizedOutcomeObservationV2.create as jest.Mock).mockResolvedValue({
      id: 'obs1',
    });
    (prisma.decisionOutcome.update as jest.Mock).mockResolvedValue({});

    const result = await maybeShareDecisionOutcomeV2('d1');
    expect(result.shared).toBe(true);
    const createArg = (prisma.anonymizedOutcomeObservationV2.create as jest.Mock)
      .mock.calls[0][0].data;
    expect(createArg.organizationId).toBeUndefined();
    expect(createArg.outcome).toBe('NO_EFFECT');
    expect(createArg.purposeVersion).toBe('somtico_models_v2');
    expect(JSON.stringify(createArg)).not.toContain('orgA');
  });
});
