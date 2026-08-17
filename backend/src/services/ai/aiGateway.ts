/**
 * Central AI gateway — sole production entry for Anthropic / OpenAI inference.
 *
 * Routing: Anthropic primary → OpenAI only on eligible transient failures →
 * deterministic/local fallback (caller). Never race both providers.
 */

import { randomUUID } from 'crypto';
import prisma from '../../config/prisma';
import {
  AiFeatureId,
  getAiConfig,
  WorkloadProfile,
} from './aiConfig';
import {
  AiGatewayError,
  isEligibleForCrossProviderFallback,
} from './aiErrors';
import {
  assertBudgetAllows,
  assertProviderBudgetAllows,
} from './budgetService';
import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from './circuitBreaker';
import {
  calculateUsageCost,
  microsToUsdCents,
  NormalizedTokenUsage,
} from './modelPricing';
import {
  resolveFallbackRoute,
  resolvePrimaryRoute,
  ProviderRoute,
} from './modelPolicy';
import { invokeAnthropic } from './providers/anthropicProvider';
import { invokeOpenAI } from './providers/openaiProvider';

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiInferenceRequest = {
  organizationId: string;
  userId?: string;
  feature: AiFeatureId;
  subFeature?: string;
  workloadProfile: WorkloadProfile;
  /** Stable system instructions (eligible for prompt cache). */
  system: string;
  /** Dynamic user content / evidence. */
  user: string;
  isBackground?: boolean;
  /** Client or server idempotency key to dedupe logical work. */
  idempotencyKey?: string;
  /** Correlate with an existing logical request (tool continuation). */
  logicalRequestId?: string;
  metadata?: Record<string, unknown>;
  /** Enable Anthropic ephemeral cache on system prefix. */
  enablePromptCache?: boolean;
  /** Tool / model rounds already consumed in this request lifecycle. */
  toolRoundsUsed?: number;
};

export type AiInferenceResult = {
  text: string;
  provider: string;
  model: string;
  logicalRequestId: string;
  usage: NormalizedTokenUsage;
  estimatedCostUsdMicros: bigint;
  privacyPolicy: string;
  usedFallback: boolean;
  fallbackReason: string | null;
  budgetWarnings: number[];
  providerCallCount: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  const base = 200 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(2000, base + jitter);
}

function truncateEvidence(system: string, user: string): {
  system: string;
  user: string;
} {
  const cfg = getAiConfig();
  let sys = system;
  let usr = user;
  if (usr.length > cfg.limits.maxEvidenceChars) {
    usr =
      usr.slice(0, cfg.limits.maxEvidenceChars) +
      '\n\n[Evidence truncated by AI gateway context limit]';
  }
  if (sys.length > cfg.limits.maxEvidenceChars) {
    sys =
      sys.slice(0, cfg.limits.maxEvidenceChars) +
      '\n\n[System prompt truncated by AI gateway]';
  }
  return { system: sys, user: usr };
}

async function persistUsage(params: {
  logicalRequestId: string;
  organizationId: string;
  userId?: string;
  feature: AiFeatureId;
  subFeature?: string;
  workloadProfile: WorkloadProfile;
  provider: string;
  model: string;
  status: string;
  isFallback: boolean;
  originalProvider?: string;
  fallbackReason?: string;
  retryNumber: number;
  usage: NormalizedTokenUsage;
  costMicros: bigint;
  pricingVersion: string;
  calculationMode: string;
  latencyMs: number;
  errorCategory?: string;
  isBackground: boolean;
  privacyPolicy?: string;
}) {
  const legacyCents = microsToUsdCents(params.costMicros);
  await prisma.aiUsageEvent.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      logicalRequestId: params.logicalRequestId,
      provider: params.provider,
      model: params.model,
      feature: params.feature,
      subFeature: params.subFeature,
      workloadProfile: params.workloadProfile,
      status: params.status,
      isFallback: params.isFallback,
      originalProvider: params.originalProvider,
      fallbackReason: params.fallbackReason,
      retryNumber: params.retryNumber,
      inputTokens: params.usage.inputTokens,
      cachedInputTokens: params.usage.cachedInputTokens,
      cacheWriteTokens: params.usage.cacheWriteTokens,
      outputTokens: params.usage.outputTokens,
      reasoningTokens: params.usage.reasoningTokens,
      totalTokensReported: params.usage.totalTokensReported,
      estimatedCostUsdMicros: params.costMicros,
      estimatedCostUsdCents: legacyCents > 0 ? legacyCents : legacyCents,
      pricingVersion: params.pricingVersion,
      currency: 'USD',
      calculationMode: params.calculationMode,
      latencyMs: params.latencyMs,
      errorCategory: params.errorCategory,
      isBackground: params.isBackground,
      privacyPolicy: params.privacyPolicy,
      taskType: params.feature,
    },
  });
}

