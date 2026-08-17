import {
  findLeakedFixturePii,
  minimizeForProviderInference,
} from './providerPiiMinimizer';
import {
  invokeProviderInference,
  prepareProviderSafeRequest,
} from './aiAdvisorService';

jest.mock('./ai/aiGateway', () => ({
  runAiInference: jest.fn(),
  recordLocalFallback: jest.fn(),
}));

import { runAiInference } from './ai/aiGateway';


const FIXTURE_STUDENT = 'PII_TEST_STUDENT_JANE_SMITH';
const FIXTURE_EMAIL = 'pii-test-parent@example.com';
const FIXTURE_PHONE = '+1 306 555 0199';
const FIXTURE_STREET = '123 Privacy Test Street';

describe('providerPiiMinimizer', () => {
  it('aliases the same person consistently within one request', () => {
    const withRole = minimizeForProviderInference({
      question: 'Hours check',
      toolResults: {
        sessions: [
          { instructor: 'Jane Smith', hours: 10, wage: '$24/hour' },
        ],
        summary: 'Jane Smith earns $24/hour. Jane Smith worked 10 hours.',
      },
    });
    expect(withRole.toolResults.summary).toBe(
      'Instructor A earns $24/hour. Instructor A worked 10 hours.'
    );
    expect(JSON.stringify(withRole.toolResults)).not.toContain('Jane Smith');
    expect(JSON.stringify(withRole.toolResults)).toContain('$24/hour');
    expect(JSON.stringify(withRole.toolResults)).toContain('10');
    expect(withRole.stats.aliasesCreated).toBe(1);
  });

  it('assigns different aliases to different people', () => {
    const result = minimizeForProviderInference({
      question: 'Compare staff',
      toolResults: {
        sessions: [
          { instructor: 'Jane Smith', hours: 10 },
          { instructor: 'John Brown', hours: 8 },
        ],
      },
    });
    const sessions = result.toolResults.sessions as Array<{
      instructor: string;
    }>;
    expect(sessions[0].instructor).toBe('Instructor A');
    expect(sessions[1].instructor).toBe('Instructor B');
    expect(sessions[0].instructor).not.toBe(sessions[1].instructor);
  });

  it('uses role-aware aliases for students and parents', () => {
    const result = minimizeForProviderInference({
      question: 'Who enrolled?',
      toolResults: {
        enrolment: {
          studentName: 'Noah Johnson',
          parentName: 'Sarah Johnson',
          programName: 'Python Explorers',
          monthlyFee: 199,
        },
      },
    });
    const enrolment = result.toolResults.enrolment as Record<string, unknown>;
    expect(enrolment.studentName).toBe('Student A');
    expect(enrolment.parentName).toBe('Parent A');
    expect(enrolment.programName).toBe('Python Explorers');
    expect(enrolment.monthlyFee).toBe(199);
  });

  it('removes emails and phones from structured fields and free text', () => {
    const result = minimizeForProviderInference({
      question: `Contact ${FIXTURE_EMAIL} or ${FIXTURE_PHONE}`,
      toolResults: {
        household: {
          email: FIXTURE_EMAIL,
          phone: FIXTURE_PHONE,
          note: `Reach ${FIXTURE_EMAIL}`,
        },
      },
    });
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(FIXTURE_EMAIL);
    expect(blob).not.toContain('306 555 0199');
    expect(blob).toContain('[email removed]');
    expect(blob).toContain('[phone removed]');
    expect(result.stats.emailsRemoved).toBeGreaterThanOrEqual(2);
    expect(result.stats.phonesRemoved).toBeGreaterThanOrEqual(1);
  });

  it('generalizes street addresses while preserving programme names', () => {
    const result = minimizeForProviderInference({
      question: `Family at ${FIXTURE_STREET}, Saskatoon`,
      toolResults: {
        programmes: [{ name: 'Python Explorers', activeEnrolments: 14 }],
        also: [{ name: 'Advanced Math' }, { name: 'Robotics' }],
        address: FIXTURE_STREET,
      },
    });
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(FIXTURE_STREET);
    expect(blob).toContain('Python Explorers');
    expect(blob).toContain('Advanced Math');
    expect(blob).toContain('Robotics');
    expect(blob).toContain('14');
  });

  it('preserves financial and operational metrics', () => {
    const result = minimizeForProviderInference({
      question: 'Revenue?',
      toolResults: {
        cash: {
          revenue: '$4,500 revenue',
          hours: '18 hours',
          rate: '$24/hour',
          fee: '$199/month',
        },
      },
    });
    const cash = result.toolResults.cash as Record<string, string>;
    expect(cash.revenue).toContain('$4,500');
    expect(cash.hours).toContain('18 hours');
    expect(cash.rate).toContain('$24/hour');
    expect(cash.fee).toContain('$199/month');
  });

  it('keeps cross-record identity consistent via personId', () => {
    const result = minimizeForProviderInference({
      question: 'Correlate',
      toolResults: {
        shifts: [
          { personId: 'cuid_abc', instructor: 'Jane Smith', hours: 5 },
          { personId: 'cuid_abc', hours: 3 },
        ],
      },
    });
    const shifts = result.toolResults.shifts as Array<{
      personId: string;
      instructor?: string;
    }>;
    expect(shifts[0].personId).toBe(shifts[1].personId);
    expect(shifts[0].personId).toMatch(/^Person \d+$/);
    expect(shifts[0].instructor).toBe('Instructor A');
  });

  it('generalizes date of birth to age when possible', () => {
    const result = minimizeForProviderInference({
      question: 'Age?',
      toolResults: {
        student: { studentName: 'Kid Example', dateOfBirth: '2015-04-11' },
      },
    });
    const student = result.toolResults.student as Record<string, string>;
    expect(student.dateOfBirth).toMatch(/^Age \d+$/);
    expect(student.dateOfBirth).not.toContain('2015');
  });

  it('does not return reverse identity mappings in the result', () => {
    const result = minimizeForProviderInference({
      question: 'x',
      toolResults: { instructor: 'Jane Smith' },
    });
    const keys = Object.keys(result);
    expect(keys).toEqual(['question', 'toolResults', 'stats']);
    expect(JSON.stringify(result)).not.toContain('Jane Smith');
    expect(result.stats).not.toHaveProperty('mapping');
    expect(result.stats).not.toHaveProperty('aliases');
  });

  it('runs independently of Help Improve Advisor consent', () => {
    const consented = minimizeForProviderInference({
      question: `Email ${FIXTURE_EMAIL}`,
      toolResults: { helpImproveOptIn: true, parentEmail: FIXTURE_EMAIL },
    });
    const declined = minimizeForProviderInference({
      question: `Email ${FIXTURE_EMAIL}`,
      toolResults: { helpImproveOptIn: false, parentEmail: FIXTURE_EMAIL },
    });
    expect(JSON.stringify(consented)).not.toContain(FIXTURE_EMAIL);
    expect(JSON.stringify(declined)).not.toContain(FIXTURE_EMAIL);
    expect(consented.toolResults.helpImproveOptIn).toBe(true);
    expect(declined.toolResults.helpImproveOptIn).toBe(false);
  });

  it('findLeakedFixturePii detects residual raw fixtures', () => {
    expect(
      findLeakedFixturePii('safe Instructor A', [FIXTURE_STUDENT])
    ).toEqual([]);
    expect(
      findLeakedFixturePii(`bad ${FIXTURE_STUDENT}`, [FIXTURE_STUDENT])
    ).toEqual([FIXTURE_STUDENT]);
  });
});

