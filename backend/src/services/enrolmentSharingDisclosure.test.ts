import { ANONYMIZED_TACTIC_SHARING_EXPLANATION } from './enrolmentService';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '../config/legal';

describe('V1 anonymized tactic sharing disclosure', () => {
  it('keeps legal document versions unchanged', () => {
    expect(TERMS_VERSION).toBe('2026-08-16.1');
    expect(PRIVACY_VERSION).toBe('2026-08-16.1');
  });

  it('keeps V1 / V2 / benchmark purpose strings distinct', () => {
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).toBe('somtico_models_v1');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION_V2).toBe('somtico_models_v2');
    expect(BENCHMARK_SNAPSHOTS_PURPOSE_VERSION).toBe('benchmark_snapshots_v1');
  });

  it('explains optional opt-in, field limits, aggregation, and Somtico-only training', () => {
    const text = ANONYMIZED_TACTIC_SHARING_EXPLANATION;
    expect(text).toMatch(/Optional/i);
    expect(text).toMatch(/tactic type/i);
    expect(text).toMatch(/cost band/i);
    expect(text).toMatch(/outcome/i);
    expect(text).toMatch(/leak type/i);
    expect(text).toMatch(/education bucket/i);
    expect(text).toMatch(/notes/i);
    expect(text).toMatch(/organization id/i);
    expect(text).toMatch(/8 similar reports/i);
    expect(text).toMatch(/playbook/i);
    expect(text).toMatch(/never sent to train Anthropic/i);
  });

  it('discloses that shared V1 copies generally cannot be deleted by organization', () => {
    const text = ANONYMIZED_TACTIC_SHARING_EXPLANATION;
    expect(text).toMatch(/no organization identifier or withdrawal key/i);
    expect(text).toMatch(
      /generally cannot later be located and deleted by organization/i
    );
    expect(text).toMatch(/leave sharing off for any future record/i);
  });

  it('does not claim the local tenant tactic record is undeletable', () => {
    expect(ANONYMIZED_TACTIC_SHARING_EXPLANATION).toMatch(
      /local tactic notes on your organization stay under your control/i
    );
  });
});
