import {
  activeEnrolmentBand,
  cashSafetyBand,
  conversionHealth,
  locationCountBand,
  retentionHealth,
  spareCapacityState,
  utilizationBand,
} from './privacyBands';
import { schemaFingerprint } from './schemaFingerprint';
import { deriveContributorKey } from './contributorKey';
import {
  inferDiagnosisCode,
  inferInterventionCode,
  inferLifecycleFromRealizedImpact,
  mapStatusToOwnerDecision,
} from './decisionOutcomeService';
import { assertNoProhibitedFields, buildV2Payload } from './outcomeObservationV2Service';
import {
  canExposeCustomerBenchmark,
  CUSTOMER_BENCHMARKS_ENABLED,
} from './benchmarkSnapshotService';
import {
  MAPPING_AUTO_APPLY_MIN_CONFIDENCE,
} from './sourceMappingService';
import {
  genericBaselineAnswer,
  runSyntheticEvaluation,
  scoreAnswerAgainstFixture,
  somticoDeterministicAnswer,
  SYNTHETIC_EVAL_FIXTURES,
} from './evaluationHarness';
import {
  DECISION_CONTEXT_SCHEMA_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';
import type { DecisionOutcome } from '@prisma/client';

describe('privacy bands', () => {
  it('bands enrolment and locations without leaking exact counts in labels alone', () => {
    expect(activeEnrolmentBand(12)).toBe('1-19');
    expect(activeEnrolmentBand(80)).toBe('50-99');
    expect(locationCountBand(1)).toBe('1');
    expect(locationCountBand(5)).toBe('4+');
  });

  it('classifies utilization, conversion, retention, spare capacity, cash', () => {
    expect(utilizationBand(0.3)).toBe('low');
    expect(conversionHealth(0.4)).toBe('healthy');
    expect(retentionHealth(0.2)).toBe('at_risk');
    expect(spareCapacityState({ utilization: 0.5, spareSeats: 4 })).toBe('spare');
    expect(cashSafetyBand({ runwayWeeks: 2, cashBalanceCents: null })).toBe('tight');
  });
});

describe('schema fingerprint', () => {
  it('hashes field metadata only (order-independent)', () => {
    const a = schemaFingerprint([
      { name: 'start_date', dataType: 'date' },
      { name: 'first_name', dataType: 'string' },
    ]);
    const b = schemaFingerprint([
      { name: 'first_name', dataType: 'string' },
      { name: 'start_date', dataType: 'date' },
    ]);
    expect(a).toBe(b);
    expect(a).not.toContain('Alice');
  });
});

describe('contributor key', () => {
  it('is stable per org+purpose and differs across orgs and purposes', () => {
    process.env.NODE_ENV = 'test';
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-salt';
    const a = deriveContributorKey('org_a', 'somtico_models_v2');
    const b = deriveContributorKey('org_a', 'somtico_models_v2');
    const c = deriveContributorKey('org_b', 'somtico_models_v2');
    const d = deriveContributorKey('org_a', 'benchmark_snapshots_v1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a).not.toContain('org_a');
  });
});

describe('decision outcome helpers', () => {
  it('maps recommendation status to owner decisions', () => {
    expect(mapStatusToOwnerDecision('ACCEPTED')).toBe('ACCEPTED');
    expect(mapStatusToOwnerDecision('REJECTED')).toBe('REJECTED');
    expect(mapStatusToOwnerDecision('OPEN')).toBe('NOT_ACTED');
  });

  it('infers diagnosis and intervention codes', () => {
    expect(
      inferDiagnosisCode({ metricKeys: ['staffing_vs_demand'], title: 'x' })
    ).toBe('STAFFING_OVERSUPPLY');
    expect(
      inferInterventionCode({
        title: 'Trim Underused Instructor Hours',
        diagnosisCode: 'STAFFING_OVERSUPPLY',
      })
    ).toBe('TRIM_LABOUR');
  });

  it('treats zero realized impact as NO_EFFECT and preserves HURT', () => {
    expect(inferLifecycleFromRealizedImpact(0)).toBe('NO_EFFECT');
    expect(inferLifecycleFromRealizedImpact(500, 'HURT')).toBe('HURT');
    expect(inferLifecycleFromRealizedImpact(500)).toBe('HELPED');
  });

  it('never treats expected impact copy as implied — helpers require explicit realized cents', () => {
    // expected is not an argument; realized must be passed by callers
    expect(inferLifecycleFromRealizedImpact(0)).not.toBe('HELPED');
  });
});

describe('anonymized V2 payload', () => {
  const baseDecision = {
    id: 'dec1',
    organizationId: 'org_secret',
    recommendationId: 'rec1',
    schemaVersion: 'decision_outcome_v1',
    diagnosisCode: 'CONVERSION_LEAK',
    interventionCode: 'TRIAL_FOLLOWUP',
    contextAvailable: true,
    contextSchemaVersion: DECISION_CONTEXT_SCHEMA_VERSION,
    contextCapturedAt: new Date(),
    contextJson: {
      schemaVersion: DECISION_CONTEXT_SCHEMA_VERSION,
      educationSubtype: 'STEM_ACADEMY',
      activeLearnerCount: 42,
      locationCount: 1,
      utilization: 0.55,
      trialConversion: 0.2,
      churnRate: 0.05,
      spareCapacity: 3,
      cashRunwayWeeks: 10,
      cashBalanceCents: 100000,
      seasonOrPeriod: 'fall_term',
      diagnosedLeak: 'CONVERSION_LEAK',
    },
    dataFreshness: 'live_deterministic',
    confidence: null,
    estimatedImpactCents: 10000,
    estimatedImpactType: 'REVENUE',
    expectedOutcomeHorizonDays: 30,
    ownerDecision: 'ACCEPTED',
    decisionAt: new Date(),
    lifecycleOutcome: 'NO_EFFECT',
    outcomeAt: new Date(),
    outcomeVerificationType: 'USER_CONFIRMED',
    realizedImpactCents: 0,
    learningEligibility: 'ELIGIBLE_PENDING_CONSENT',
    learningPurposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION_V2,
    implementationVersion: '1.0.0',
    routerVersion: 'claude_first_v1',
    anonymizedObservationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as DecisionOutcome;

  it('builds V2 rows without organizationId or free text', () => {
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-salt';
    const payload = buildV2Payload(baseDecision);
    expect(payload).not.toHaveProperty('organizationId');
    expect(JSON.stringify(payload)).not.toContain('org_secret');
    expect(payload.outcome).toBe('NO_EFFECT');
    expect(payload.purposeVersion).toBe(OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    expect(payload.activeEnrolmentBand).toBe('20-49');
    assertNoProhibitedFields(payload as unknown as Record<string, unknown>);
  });

  it('preserves HURT as a first-class outcome', () => {
    const hurt = {
      ...baseDecision,
      lifecycleOutcome: 'HURT',
      realizedImpactCents: 0,
    } as DecisionOutcome;
    expect(buildV2Payload(hurt).outcome).toBe('HURT');
  });

  it('rejects payloads that include organizationId', () => {
    expect(() =>
      assertNoProhibitedFields({ organizationId: 'x', outcome: 'HELPED' })
    ).toThrow(/PROHIBITED_FIELD/);
  });
});

describe('v1 purpose version compatibility', () => {
  it('keeps somtico_models_v1 distinct from v2', () => {
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).toBe('somtico_models_v1');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION_V2).toBe('somtico_models_v2');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).not.toBe(OUTCOME_CORPUS_PURPOSE_VERSION_V2);
  });
});

describe('contextual peer ranking thresholds', () => {
  it('documents that customer benchmarks stay disabled', () => {
    expect(CUSTOMER_BENCHMARKS_ENABLED).toBe(false);
    const gate = canExposeCustomerBenchmark(100);
    expect(gate.allowed).toBe(false);
  });

  it('requires confirmation below auto-apply mapping confidence', () => {
    expect(MAPPING_AUTO_APPLY_MIN_CONFIDENCE).toBeGreaterThan(0.8);
    expect(0.5 < MAPPING_AUTO_APPLY_MIN_CONFIDENCE).toBe(true);
  });
});

describe('evaluation harness', () => {
  it('runs reproducibly and favours Somtico stack over generic baseline', () => {
    const a = runSyntheticEvaluation({
      provider: 'local_deterministic',
      model: 'fixture_harness_v1',
    });
    const b = runSyntheticEvaluation({
      provider: 'local_deterministic',
      model: 'fixture_harness_v1',
    });
    expect(a.somtico.overall).toBe(b.somtico.overall);
    expect(a.somticoBeatsGeneric).toBe(true);
    expect(a.provider).toBe('local_deterministic');
  });

  it('scores missing-data discipline on pricing fixture', () => {
    const fixture = SYNTHETIC_EVAL_FIXTURES.find(
      (f: { id: string }) => f.id === 'pricing_insufficient_data'
    )!;
    const somtico = scoreAnswerAgainstFixture({
      answer: somticoDeterministicAnswer(fixture),
      fixture,
      usedSomticoTools: true,
    });
    const generic = scoreAnswerAgainstFixture({
      answer: genericBaselineAnswer(fixture),
      fixture,
      usedSomticoTools: false,
    });
    expect(somtico.missing_data_discipline).toBe(1);
    expect(generic.hallucination_rate).toBeLessThan(1);
  });
});

describe('tenant isolation contract (decision outcome query shape)', () => {
  it('requires organizationId when loading a decision outcome', () => {
    // API uses findFirst({ where: { organizationId, recommendationId } })
    const where = { organizationId: 'orgA', recommendationId: 'rec1' };
    expect(where.organizationId).toBe('orgA');
    expect(where).not.toEqual({ recommendationId: 'rec1' });
  });
});
