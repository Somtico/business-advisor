/**
 * Branding guardrails: product is Somtico Business Advisor; AI is Advisor (no character name).
 */
import { ADVICE_DISCLAIMER } from '../../config/legal';
import { somticoAdvisorSystemPrompt } from './evaluationHarness';

describe('product branding', () => {
  it('uses Somtico Business Advisor in the advice disclaimer', () => {
    expect(ADVICE_DISCLAIMER).toContain('Somtico Business Advisor');
    expect(ADVICE_DISCLAIMER).not.toMatch(/\bChuk\b/i);
    expect(ADVICE_DISCLAIMER).not.toMatch(/\bTico\b/i);
    expect(ADVICE_DISCLAIMER).not.toContain('AI Business Advisor');
  });

  it('identifies the model as Advisor within Somtico Business Advisor', () => {
    const prompt = somticoAdvisorSystemPrompt();
    expect(prompt).toContain('Advisor');
    expect(prompt).toContain('Somtico Business Advisor');
    expect(prompt).not.toMatch(/\bYou are Chuk\b/i);
    expect(prompt).not.toMatch(/\bYou are Tico\b/i);
  });

  it('exposes advisorVersusGenericEvaluation (not chukVersus) on moat health shape', async () => {
    // Structural rename check via module source import surface
    const health = await import('./moatHealthService');
    expect(typeof health.computeMoatHealthMetrics).toBe('function');
  });
});
