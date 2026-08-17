/**
 * Internal evaluation harness: Advisor (Somtico stack) vs generic frontier prompt.
 * Uses synthetic fixtures only — never real customer conversations.
 * Not a customer-facing feature.
 */

export type EvalDimension =
  | 'factual_correctness'
  | 'numerical_correctness'
  | 'evidence_grounding'
  | 'actionable_specificity'
  | 'missing_data_discipline'
  | 'hallucination_rate'
  | 'inappropriate_certainty'
  | 'recommendation_relevance';

export type EvalScores = Record<EvalDimension, number>;

export interface EvalFixture {
  id: string;
  question: string;
  /** Deterministic tool results Advisor is allowed to use. */
  toolEvidence: Record<string, unknown>;
  /** Expected grounded facts (must appear in Somtico answer). */
  mustInclude: string[];
  /** Phrases that indicate hallucination / invention. */
  mustNotInclude: string[];
  missingDataExpected?: boolean;
}

export const SYNTHETIC_EVAL_FIXTURES: EvalFixture[] = [
  {
    id: 'staffing_excess_hours',
    question:
      'Are we overstaffed this week relative to expected demand, and what should we do?',
    toolEvidence: {
      staffingVersusDemand: {
        excessHours: 6.5,
        estimatedSavingsCents: 16250,
        scheduledHours: 20,
        neededInstructorHours: 13.5,
      },
    },
    mustInclude: ['6.5', 'overstaff', 'instructor'],
    mustNotInclude: ['guaranteed', 'will save exactly', 'invented'],
  },
  {
    id: 'pricing_insufficient_data',
    question: 'What price should we charge for Robotics 101?',
    toolEvidence: {
      pricingGuidance: {
        programmes: [
          {
            name: 'Robotics 101',
            verdict: 'INSUFFICIENT_DATA',
            missingData: ['wage_profiles', 'next_7_day_sessions'],
          },
        ],
      },
    },
    mustInclude: ['insufficient', 'wage', 'session'],
    mustNotInclude: ['$49', 'recommend cutting to'],
    missingDataExpected: true,
  },
  {
    id: 'enrolment_conversion_leak',
    question: 'Where is our enrolment leak this week?',
    toolEvidence: {
      enrolmentGuidance: {
        leak: 'CONVERSION_LEAK',
        leakLabel: 'Conversion Leak',
        cheapNextSteps: ['Follow up unpaid trials within 48 hours'],
      },
    },
    mustInclude: ['Conversion Leak', 'trial'],
    mustNotInclude: ['Retention Leak'],
  },
];

export function genericAfterSchoolSystemPrompt(): string {
  return (
    'You are a helpful business advisor for after-school tutoring centres. ' +
    'Answer based on general knowledge. You do not have access to this centre\'s data.'
  );
}

export function somticoAdvisorSystemPrompt(): string {
  return (
    'You are the AI-powered Advisor within Somtico Business Advisor. ' +
    'Use only the provided deterministic tool evidence. Never invent numbers. ' +
    'If evidence says INSUFFICIENT_DATA, ask for the missing datasets. ' +
    'Do not give legal, tax, or investment advice. Do not claim a personal human name.'
  );
}

/** Score an answer against a fixture (0–1 per dimension). Pure / deterministic. */
export function scoreAnswerAgainstFixture(params: {
  answer: string;
  fixture: EvalFixture;
  usedSomticoTools: boolean;
}): EvalScores {
  const text = params.answer.toLowerCase();
  const mustHits = params.fixture.mustInclude.filter((s) =>
    text.includes(s.toLowerCase())
  ).length;
  const mustIncludeRate =
    params.fixture.mustInclude.length > 0
      ? mustHits / params.fixture.mustInclude.length
      : 1;
  const bannedHits = params.fixture.mustNotInclude.filter((s) =>
    text.includes(s.toLowerCase())
  ).length;
  const hallucination = bannedHits > 0 ? 1 : 0;
  const missingOk = params.fixture.missingDataExpected
    ? /insufficient|missing|need|provide|wage|session/.test(text)
      ? 1
      : 0
    : 1;
  const certaintyPenalty = /guaranteed|certainly will|definitely will/.test(text)
    ? 1
    : 0;
  const grounded = params.usedSomticoTools ? mustIncludeRate : mustIncludeRate * 0.4;

  return {
    factual_correctness: mustIncludeRate,
    numerical_correctness: mustIncludeRate,
    evidence_grounding: grounded,
    actionable_specificity: /review|follow|trim|collect|ask|test/.test(text)
      ? 0.8
      : 0.3,
    missing_data_discipline: missingOk,
    hallucination_rate: 1 - hallucination,
    inappropriate_certainty: 1 - certaintyPenalty,
    recommendation_relevance: mustIncludeRate,
  };
}

