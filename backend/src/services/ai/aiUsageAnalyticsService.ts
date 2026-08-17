/**
 * Tenant-scoped and (optional) platform AI cost analytics.
 * Never returns prompts or model response bodies.
 */

import prisma from '../../config/prisma';
import { getAiConfig, usdToMicros } from './aiConfig';
import { formatUsdFromMicros } from './modelPricing';
import { getOrgSpendSnapshot, resolveOrgBudgets } from './budgetService';

function startOfUtcMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function toBig(v: bigint | number | null | undefined): bigint {
  if (v == null) return 0n;
  return typeof v === 'bigint' ? v : BigInt(v);
}

function microsJson(v: bigint) {
  return {
    usdMicros: v.toString(),
    usdDisplay: formatUsdFromMicros(v),
  };
}

export async function getOrganizationAiUsageAnalytics(
  organizationId: string,
  opts?: { from?: Date; to?: Date }
) {
  const from = opts?.from ?? startOfUtcMonth();
  const to = opts?.to ?? new Date();
  const cfg = getAiConfig();

  const where = {
    organizationId,
    createdAt: { gte: from, lte: to },
  };

  const events = await prisma.aiUsageEvent.findMany({
    where,
    select: {
      provider: true,
      model: true,
      feature: true,
      status: true,
      isFallback: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
      cacheWriteTokens: true,
      estimatedCostUsdMicros: true,
      logicalRequestId: true,
    },
  });

  let totalCost = 0n;
  let anthropicCost = 0n;
  let openaiCost = 0n;
  let success = 0;
  let failed = 0;
  let fallback = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  const logicalIds = new Set<string>();

  const byProvider = new Map<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cost: bigint;
    }
  >();
  const byModel = new Map<
    string,
    { calls: number; tokens: number; cost: bigint }
  >();
  const byFeature = new Map<
    string,
    { calls: number; cost: bigint }
  >();

  for (const e of events) {
    const cost = toBig(e.estimatedCostUsdMicros);
    totalCost += cost;
    if (e.provider === 'anthropic') anthropicCost += cost;
    if (e.provider === 'openai') openaiCost += cost;
    if (e.status === 'success') success += 1;
    else if (e.status === 'error') failed += 1;
    if (e.isFallback) fallback += 1;
    inputTokens += e.inputTokens;
    outputTokens += e.outputTokens;
    cachedTokens += e.cachedInputTokens;
    if (e.logicalRequestId) logicalIds.add(e.logicalRequestId);

    const p = byProvider.get(e.provider) || {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0n,
    };
    p.calls += 1;
    p.inputTokens += e.inputTokens;
    p.outputTokens += e.outputTokens;
    p.cachedTokens += e.cachedInputTokens;
    p.cost += cost;
    byProvider.set(e.provider, p);

    const mKey = `${e.provider}:${e.model}`;
    const m = byModel.get(mKey) || { calls: 0, tokens: 0, cost: 0n };
    m.calls += 1;
    m.tokens += e.inputTokens + e.outputTokens + e.cachedInputTokens;
    m.cost += cost;
    byModel.set(mKey, m);

    const feat = e.feature || 'unknown';
    const f = byFeature.get(feat) || { calls: 0, cost: 0n };
    f.calls += 1;
    f.cost += cost;
    byFeature.set(feat, f);
  }

  const spend = await getOrgSpendSnapshot(organizationId);
  const budgets = await resolveOrgBudgets(organizationId);
  const logicalRequestCount = logicalIds.size || success;
  const avgCostPerCall =
    events.length > 0 ? totalCost / BigInt(events.length) : 0n;
  const avgCostPerLogicalRequest =
    logicalRequestCount > 0
      ? totalCost / BigInt(logicalRequestCount)
      : 0n;

  const totalForPct = totalCost > 0n ? totalCost : 1n;

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    pricingVersion: cfg.pricingVersion,
    currentPeriod: {
      totalAiSpend: microsJson(totalCost),
      anthropicSpend: microsJson(anthropicCost),
      openaiSpend: microsJson(openaiCost),
      totalModelCalls: events.length,
      successfulCalls: success,
      failedCalls: failed,
      fallbackCalls: fallback,
      fallbackRatePercent:
        events.length > 0
          ? Math.round((fallback / events.length) * 10000) / 100
          : 0,
      averageCostPerProviderCall: microsJson(avgCostPerCall),
      averageCostPerLogicalRequest: microsJson(avgCostPerLogicalRequest),
      logicalRequestCount,
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedTokens,
      cacheReadSavingsNote:
        'Cache-read tokens are priced below normal input in the registry; see byProvider.cachedTokens.',
    },
    budget: {
      monthly: {
        ...microsJson(spend.monthlySpentMicros),
        budget: microsJson(spend.monthlyBudgetMicros),
        percentUsed:
          spend.monthlyBudgetMicros > 0n
            ? Number(
                (spend.monthlySpentMicros * 10000n) /
                  spend.monthlyBudgetMicros
              ) / 100
            : 0,
      },
      daily: {
        ...microsJson(spend.dailySpentMicros),
        budget: microsJson(spend.dailyBudgetMicros),
        percentUsed:
          spend.dailyBudgetMicros > 0n
            ? Number(
                (spend.dailySpentMicros * 10000n) / spend.dailyBudgetMicros
              ) / 100
            : 0,
      },
      softThresholdsPercent: budgets.softThresholds,
      hardBlockAtPercent: budgets.hardBlockAtPercent,
    },
    byProvider: [...byProvider.entries()].map(([provider, v]) => ({
      provider,
      calls: v.calls,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      cachedTokens: v.cachedTokens,
      estimatedCost: microsJson(v.cost),
    })),
    byModel: [...byModel.entries()].map(([key, v]) => {
      const [provider, ...rest] = key.split(':');
      return {
        provider,
        model: rest.join(':'),
        calls: v.calls,
        tokens: v.tokens,
        estimatedCost: microsJson(v.cost),
        averageCostPerCall: microsJson(
          v.calls > 0 ? v.cost / BigInt(v.calls) : 0n
        ),
      };
    }),
    byFeature: [...byFeature.entries()]
      .map(([feature, v]) => ({
        feature,
        calls: v.calls,
        estimatedCost: microsJson(v.cost),
        averageCostPerCall: microsJson(
          v.calls > 0 ? v.cost / BigInt(v.calls) : 0n
        ),
        percentOfTotalSpend:
          Math.round(Number((v.cost * 10000n) / totalForPct)) / 100,
      }))
      .sort((a, b) =>
        a.estimatedCost.usdMicros < b.estimatedCost.usdMicros ? 1 : -1
      ),
    organization: {
      organizationId,
      aiSpendThisMonth: microsJson(spend.monthlySpentMicros),
      callsThisPeriod: events.length,
      averageCostPerCall: microsJson(avgCostPerCall),
      configuredMonthlyBudget: microsJson(budgets.monthlyMicros),
      percentOfMonthlyBudgetUsed:
        budgets.monthlyMicros > 0n
          ? Number(
              (spend.monthlySpentMicros * 10000n) / budgets.monthlyMicros
            ) / 100
          : 0,
    },
  };
}

