/**
 * Workload → provider/model/effort policy.
 * Features request a profile; they never pick raw model IDs.
 *
 * Production route: Anthropic primary → OpenAI fallback (eligible failures only).
 */

import { getAiConfig, WorkloadProfile } from './aiConfig';

export type ProviderRoute = {
  provider: 'anthropic' | 'openai';
  model: string;
  effort: string | null;
  maxOutputTokens: number;
  role: 'primary' | 'fallback' | 'cheap';
};

export function resolvePrimaryRoute(
  profile: WorkloadProfile
): ProviderRoute {
  const cfg = getAiConfig();
  const maxOutputTokens = cfg.limits.outputTokens[profile];
  const primary = cfg.routing.primaryProvider;

  if (profile === 'cheap_background') {
    // Still Anthropic-first (Haiku) so OpenAI credit stays for emergencies
    if (primary === 'openai') {
      return {
        provider: 'openai',
        model: cfg.models.openaiCheap,
        effort: null,
        maxOutputTokens,
        role: 'cheap',
      };
    }
    return {
      provider: 'anthropic',
      model: cfg.models.anthropicCheap,
      effort: cfg.effort.cheap,
      maxOutputTokens,
      role: 'cheap',
    };
  }

  const useExpensive =
    profile === 'complex_strategy' &&
    cfg.models.allowExpensiveStrategicModels;

  const effort =
    profile === 'routine_advisor'
      ? cfg.effort.routine
      : profile === 'standard_advisor'
        ? cfg.effort.standard
        : profile === 'complex_strategy'
          ? cfg.effort.complex
          : cfg.effort.cheap;

  if (primary === 'openai') {
    return {
      provider: 'openai',
      model: useExpensive
        ? cfg.models.openaiStrategic
        : cfg.models.openaiFallback,
      effort: null,
      maxOutputTokens,
      role: 'primary',
    };
  }

  return {
    provider: 'anthropic',
    model: useExpensive
      ? cfg.models.anthropicStrategic
      : cfg.models.anthropicRoutine,
    effort,
    maxOutputTokens,
    role: 'primary',
  };
}

export function resolveFallbackRoute(
  profile: WorkloadProfile
): ProviderRoute | null {
  const cfg = getAiConfig();
  if (!cfg.routing.fallbackEnabled) return null;

  const maxOutputTokens = cfg.limits.outputTokens[profile];

  if (profile === 'cheap_background') {
    return {
      provider: 'openai',
      model: cfg.models.openaiCheap,
      effort: null,
      maxOutputTokens,
      role: 'fallback',
    };
  }

  const useExpensive =
    profile === 'complex_strategy' &&
    cfg.models.allowExpensiveStrategicModels;

  const fallbackProvider = cfg.routing.fallbackProvider;
  if (fallbackProvider === 'anthropic') {
    return {
      provider: 'anthropic',
      model: useExpensive
        ? cfg.models.anthropicStrategic
        : cfg.models.anthropicRoutine,
      effort: cfg.effort.standard,
      maxOutputTokens,
      role: 'fallback',
    };
  }

  return {
    provider: 'openai',
    model: useExpensive
      ? cfg.models.openaiStrategic
      : cfg.models.openaiFallback,
    effort: null,
    maxOutputTokens,
    role: 'fallback',
  };
}

export function profileForAdvisorQuestion(question: string): WorkloadProfile {
  const q = question.toLowerCase();
  if (
    /strateg|multi.?year|scenario planning|board pack|restructur|acquisition|exit/.test(
      q
    )
  ) {
    return 'complex_strategy';
  }
  if (
    /recommend|should we|analyse|analyze|trade.?off|compare|why is|root cause|prioriti[sz]e/.test(
      q
    )
  ) {
    return 'standard_advisor';
  }
  return 'routine_advisor';
}
