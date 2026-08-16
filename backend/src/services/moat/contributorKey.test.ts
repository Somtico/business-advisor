import { createHmac } from 'crypto';
import {
  assertLearningContributorSaltConfigured,
  deriveContributorKey,
  DEV_LEARNING_CONTRIBUTOR_SALT_FALLBACK,
  LearningContributorSaltConfigError,
  resolveLearningContributorSalt,
} from './contributorKey';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../../config/legal';

describe('LEARNING_CONTRIBUTOR_SALT resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('production rejects missing LEARNING_CONTRIBUTOR_SALT', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LEARNING_CONTRIBUTOR_SALT;
    process.env.JWT_SECRET = 'jwt-must-not-be-used';
    expect(() => resolveLearningContributorSalt()).toThrow(
      LearningContributorSaltConfigError
    );
    expect(() => resolveLearningContributorSalt()).toThrow(
      /LEARNING_CONTRIBUTOR_SALT is required in production/
    );
  });

  it('production rejects blank LEARNING_CONTRIBUTOR_SALT', () => {
    process.env.NODE_ENV = 'production';
    process.env.LEARNING_CONTRIBUTOR_SALT = '   ';
    process.env.JWT_SECRET = 'jwt-must-not-be-used';
    expect(() => resolveLearningContributorSalt()).toThrow(
      LearningContributorSaltConfigError
    );
  });

  it('production never falls back to JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LEARNING_CONTRIBUTOR_SALT;
    process.env.JWT_SECRET = 'only-jwt';
    expect(() => resolveLearningContributorSalt()).toThrow(
      LearningContributorSaltConfigError
    );
  });

  it('production accepts a dedicated non-empty salt', () => {
    process.env.NODE_ENV = 'production';
    process.env.LEARNING_CONTRIBUTOR_SALT = 'dedicated-prod-salt';
    expect(resolveLearningContributorSalt()).toBe('dedicated-prod-salt');
  });

  it('assertLearningContributorSaltConfigured fails production startup when missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LEARNING_CONTRIBUTOR_SALT;
    expect(() => assertLearningContributorSaltConfigured()).toThrow(
      /LEARNING_CONTRIBUTOR_SALT/
    );
  });

  it('development may use the documented local fallback when salt is unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LEARNING_CONTRIBUTOR_SALT;
    process.env.JWT_SECRET = 'jwt-should-still-not-be-used';
    expect(resolveLearningContributorSalt()).toBe(
      DEV_LEARNING_CONTRIBUTOR_SALT_FALLBACK
    );
  });

  it('development prefers LEARNING_CONTRIBUTOR_SALT when set', () => {
    process.env.NODE_ENV = 'test';
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-dedicated';
    expect(resolveLearningContributorSalt()).toBe('test-dedicated');
  });
});

describe('deriveContributorKey', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.LEARNING_CONTRIBUTOR_SALT = 'test-salt';
  });

  it('is deterministic for the same organizationId + purposeVersion', () => {
    const a = deriveContributorKey('org_a', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    const b = deriveContributorKey('org_a', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when organizationId differs', () => {
    const a = deriveContributorKey('org_a', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    const b = deriveContributorKey('org_b', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    expect(a).not.toBe(b);
  });

  it('differs when purposeVersion differs for the same organization', () => {
    const v2 = deriveContributorKey('org_a', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    const bench = deriveContributorKey(
      'org_a',
      BENCHMARK_SNAPSHOTS_PURPOSE_VERSION
    );
    expect(v2).not.toBe(bench);
  });

  it('does not embed organizationId in the digest', () => {
    const key = deriveContributorKey('org_secret_id', OUTCOME_CORPUS_PURPOSE_VERSION_V2);
    expect(key).not.toContain('org_secret_id');
  });

  it('matches raw HMAC of purposeVersion:organizationId', () => {
    const expected = createHmac('sha256', 'test-salt')
      .update(`${OUTCOME_CORPUS_PURPOSE_VERSION_V2}:org_a`)
      .digest('hex');
    expect(deriveContributorKey('org_a', OUTCOME_CORPUS_PURPOSE_VERSION_V2)).toBe(
      expected
    );
  });

  it('keeps somtico_models_v1 purpose string distinct (compatibility)', () => {
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).toBe('somtico_models_v1');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION_V2).toBe('somtico_models_v2');
    // v1 anonymized_tactic_outcomes still have no contributorKey column usage.
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).not.toBe(OUTCOME_CORPUS_PURPOSE_VERSION_V2);
  });
});
