/**
 * Pre-call budget enforcement with concurrency-safe locking.
 * Covers org/global daily+monthly caps and per-provider monthly caps.
 */

import prisma from '../../config/prisma';
import {
  getAiConfig,
  usdToMicros,
  AiFeatureId,
  AiProviderName,
} from './aiConfig';
import { AiGatewayError } from './aiErrors';

export type BudgetDecision = {
  allowed: boolean;
  softWarnings: number[];
  orgMonthlySpentMicros: bigint;
  orgDailySpentMicros: bigint;
  orgMonthlyBudgetMicros: bigint;
  orgDailyBudgetMicros: bigint;
  globalMonthlySpentMicros: bigint;
  globalMonthlyBudgetMicros: bigint;
  highestThresholdHit: number | null;
};

function startOfUtcDay(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function startOfUtcMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function toBig(v: bigint | number | null | undefined): bigint {
  if (v == null) return 0n;
  return typeof v === 'bigint' ? v : BigInt(v);
}

async function sumSpendMicros(where: {
  organizationId?: string;
  feature?: string;
  provider?: string;
  createdAt: { gte: Date };
}): Promise<bigint> {
  const agg = await prisma.aiUsageEvent.aggregate({
    where: {
      ...where,
      status: { in: ['success', 'error', 'budget_blocked'] },
    },
    _sum: { estimatedCostUsdMicros: true },
  });
  return toBig(agg._sum.estimatedCostUsdMicros);
}

export async function resolveOrgBudgets(organizationId: string): Promise<{
  monthlyMicros: bigint;
  dailyMicros: bigint;
  featureMonthlyMicros: Map<string, bigint>;
  hardBlockAtPercent: number;
  softThresholds: number[];
}> {
  const cfg = getAiConfig();
  const rows = await prisma.aiBudgetConfig.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: 'ORGANIZATION', organizationId },
        { scope: 'FEATURE', organizationId },
        { scope: 'GLOBAL' },
      ],
    },
  });

  let monthlyMicros = usdToMicros(cfg.budgets.defaultOrgMonthlyUsd);
  let dailyMicros = usdToMicros(cfg.budgets.defaultOrgDailyUsd);
  let hardBlockAtPercent = cfg.budgets.hardBlockAtPercent;
  let softThresholds = [...cfg.budgets.softThresholdsPercent];
  const featureMonthlyMicros = new Map<string, bigint>();

  for (const row of rows) {
    if (row.scope === 'ORGANIZATION' && row.organizationId === organizationId) {
      if (row.monthlyBudgetUsdMicros != null) {
        monthlyMicros = BigInt(row.monthlyBudgetUsdMicros);
      }
      if (row.dailyBudgetUsdMicros != null) {
        dailyMicros = BigInt(row.dailyBudgetUsdMicros);
      }
      hardBlockAtPercent = row.hardBlockAtPercent;
      if (Array.isArray(row.softThresholdsPercent)) {
        softThresholds = (row.softThresholdsPercent as number[]).filter(
          (n) => typeof n === 'number'
        );
      }
    }
    if (
      row.scope === 'FEATURE' &&
      row.organizationId === organizationId &&
      row.feature &&
      row.monthlyBudgetUsdMicros != null
    ) {
      featureMonthlyMicros.set(row.feature, BigInt(row.monthlyBudgetUsdMicros));
    }
  }

  return {
    monthlyMicros,
    dailyMicros,
    featureMonthlyMicros,
    hardBlockAtPercent,
    softThresholds,
  };
}

function percentUsed(spent: bigint, budget: bigint): number {
  if (budget <= 0n) return 0;
  return Number((spent * 10000n) / budget) / 100;
}

function emitBudgetWarning(params: {
  scope: string;
  organizationId?: string;
  provider?: string;
  percent: number;
  spentUsdMicros: string;
  budgetUsdMicros: string;
}) {
  console.log(
    JSON.stringify({
      msg: 'ai.budget.warning',
      ...params,
      // Never log prompts or secrets
    })
  );
}

/**
 * Lock per-organization AI spend gate, then evaluate org/global budgets.
 */
