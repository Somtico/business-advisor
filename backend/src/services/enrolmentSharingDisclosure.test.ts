import {
  HELP_IMPROVE_STATUS_OFF,
  HELP_IMPROVE_STATUS_ON,
} from './enrolmentService';
import {
  HELP_IMPROVE_ADVISOR_SETTING_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '../config/legal';
import { assertNoProhibitedFields } from './moat/outcomeObservationV2Service';

describe('Help Improve Advisor enrolment disclosure alignment', () => {
  it('keeps legal versions at 2026-08-16.2', () => {
    expect(TERMS_VERSION).toBe('2026-08-16.2');
    expect(PRIVACY_VERSION).toBe('2026-08-16.2');
  });

  it('exposes quiet ON/OFF status copy without per-record consent language', () => {
    expect(HELP_IMPROVE_STATUS_ON).toMatch(/Help Improve Advisor: On/i);
    expect(HELP_IMPROVE_STATUS_OFF).toMatch(/Help Improve Advisor: Off/i);
    expect(HELP_IMPROVE_STATUS_ON).not.toMatch(/checkbox/i);
    expect(HELP_IMPROVE_STATUS_OFF).not.toMatch(/withdrawal key/i);
  });

  it('keeps V1 historical purpose distinct from Help Improve / V2', () => {
    expect(OUTCOME_CORPUS_PURPOSE_VERSION).toBe('somtico_models_v1');
    expect(OUTCOME_CORPUS_PURPOSE_VERSION_V2).toBe('somtico_models_v2');
    expect(HELP_IMPROVE_ADVISOR_SETTING_VERSION).toBe('help_improve_advisor_v1');
  });

  it('rejects prohibited identifiers in learning payloads', () => {
    expect(() =>
      assertNoProhibitedFields({
        diagnosedLeak: 'CONVERSION_LEAK',
        interventionCategory: 'TRIAL_FOLLOWUP',
        outcome: 'HELPED',
      })
    ).not.toThrow();
    expect(() =>
      assertNoProhibitedFields({
        organizationId: 'org_123',
        outcome: 'HELPED',
      })
    ).toThrow(/PROHIBITED_FIELD/);
    expect(() =>
      assertNoProhibitedFields({
        resultSummary: 'Called the Smith family',
        outcome: 'HELPED',
      })
    ).toThrow(/PROHIBITED_FIELD/);
  });
});
