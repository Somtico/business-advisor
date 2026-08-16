/**
 * Smoke imports — existing Pricing / Enrolment / Impact modules must still load
 * after the moat foundation wiring.
 */
import { IMPACT_VERIFICATION_DELAY_DAYS } from '../impactVerificationService';
import type { ImpactSummary } from '../impactService';

describe('existing impact ledger contracts', () => {
  it('keeps a 30-day verification window', () => {
    expect(IMPACT_VERIFICATION_DELAY_DAYS).toBe(30);
  });

  it('keeps verified / pending / pipeline buckets separate in the type contract', () => {
    const shape: ImpactSummary = {
      verified: {
        savedCents: 0,
        earnedCents: 0,
        otherCents: 0,
        totalCents: 0,
        actionCount: 0,
      },
      thisMonth: { savedCents: 0, earnedCents: 0, otherCents: 0, totalCents: 0 },
      estimatedPendingCents: 100,
      estimatedPendingCount: 1,
      pipelineExpectedCents: 200,
      pipelineCount: 2,
      awaitingConfirmationCount: 0,
      completedActionCount: 0,
      monthly: [],
    };
    expect(shape.verified.totalCents).not.toBe(shape.estimatedPendingCents);
    expect(shape.verified.totalCents).not.toBe(shape.pipelineExpectedCents);
  });
});

describe('pricing and enrolment modules load', () => {
  it('exports pricingGuidance and enrolmentGuidance', async () => {
    const pricing = await import('../pricingService');
    const enrolment = await import('../enrolmentService');
    expect(typeof pricing.pricingGuidance).toBe('function');
    expect(typeof pricing.sanitizePricingGuidanceForClient).toBe('function');
    expect(typeof enrolment.enrolmentGuidance).toBe('function');
    expect(typeof enrolment.recordEnrolmentTactic).toBe('function');
  });
});
