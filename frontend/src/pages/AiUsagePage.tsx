import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type MoneyValue = {
  usdMicros: string;
  usdDisplay: string;
};

type AiUsageAnalytics = {
  period: { from: string; to: string };
  pricingVersion: string;
  currentPeriod: {
    totalAiSpend: MoneyValue;
    totalModelCalls: number;
    successfulCalls: number;
    failedCalls: number;
    fallbackCalls: number;
    logicalRequestCount: number;
  };
  budget: {
    monthly: MoneyValue & { budget: MoneyValue; percentUsed: number };
    daily: MoneyValue & { budget: MoneyValue; percentUsed: number };
  };
  byProvider: Array<{
    provider: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    estimatedCost: MoneyValue;
  }>;
  byModel: Array<{
    provider: string;
    model: string;
    calls: number;
    tokens: number;
    estimatedCost: MoneyValue;
  }>;
  byFeature: Array<{
    feature: string;
    calls: number;
    estimatedCost: MoneyValue;
    percentOfTotalSpend: number;
  }>;
};

function label(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function UsageTable({
  headings,
  rows,
}: {
  headings: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-base">
        <thead>
          <tr className="border-b border-ba-line">
            {headings.map((heading) => (
              <th key={heading} className="px-3 py-2 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b border-ba-line/70">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AiUsagePage() {
  const [data, setData] = useState<AiUsageAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ success: boolean; data: AiUsageAnalytics }>('/api/app/ai-usage')
      .then((response) => setData(response.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load AI usage.')
      );
  }, []);

  if (error) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">AI Usage</h1>
        <p className="mt-4 text-base text-ba-warm">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-base">Loading AI usage...</p>;
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">AI Usage</h1>
      <p className="mt-2 text-base text-ba-ink/70">
        Provider calls, estimated USD costs, and budget use for the current month.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <section className="border border-ba-line bg-white p-5">
          <h2 className="font-display text-xl font-bold">Current Spend</h2>
          <p className="mt-3 text-3xl font-bold">
            {data.currentPeriod.totalAiSpend.usdDisplay}
          </p>
          <p className="mt-2 text-base text-ba-ink/70">
            {data.currentPeriod.totalModelCalls} provider calls across{' '}
            {data.currentPeriod.logicalRequestCount} requests
          </p>
        </section>
        <section className="border border-ba-line bg-white p-5">
          <h2 className="font-display text-xl font-bold">Monthly Budget</h2>
          <p className="mt-3 text-3xl font-bold">
            {data.budget.monthly.percentUsed.toFixed(1)}%
          </p>
          <p className="mt-2 text-base text-ba-ink/70">
            {data.budget.monthly.usdDisplay} of{' '}
            {data.budget.monthly.budget.usdDisplay}
          </p>
        </section>
        <section className="border border-ba-line bg-white p-5">
          <h2 className="font-display text-xl font-bold">Call Health</h2>
          <p className="mt-3 text-3xl font-bold">
            {data.currentPeriod.successfulCalls}
          </p>
          <p className="mt-2 text-base text-ba-ink/70">
            {data.currentPeriod.failedCalls} failed and{' '}
            {data.currentPeriod.fallbackCalls} fallback calls
          </p>
        </section>
      </div>

      <section className="mt-8 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Spend by Provider</h2>
        <UsageTable
          headings={['Provider', 'Calls', 'Input Tokens', 'Output Tokens', 'Cost']}
          rows={data.byProvider.map((row) => [
            label(row.provider),
            row.calls,
            row.inputTokens,
            row.outputTokens,
            row.estimatedCost.usdDisplay,
          ])}
        />
      </section>

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Spend by Model</h2>
        <UsageTable
          headings={['Provider', 'Model', 'Calls', 'Tokens', 'Cost']}
          rows={data.byModel.map((row) => [
            label(row.provider),
            row.model,
            row.calls,
            row.tokens,
            row.estimatedCost.usdDisplay,
          ])}
        />
      </section>

      <section className="mt-6 border border-ba-line bg-white p-5">
        <h2 className="font-display text-2xl font-bold">Spend by Feature</h2>
        <UsageTable
          headings={['Feature', 'Calls', 'Share of Spend', 'Cost']}
          rows={data.byFeature.map((row) => [
            label(row.feature),
            row.calls,
            `${row.percentOfTotalSpend.toFixed(1)}%`,
            row.estimatedCost.usdDisplay,
          ])}
        />
      </section>

      <p className="mt-4 text-sm text-ba-ink/60">
        Estimated in USD using pricing registry {data.pricingVersion}.
      </p>
    </div>
  );
}