export async function assertBudgetAllows(params: {
  organizationId: string;
  feature: AiFeatureId;
  reserveMicros: bigint;
  isBackground?: boolean;
}): Promise<BudgetDecision> {
  const cfg = getAiConfig();

  return prisma.$transaction(async (tx) => {
    await tx.aiOrgSpendLock.upsert({
      where: { organizationId: params.organizationId },
      create: { organizationId: params.organizationId },
      update: { updatedAt: new Date() },
    });
    await tx.$executeRaw`
      SELECT "organizationId" FROM "ai_org_spend_locks"
      WHERE "organizationId" = ${params.organizationId}
      FOR UPDATE
    `;

    const budgets = await resolveOrgBudgets(params.organizationId);
    const monthStart = startOfUtcMonth();
    const dayStart = startOfUtcDay();

    const [orgMonthlyAgg, orgDailyAgg, globalMonthlyAgg, globalDailyAgg] =
      await Promise.all([
        tx.aiUsageEvent.aggregate({
          where: {
            organizationId: params.organizationId,
            createdAt: { gte: monthStart },
            status: { in: ['success', 'error', 'budget_blocked'] },
          },
          _sum: { estimatedCostUsdMicros: true },
        }),
        tx.aiUsageEvent.aggregate({
          where: {
            organizationId: params.organizationId,
            createdAt: { gte: dayStart },
            status: { in: ['success', 'error', 'budget_blocked'] },
          },
          _sum: { estimatedCostUsdMicros: true },
        }),
        tx.aiUsageEvent.aggregate({
          where: {
            createdAt: { gte: monthStart },
            status: { in: ['success', 'error', 'budget_blocked'] },
          },
          _sum: { estimatedCostUsdMicros: true },
        }),
        tx.aiUsageEvent.aggregate({
          where: {
            createdAt: { gte: dayStart },
            status: { in: ['success', 'error', 'budget_blocked'] },
          },
          _sum: { estimatedCostUsdMicros: true },
        }),
      ]);

    const orgMonthlySpentMicros = toBig(
      orgMonthlyAgg._sum.estimatedCostUsdMicros
    );
    const orgDailySpentMicros = toBig(orgDailyAgg._sum.estimatedCostUsdMicros);
    const globalMonthlySpentMicros = toBig(
      globalMonthlyAgg._sum.estimatedCostUsdMicros
    );
    const globalDailySpentMicros = toBig(
      globalDailyAgg._sum.estimatedCostUsdMicros
    );

    const globalMonthlyBudgetMicros = usdToMicros(cfg.budgets.globalMonthlyUsd);
    const globalDailyBudgetMicros = usdToMicros(cfg.budgets.globalDailyUsd);

    const projectedOrgMonth = orgMonthlySpentMicros + params.reserveMicros;
    const projectedOrgDay = orgDailySpentMicros + params.reserveMicros;
    const projectedGlobalMonth =
      globalMonthlySpentMicros + params.reserveMicros;
    const projectedGlobalDay = globalDailySpentMicros + params.reserveMicros;

    const softWarnings: number[] = [];
    let highestThresholdHit: number | null = null;
    const orgPct = percentUsed(projectedOrgMonth, budgets.monthlyMicros);
    for (const t of [...budgets.softThresholds].sort((a, b) => a - b)) {
      if (orgPct >= t) {
        softWarnings.push(t);
        highestThresholdHit = t;
        emitBudgetWarning({
          scope: 'organization_monthly',
          organizationId: params.organizationId,
          percent: t,
          spentUsdMicros: orgMonthlySpentMicros.toString(),
          budgetUsdMicros: budgets.monthlyMicros.toString(),
        });
      }
    }

    const hard = budgets.hardBlockAtPercent;

    const block = (reason: string, details: Record<string, unknown>) => {
      throw new AiGatewayError({
        code: 'AI_BUDGET_EXCEEDED',
        message: reason,
        httpStatus: 429,
        retryable: false,
        eligibleForCrossProviderFallback: false,
        details,
      });
    };

    if (
      budgets.monthlyMicros > 0n &&
      percentUsed(projectedOrgMonth, budgets.monthlyMicros) >= hard
    ) {
      block('Organization monthly AI budget exceeded', {
        scope: 'organization_monthly',
        spentUsdMicros: orgMonthlySpentMicros.toString(),
        budgetUsdMicros: budgets.monthlyMicros.toString(),
      });
    }
    if (
      budgets.dailyMicros > 0n &&
      percentUsed(projectedOrgDay, budgets.dailyMicros) >= hard
    ) {
      block('Organization daily AI budget exceeded', {
        scope: 'organization_daily',
        spentUsdMicros: orgDailySpentMicros.toString(),
        budgetUsdMicros: budgets.dailyMicros.toString(),
      });
    }
    if (
      globalMonthlyBudgetMicros > 0n &&
      percentUsed(projectedGlobalMonth, globalMonthlyBudgetMicros) >= hard
    ) {
      block('Application monthly AI budget exceeded', {
        scope: 'global_monthly',
        spentUsdMicros: globalMonthlySpentMicros.toString(),
        budgetUsdMicros: globalMonthlyBudgetMicros.toString(),
      });
    }
    if (
      globalDailyBudgetMicros > 0n &&
      percentUsed(projectedGlobalDay, globalDailyBudgetMicros) >= hard
    ) {
      block('Application daily AI budget exceeded', {
        scope: 'global_daily',
        spentUsdMicros: globalDailySpentMicros.toString(),
        budgetUsdMicros: globalDailyBudgetMicros.toString(),
      });
    }

    const featureCap = budgets.featureMonthlyMicros.get(params.feature);
    if (featureCap != null && featureCap > 0n) {
      const featureAgg = await tx.aiUsageEvent.aggregate({
        where: {
          organizationId: params.organizationId,
          feature: params.feature,
          createdAt: { gte: monthStart },
          status: { in: ['success', 'error', 'budget_blocked'] },
        },
        _sum: { estimatedCostUsdMicros: true },
      });
      const featureSpent = toBig(featureAgg._sum.estimatedCostUsdMicros);
      if (
        percentUsed(featureSpent + params.reserveMicros, featureCap) >= hard
      ) {
        block('Feature monthly AI budget exceeded', {
          scope: 'feature_monthly',
          feature: params.feature,
          spentUsdMicros: featureSpent.toString(),
          budgetUsdMicros: featureCap.toString(),
        });
      }
    }

    if (
      params.isBackground &&
      highestThresholdHit != null &&
      highestThresholdHit >= 90
    ) {
      block('Background AI paused while organization AI budget is critical', {
        scope: 'background_guardrail',
        threshold: highestThresholdHit,
      });
    }

    return {
      allowed: true,
      softWarnings,
      orgMonthlySpentMicros,
      orgDailySpentMicros,
      orgMonthlyBudgetMicros: budgets.monthlyMicros,
      orgDailyBudgetMicros: budgets.dailyMicros,
      globalMonthlySpentMicros,
      globalMonthlyBudgetMicros,
      highestThresholdHit,
    };
  });
}