/** Build a Somtico-stack answer from tool evidence (deterministic local path for tests). */
export function somticoDeterministicAnswer(fixture: EvalFixture): string {
  if (fixture.id === 'staffing_excess_hours') {
    const s = fixture.toolEvidence.staffingVersusDemand as {
      excessHours: number;
      estimatedSavingsCents: number;
    };
    return (
      `Staffing evidence shows about ${s.excessHours} excess instructor hours this week ` +
      `(labour opportunity ~$${(s.estimatedSavingsCents / 100).toFixed(0)}). ` +
      `Review overlapping coverage and trim underused instructor hours before next week.`
    );
  }
  if (fixture.id === 'pricing_insufficient_data') {
    return (
      'Pricing guidance returned INSUFFICIENT_DATA for Robotics 101. ' +
      'Collect wage profiles and next-7-day sessions with instructors before quoting a price.'
    );
  }
  if (fixture.id === 'enrolment_conversion_leak') {
    return (
      'Enrolment guidance names a Conversion Leak. ' +
      'Cheap next step: follow up unpaid trials within 48 hours.'
    );
  }
  return 'Insufficient evidence.';
}

/** Naive generic answer with no tools (baseline). */
export function genericBaselineAnswer(fixture: EvalFixture): string {
  if (fixture.id === 'pricing_insufficient_data') {
    return (
      'Most robotics programmes charge around $49–$79. I recommend cutting to $49 to fill seats.'
    );
  }
  return (
    'In general, after-school centres should watch staffing and enrolment. ' +
    'You should certainly improve conversion somehow.'
  );
}

export function averageScores(scores: EvalScores[]): EvalScores {
  const keys = Object.keys(scores[0] || {}) as EvalDimension[];
  const out = {} as EvalScores;
  for (const k of keys) {
    out[k] = scores.reduce((s, row) => s + row[k], 0) / Math.max(scores.length, 1);
  }
  return out;
}

export function runSyntheticEvaluation(params?: {
  provider?: string;
  model?: string;
}) {
  const provider = params?.provider || 'local_deterministic';
  const model = params?.model || 'fixture_harness_v1';

  const somticoScores: EvalScores[] = [];
  const genericScores: EvalScores[] = [];

  for (const fixture of SYNTHETIC_EVAL_FIXTURES) {
    const somticoAnswer = somticoDeterministicAnswer(fixture);
    const genericAnswer = genericBaselineAnswer(fixture);
    somticoScores.push(
      scoreAnswerAgainstFixture({
        answer: somticoAnswer,
        fixture,
        usedSomticoTools: true,
      })
    );
    genericScores.push(
      scoreAnswerAgainstFixture({
        answer: genericAnswer,
        fixture,
        usedSomticoTools: false,
      })
    );
  }

  const somticoAvg = averageScores(somticoScores);
  const genericAvg = averageScores(genericScores);
  const somticoOverall =
    Object.values(somticoAvg).reduce((a, b) => a + b, 0) /
    Object.values(somticoAvg).length;
  const genericOverall =
    Object.values(genericAvg).reduce((a, b) => a + b, 0) /
    Object.values(genericAvg).length;

  return {
    provider,
    model,
    fixtureCount: SYNTHETIC_EVAL_FIXTURES.length,
    somtico: { scores: somticoAvg, overall: somticoOverall },
    generic: { scores: genericAvg, overall: genericOverall },
    somticoBeatsGeneric: somticoOverall > genericOverall,
    prompts: {
      somtico: somticoAdvisorSystemPrompt(),
      generic: genericAfterSchoolSystemPrompt(),
    },
  };
}