/**
 * Platform-wide rollup. Caller must authorize outside this function.
 */
export async function getPlatformAiUsageAnalytics(opts?: {
  from?: Date;
  to?: Date;
}) {
  const from = opts?.from ?? startOfUtcMonth();
  const to = opts?.to ?? new Date();
  const cfg = getAiConfig();

  const events = await prisma.aiUsageEvent.groupBy({
    by: ['organizationId'],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { estimatedCostUsdMicros: true },
  });

  const orgs = await prisma.organization.findMany({
    where: { id: { in: events.map((e) => e.organizationId) } },
    select: { id: true, name: true, slug: true },
  });
  const nameById = new Map(orgs.map((o) => [o.id, o]));

  const byOrganization = [];
  for (const row of events) {
    const budgets = await resolveOrgBudgets(row.organizationId);
    const spent = toBig(row._sum.estimatedCostUsdMicros);
    const org = nameById.get(row.organizationId);
    byOrganization.push({
      organizationId: row.organizationId,
      name: org?.name || row.organizationId,
      slug: org?.slug || null,
      calls: row._count._all,
      aiSpendThisMonth: microsJson(spent),
      averageCostPerCall: microsJson(
        row._count._all > 0 ? spent / BigInt(row._count._all) : 0n
      ),
      configuredMonthlyBudget: microsJson(budgets.monthlyMicros),
      percentOfMonthlyBudgetUsed:
        budgets.monthlyMicros > 0n
          ? Number((spent * 10000n) / budgets.monthlyMicros) / 100
          : 0,
    });
  }

  byOrganization.sort((a, b) =>
    a.aiSpendThisMonth.usdMicros < b.aiSpendThisMonth.usdMicros ? 1 : -1
  );

  const totalSpend = byOrganization.reduce(
    (acc, o) => acc + BigInt(o.aiSpendThisMonth.usdMicros),
    0n
  );
  const activeOrgs = byOrganization.filter((o) => o.calls > 0).length;

  // Reuse one org's detailed shape for totals via raw aggregates
  const allEvents = await prisma.aiUsageEvent.aggregate({
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: {
      estimatedCostUsdMicros: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
    },
  });

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    pricingVersion: cfg.pricingVersion,
    globalBudgets: {
      monthly: microsJson(usdToMicros(cfg.budgets.globalMonthlyUsd)),
      daily: microsJson(usdToMicros(cfg.budgets.globalDailyUsd)),
    },
    currentPeriod: {
      totalAiSpend: microsJson(toBig(allEvents._sum.estimatedCostUsdMicros)),
      totalModelCalls: allEvents._count._all,
      averageCostPerActiveOrganization: microsJson(
        activeOrgs > 0 ? totalSpend / BigInt(activeOrgs) : 0n
      ),
      activeOrganizations: activeOrgs,
      inputTokens: allEvents._sum.inputTokens || 0,
      outputTokens: allEvents._sum.outputTokens || 0,
      cachedInputTokens: allEvents._sum.cachedInputTokens || 0,
    },
    byOrganization,
    profitabilityNote:
      'Subscription revenue is not joined here yet. Use AI cost totals with plan prices (CA$49 / CA$99 / CA$199) offline until billing analytics ships.',
  };
}