/**
 * Provider-level monthly application cap (Anthropic / OpenAI).
 * Call before each external provider attempt.
 */
export async function assertProviderBudgetAllows(
  provider: AiProviderName,
  reserveMicros: bigint
): Promise<void> {
  const cfg = getAiConfig();
  const capUsd =
    provider === 'anthropic'
      ? cfg.budgets.anthropicMonthlyUsd
      : cfg.budgets.openaiMonthlyUsd;
  if (capUsd <= 0) return;

  const budgetMicros = usdToMicros(capUsd);
  const monthStart = startOfUtcMonth();
  const spent = await sumSpendMicros({
    provider,
    createdAt: { gte: monthStart },
  });
  const hard = cfg.budgets.hardBlockAtPercent;
  const projected = spent + reserveMicros;
  const pct = percentUsed(projected, budgetMicros);

  for (const t of cfg.budgets.softThresholdsPercent) {
    if (pct >= t) {
      emitBudgetWarning({
        scope: 'provider_monthly',
        provider,
        percent: t,
        spentUsdMicros: spent.toString(),
        budgetUsdMicros: budgetMicros.toString(),
      });
    }
  }

  if (pct >= hard) {
    throw new AiGatewayError({
      code: 'AI_BUDGET_EXCEEDED',
      message: `${provider} monthly application AI budget exceeded`,
      httpStatus: 429,
      retryable: false,
      eligibleForCrossProviderFallback: provider === 'anthropic',
      details: {
        scope: 'provider_monthly',
        provider,
        spentUsdMicros: spent.toString(),
        budgetUsdMicros: budgetMicros.toString(),
      },
    });
  }
}

export async function getOrgSpendSnapshot(organizationId: string) {
  const monthStart = startOfUtcMonth();
  const dayStart = startOfUtcDay();
  const budgets = await resolveOrgBudgets(organizationId);
  const [monthlySpentMicros, dailySpentMicros] = await Promise.all([
    sumSpendMicros({
      organizationId,
      createdAt: { gte: monthStart },
    }),
    sumSpendMicros({
      organizationId,
      createdAt: { gte: dayStart },
    }),
  ]);
  return {
    monthStart,
    dayStart,
    monthlySpentMicros,
    dailySpentMicros,
    monthlyBudgetMicros: budgets.monthlyMicros,
    dailyBudgetMicros: budgets.dailyMicros,
  };
}