describe('provider inference boundary', () => {
  const rawToolResults = {
    pricingGuidance: {
      programmes: [
        {
          name: 'Python Explorers',
          evidence: {
            sessions: [
              {
                instructor: FIXTURE_STUDENT,
                hours: 18,
                hourlyCents: 2400,
                costCents: 43200,
              },
            ],
          },
          missingData: [
            {
              detail: `Add a wage profile for: ${FIXTURE_STUDENT}. Call ${FIXTURE_PHONE} or ${FIXTURE_EMAIL}. Lives at ${FIXTURE_STREET}.`,
            },
          ],
        },
      ],
    },
    organizationMemory: {
      tacticsTried: [
        {
          label: 'Referral ask',
          resultSummary: `${FIXTURE_STUDENT} referred a friend; parent ${FIXTURE_EMAIL}`,
        },
      ],
    },
  };

  const fixtures = [
    FIXTURE_STUDENT,
    FIXTURE_EMAIL,
    '306 555 0199',
    FIXTURE_STREET,
  ];

  it('prepareProviderSafeRequest strips fixture PII from the user prompt', () => {
    const prepared = prepareProviderSafeRequest({
      question: `Why is ${FIXTURE_STUDENT} expensive? Parent ${FIXTURE_EMAIL}`,
      tools: ['organizationMemory', 'pricingGuidance'],
      toolResults: rawToolResults,
    });
    const leaked = findLeakedFixturePii(prepared.user, fixtures);
    expect(leaked).toEqual([]);
    expect(prepared.user).toContain('Python Explorers');
    expect(prepared.user).toContain('Instructor A');
    expect(prepared.user).toContain('18');
    expect(JSON.stringify(prepared.stats)).not.toContain(FIXTURE_STUDENT);
  });

  it('invokeProviderInference never sends fixture PII to the AI gateway', async () => {
    const captured: Array<{ system: string; user: string }> = [];
    (runAiInference as jest.Mock).mockImplementation(async (req) => {
      captured.push({ system: req.system, user: req.user });
      return {
        text: 'Minimized answer',
        provider: 'openai',
        model: 'gpt-5.6-terra',
        logicalRequestId: 'lr-1',
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 5,
          reasoningTokens: 0,
          reasoningBilledSeparately: false,
          totalTokensReported: 15,
        },
        estimatedCostUsdMicros: 1n,
        privacyPolicy: 'test',
        usedFallback: true,
        fallbackReason: 'AI_PROVIDER_UNAVAILABLE',
        budgetWarnings: [],
        providerCallCount: 2,
      };
    });

    const result = await invokeProviderInference({
      organizationId: 'org-pii-test',
      userId: 'user-1',
      question: `Review ${FIXTURE_STUDENT} at ${FIXTURE_STREET}`,
      tools: ['organizationMemory', 'pricingGuidance'],
      toolResults: rawToolResults,
    });

    expect(result.provider).toBe('openai');
    expect(captured).toHaveLength(1);
    const leaked = findLeakedFixturePii(
      `${captured[0].system}\n${captured[0].user}`,
      fixtures
    );
    expect(leaked).toEqual([]);
    expect(captured[0].user).toContain('Instructor A');
    expect(JSON.stringify(result.minimizationStats)).not.toContain(
      FIXTURE_STUDENT
    );
  });

  it('Anthropic success path also receives only minimized content', async () => {
    (runAiInference as jest.Mock).mockImplementation(async (req) => {
      expect(findLeakedFixturePii(req.user, fixtures)).toEqual([]);
      expect(req.user).not.toContain(FIXTURE_STUDENT);
      return {
        text: 'Advisor answer',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        logicalRequestId: 'lr-2',
        usage: {
          inputTokens: 12,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 8,
          reasoningTokens: 0,
          reasoningBilledSeparately: false,
          totalTokensReported: 20,
        },
        estimatedCostUsdMicros: 1n,
        privacyPolicy: 'test',
        usedFallback: false,
        fallbackReason: null,
        budgetWarnings: [],
        providerCallCount: 1,
      };
    });

    const result = await invokeProviderInference({
      organizationId: 'org-pii-test',
      userId: 'user-1',
      question: `Student ${FIXTURE_STUDENT}`,
      tools: ['pricingGuidance'],
      toolResults: rawToolResults,
    });
    expect(result.provider).toBe('anthropic');
  });
});