const emptyUsage = (): NormalizedTokenUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  reasoningBilledSeparately: false,
  totalTokensReported: null,
});

async function invokeRoute(
  route: ProviderRoute,
  system: string,
  user: string,
  enablePromptCache: boolean
): Promise<{
  text: string;
  model: string;
  usage: NormalizedTokenUsage;
  latencyMs: number;
  privacyPolicy: string;
}> {
  assertCircuitClosed(route.provider);
  await assertProviderBudgetAllows(
    route.provider,
    getAiConfig().limits.maxRequestCostUsdMicros
  );

  if (route.provider === 'anthropic') {
    return invokeAnthropic({
      model: route.model,
      system,
      user,
      maxOutputTokens: route.maxOutputTokens,
      effort: route.effort,
      enablePromptCache,
    });
  }
  return invokeOpenAI({
    model: route.model,
    system,
    user,
    maxOutputTokens: route.maxOutputTokens,
  });
}

/**
 * Execute one logical AI request with budget, retry, fallback, and telemetry.
 */
export async function runAiInference(
  req: AiInferenceRequest
): Promise<AiInferenceResult> {
  const cfg = getAiConfig();
  const { system, user } = truncateEvidence(req.system, req.user);

  const toolRoundsUsed = req.toolRoundsUsed ?? 0;
  if (toolRoundsUsed >= cfg.limits.maxToolRounds) {
    throw new AiGatewayError({
      code: 'AI_REQUEST_LIMIT_REACHED',
      message: 'Maximum AI tool rounds for this request reached',
      httpStatus: 429,
      retryable: false,
      details: { maxToolRounds: cfg.limits.maxToolRounds, toolRoundsUsed },
    });
  }

  if (req.idempotencyKey) {
    const existing = await prisma.aiLogicalRequest.findFirst({
      where: {
        organizationId: req.organizationId,
        idempotencyKey: req.idempotencyKey,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.resultSummary) {
      const summary = existing.resultSummary as {
        text?: string;
        provider?: string;
        model?: string;
      };
      if (summary.text) {
        return {
          text: summary.text,
          provider: summary.provider || 'cached',
          model: summary.model || 'idempotent',
          logicalRequestId: existing.id,
          usage: emptyUsage(),
          estimatedCostUsdMicros: BigInt(existing.totalCostUsdMicros),
          privacyPolicy: 'idempotent_replay',
          usedFallback: false,
          fallbackReason: null,
          budgetWarnings: [],
          providerCallCount: existing.providerCallCount,
        };
      }
    }
  }

  let budgetWarnings: number[] = [];
  try {
    const decision = await assertBudgetAllows({
      organizationId: req.organizationId,
      feature: req.feature,
      reserveMicros: cfg.limits.maxRequestCostUsdMicros,
      isBackground: req.isBackground,
    });
    budgetWarnings = decision.softWarnings;
  } catch (err) {
    if (err instanceof AiGatewayError && err.code === 'AI_BUDGET_EXCEEDED') {
      // Record budget block without calling providers
      const logical = await prisma.aiLogicalRequest.create({
        data: {
          id: randomUUID(),
          organizationId: req.organizationId,
          userId: req.userId,
          feature: req.feature,
          subFeature: req.subFeature,
          workloadProfile: req.workloadProfile,
          status: 'failed',
          isBackground: !!req.isBackground,
          idempotencyKey: req.idempotencyKey,
          errorCategory: 'AI_BUDGET_EXCEEDED',
          completedAt: new Date(),
          metadata: req.metadata as object | undefined,
        },
      });
      await persistUsage({
        logicalRequestId: logical.id,
        organizationId: req.organizationId,
        userId: req.userId,
        feature: req.feature,
        subFeature: req.subFeature,
        workloadProfile: req.workloadProfile,
        provider: 'none',
        model: 'budget-block',
        status: 'budget_blocked',
        isFallback: false,
        retryNumber: 0,
        usage: emptyUsage(),
        costMicros: 0n,
        pricingVersion: cfg.pricingVersion,
        calculationMode: 'zero',
        latencyMs: 0,
        errorCategory: 'AI_BUDGET_EXCEEDED',
        isBackground: !!req.isBackground,
      });
    }
    throw err;
  }

  let logicalRequestId = req.logicalRequestId;
  if (!logicalRequestId) {
    const logical = await prisma.aiLogicalRequest.create({
      data: {
        id: randomUUID(),
        organizationId: req.organizationId,
        userId: req.userId,
        feature: req.feature,
        subFeature: req.subFeature,
        workloadProfile: req.workloadProfile,
        status: 'in_progress',
        isBackground: !!req.isBackground,
        idempotencyKey: req.idempotencyKey,
        metadata: {
          ...(req.metadata || {}),
          toolRoundsUsed,
        } as object,
      },
    });
    logicalRequestId = logical.id;
  }

  const primary = resolvePrimaryRoute(req.workloadProfile);
  const fallback = resolveFallbackRoute(req.workloadProfile);

  let providerCallCount = 0;
  let totalCost = 0n;
  let usedFallback = false;
  let fallbackReason: string | null = null;

  const runWithRetries = async (
    route: ProviderRoute,
    isFallback: boolean,
    originalProvider?: string,
    reason?: string
  ) => {
    let lastError: AiGatewayError | null = null;
    for (let retry = 0; retry <= cfg.limits.maxProviderRetries; retry++) {
      if (providerCallCount >= cfg.limits.maxProviderCallsPerRequest) {
        throw new AiGatewayError({
          code: 'AI_REQUEST_LIMIT_REACHED',
          message: 'Maximum AI provider calls for this request reached',
          httpStatus: 429,
          retryable: false,
        });
      }
      if (totalCost >= cfg.limits.maxRequestCostUsdMicros) {
        throw new AiGatewayError({
          code: 'AI_REQUEST_LIMIT_REACHED',
          message: 'Maximum AI cost for this request reached',
          httpStatus: 429,
          retryable: false,
        });
      }

      providerCallCount += 1;
      try {
        const result = await invokeRoute(
          route,
          system,
          user,
          !!req.enablePromptCache && route.provider === 'anthropic'
        );
        const cost = calculateUsageCost({
          provider: route.provider,
          model: result.model,
          usage: result.usage,
          pricingVersion: cfg.pricingVersion,
        });
        totalCost += cost.estimatedCostUsdMicros;
        recordCircuitSuccess(route.provider);

        await persistUsage({
          logicalRequestId: logicalRequestId!,
          organizationId: req.organizationId,
          userId: req.userId,
          feature: req.feature,
          subFeature: req.subFeature,
          workloadProfile: req.workloadProfile,
          provider: route.provider,
          model: result.model,
          status: 'success',
          isFallback,
          originalProvider,
          fallbackReason: isFallback ? reason : undefined,
          retryNumber: retry,
          usage: result.usage,
          costMicros: cost.estimatedCostUsdMicros,
          pricingVersion: cfg.pricingVersion,
          calculationMode: cost.calculationMode,
          latencyMs: result.latencyMs,
          isBackground: !!req.isBackground,
          privacyPolicy: result.privacyPolicy,
        });

        if (process.env.NODE_ENV !== 'production') {
          console.log(
            JSON.stringify({
              msg: 'ai.usage',
              logicalRequestId,
              organizationId: req.organizationId,
              feature: req.feature,
              provider: route.provider,
              model: result.model,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              cachedInputTokens: result.usage.cachedInputTokens,
              costUsdMicros: cost.estimatedCostUsdMicros.toString(),
              latencyMs: result.latencyMs,
              isFallback,
              retry,
              // Never log system/user content
            })
          );
        }

        return result;
      } catch (err) {
        const gatewayErr =
          err instanceof AiGatewayError
            ? err
            : new AiGatewayError({
                code: 'AI_PROVIDER_UNAVAILABLE',
                message: 'Provider call failed',
                retryable: true,
                eligibleForCrossProviderFallback: true,
              });
        lastError = gatewayErr;

        if (
          gatewayErr.code === 'AI_PROVIDER_UNAVAILABLE' ||
          gatewayErr.code === 'AI_TIMEOUT' ||
          gatewayErr.code === 'AI_CIRCUIT_OPEN'
        ) {
          recordCircuitFailure(route.provider);
        }

        await persistUsage({
          logicalRequestId: logicalRequestId!,
          organizationId: req.organizationId,
          userId: req.userId,
          feature: req.feature,
          subFeature: req.subFeature,
          workloadProfile: req.workloadProfile,
          provider: route.provider,
          model: route.model,
          status:
            gatewayErr.code === 'AI_BUDGET_EXCEEDED'
              ? 'budget_blocked'
              : 'error',
          isFallback,
          originalProvider,
          fallbackReason: isFallback ? reason : undefined,
          retryNumber: retry,
          usage: emptyUsage(),
          costMicros: 0n,
          pricingVersion: cfg.pricingVersion,
          calculationMode: 'zero',
          latencyMs: 0,
          errorCategory: gatewayErr.code,
          isBackground: !!req.isBackground,
        });

        // Same-provider retry only for retryable transient errors
        if (!gatewayErr.retryable || retry >= cfg.limits.maxProviderRetries) {
          break;
        }
        // Do not retry auth / safety / invalid / budget
        if (
          gatewayErr.code === 'AI_AUTH_FAILED' ||
          gatewayErr.code === 'AI_POLICY_REJECTED' ||
          gatewayErr.code === 'AI_INVALID_REQUEST' ||
          gatewayErr.code === 'AI_BUDGET_EXCEEDED'
        ) {
          break;
        }
        await sleep(backoffMs(retry));
      }
    }
    throw (
      lastError ||
      new AiGatewayError({
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: 'Provider call failed',
        eligibleForCrossProviderFallback: true,
      })
    );
  };

  try {
    let result;
    try {
      result = await runWithRetries(primary, false);
    } catch (primaryErr) {
      const canFallback =
        fallback &&
        cfg.routing.fallbackEnabled &&
        cfg.limits.maxFallbackAttempts > 0 &&
        isEligibleForCrossProviderFallback(primaryErr);

      if (!canFallback || !fallback) {
        throw primaryErr;
      }

      // One fallback provider chain only — no ping-pong
      usedFallback = true;
      fallbackReason =
        primaryErr instanceof AiGatewayError
          ? primaryErr.code
          : 'AI_PROVIDER_UNAVAILABLE';
      result = await runWithRetries(
        fallback,
        true,
        primary.provider,
        fallbackReason
      );
    }

    await prisma.aiLogicalRequest.update({
      where: { id: logicalRequestId },
      data: {
        status: 'completed',
        providerCallCount,
        totalCostUsdMicros: totalCost,
        completedAt: new Date(),
        resultSummary: {
          provider:
            usedFallback && fallback ? fallback.provider : primary.provider,
          model: result?.model,
          text: undefined,
          usedFallback,
          fallbackReason,
        },
      },
    });

    if (req.idempotencyKey && result) {
      await prisma.aiLogicalRequest.update({
        where: { id: logicalRequestId },
        data: {
          resultSummary: {
            provider:
              usedFallback && fallback ? fallback.provider : primary.provider,
            model: result.model,
            text: result.text,
            usedFallback,
            fallbackReason,
          },
        },
      });
    }

    return {
      text: result.text,
      provider: usedFallback && fallback ? fallback.provider : primary.provider,
      model: result.model,
      logicalRequestId: logicalRequestId!,
      usage: result.usage,
      estimatedCostUsdMicros: totalCost,
      privacyPolicy: result.privacyPolicy,
      usedFallback,
      fallbackReason,
      budgetWarnings,
      providerCallCount,
    };
  } catch (err) {
    await prisma.aiLogicalRequest.update({
      where: { id: logicalRequestId },
      data: {
        status: 'failed',
        providerCallCount,
        totalCostUsdMicros: totalCost,
        completedAt: new Date(),
        errorCategory:
          err instanceof AiGatewayError ? err.code : 'AI_SERVICE_UNAVAILABLE',
      },
    });
    throw err;
  }
}

/** Deterministic local text when all providers fail — not a billable call. */
export async function recordLocalFallback(params: {
  organizationId: string;
  userId?: string;
  feature: AiFeatureId;
  workloadProfile: WorkloadProfile;
  logicalRequestId?: string;
  isBackground?: boolean;
  text: string;
}): Promise<AiInferenceResult> {
  let logicalRequestId = params.logicalRequestId;
  if (!logicalRequestId) {
    const logical = await prisma.aiLogicalRequest.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        feature: params.feature,
        workloadProfile: params.workloadProfile,
        status: 'completed',
        isBackground: !!params.isBackground,
        providerCallCount: 0,
        totalCostUsdMicros: 0n,
        completedAt: new Date(),
      },
    });
    logicalRequestId = logical.id;
  }

  const cfg = getAiConfig();
  await persistUsage({
    logicalRequestId,
    organizationId: params.organizationId,
    userId: params.userId,
    feature: params.feature,
    workloadProfile: params.workloadProfile,
    provider: 'local',
    model: 'deterministic-fallback',
    status: 'success',
    isFallback: true,
    originalProvider: 'anthropic',
    fallbackReason: 'all_external_unavailable',
    retryNumber: 0,
    usage: emptyUsage(),
    costMicros: 0n,
    pricingVersion: cfg.pricingVersion,
    calculationMode: 'zero',
    latencyMs: 0,
    isBackground: !!params.isBackground,
    privacyPolicy: 'local_no_external_call',
  });

  return {
    text: params.text,
    provider: 'local',
    model: 'deterministic-fallback',
    logicalRequestId,
    usage: emptyUsage(),
    estimatedCostUsdMicros: 0n,
    privacyPolicy: 'local_no_external_call',
    usedFallback: true,
    fallbackReason: 'all_external_unavailable',
    budgetWarnings: [],
    providerCallCount: 0,
  };
}
