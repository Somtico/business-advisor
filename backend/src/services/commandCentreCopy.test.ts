import {
  EDUCATION_LABELS,
  EDUCATION_DATASETS,
} from '../catalog/educationBlueprint';
import { INSUFFICIENT_ENROLMENT_NOTE } from './enrolmentService';

describe('Command Centre customer-facing copy', () => {
  it('uses Students rather than Students / Learners in the blueprint', () => {
    expect(EDUCATION_LABELS.customers).toBe('Students');
    expect(EDUCATION_DATASETS.find((d) => d.datasetKey === 'students')?.label).toBe(
      'Students'
    );
    expect(
      EDUCATION_DATASETS.find((d) => d.datasetKey === 'programmes')?.label
    ).toBe('Programmes');
    expect(
      JSON.stringify(EDUCATION_DATASETS)
    ).not.toMatch(/Students \/ Learners/);
  });

  it('explains missing enrolment evidence in customer language', () => {
    expect(INSUFFICIENT_ENROLMENT_NOTE).toMatch(/enrolment records/i);
    expect(INSUFFICIENT_ENROLMENT_NOTE).not.toMatch(/that ask is the advice/i);
    expect(INSUFFICIENT_ENROLMENT_NOTE).not.toMatch(/cannot name an enrolment leak/i);
  });

  it('keeps Canadian spelling in blueprint labels', () => {
    expect(EDUCATION_LABELS.services).toBe('Programmes');
    expect(EDUCATION_LABELS.engagements).toBe('Enrolments');
  });

  it('describes cash position separately from loan liabilities', () => {
    const loansCash = EDUCATION_DATASETS.find((d) => d.datasetKey === 'loans_cash');
    expect(loansCash?.label).toBe('Cash Position and Loans');
    expect(loansCash?.whyItMatters).toMatch(/liabilities/i);
    expect(loansCash?.whyItMatters).toMatch(/not subtracted from cash/i);
  });
});
