import {
  profileForAdvisorQuestion,
  resolveFallbackRoute,
  resolvePrimaryRoute,
} from './modelPolicy';

describe('model policy', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AI_PRIMARY_PROVIDER = 'anthropic';
    process.env.AI_FALLBACK_PROVIDER = 'openai';
    process.env.AI_FALLBACK_ENABLED = 'true';
    process.env.ANTHROPIC_ROUTINE_MODEL = 'claude-sonnet-5';
    process.env.ANTHROPIC_STRATEGIC_MODEL = 'claude-opus-5';
    process.env.ANTHROPIC_CHEAP_MODEL = 'claude-haiku-4-5';
    process.env.OPENAI_FALLBACK_MODEL = 'gpt-5.6-terra';
    process.env.OPENAI_STRATEGIC_MODEL = 'gpt-5.6-sol';
    process.env.OPENAI_CHEAP_MODEL = 'gpt-5.6-luna';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('routes ordinary work to Anthropic and fallback to OpenAI', () => {
    expect(resolvePrimaryRoute('routine_advisor')).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      role: 'primary',
    });
    expect(resolveFallbackRoute('routine_advisor')).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      role: 'fallback',
    });
  });

  it('keeps expensive strategic models behind an explicit flag', () => {
    process.env.AI_ALLOW_EXPENSIVE_STRATEGIC_MODELS = 'false';
    expect(resolvePrimaryRoute('complex_strategy').model).toBe(
      'claude-sonnet-5'
    );
    process.env.AI_ALLOW_EXPENSIVE_STRATEGIC_MODELS = 'true';
    expect(resolvePrimaryRoute('complex_strategy').model).toBe('claude-opus-5');
  });

  it('uses cheap models for background work', () => {
    expect(resolvePrimaryRoute('cheap_background').model).toBe(
      'claude-haiku-4-5'
    );
    expect(resolveFallbackRoute('cheap_background')?.model).toBe(
      'gpt-5.6-luna'
    );
  });

  it('classifies Advisor questions by complexity', () => {
    expect(profileForAdvisorQuestion('What is our student count?')).toBe(
      'routine_advisor'
    );
    expect(profileForAdvisorQuestion('Compare our staffing trade-offs')).toBe(
      'standard_advisor'
    );
    expect(profileForAdvisorQuestion('Build a multi-year board strategy')).toBe(
      'complex_strategy'
    );
  });
});
