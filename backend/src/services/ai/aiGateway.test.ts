/**
 * AI gateway routing, budgets, fallback eligibility, and usage ledger tests.
 * Mocks Prisma + fetch. Never logs or asserts real API keys.
 */

jest.mock('../../config/prisma', () => {
  const usageCreates: unknown[] = [];
  const logicalCreates: unknown[] = [];
  const logicalUpdates: unknown[] = [];

  const tx = {
    aiOrgSpendLock: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    aiUsageEvent: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { estimatedCostUsdMicros: 0n },
      }),
    },
    aiBudgetConfig: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    __esModule: true,
    default: {
      __usageCreates: usageCreates,
      __logicalCreates: logicalCreates,
      __logicalUpdates: logicalUpdates,
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      aiBudgetConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      aiOrgSpendLock: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      aiLogicalRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: data.id || 'logical-1', ...data, providerCallCount: 0, totalCostUsdMicros: 0n };
          logicalCreates.push(row);
          return row;
        }),
        update: jest.fn(async ({ data }: { data: unknown }) => {
          logicalUpdates.push(data);
          return data;
        }),
      },
      aiUsageEvent: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          usageCreates.push(data);
          return data;
        }),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { estimatedCostUsdMicros: 0n },
        }),
      },
    },
  };
});

import prisma from '../../config/prisma';
import { runAiInference, recordLocalFallback } from './aiGateway';
import { AiGatewayError } from './aiErrors';
import { resetCircuitBreakersForTests } from './circuitBreaker';
import { getAiConfig } from './aiConfig';
import { calculateUsageCost } from './modelPricing';

type MockPrisma = typeof prisma & {
  __usageCreates: Array<Record<string, unknown>>;
  __logicalCreates: Array<Record<string, unknown>>;
  __logicalUpdates: unknown[];
};

const mockPrisma = prisma as MockPrisma;

function clearLedger() {
  mockPrisma.__usageCreates.length = 0;
  mockPrisma.__logicalCreates.length = 0;
  mockPrisma.__logicalUpdates.length = 0;
  (mockPrisma.aiLogicalRequest.findFirst as jest.Mock).mockResolvedValue(null);
  (mockPrisma.aiUsageEvent.aggregate as jest.Mock).mockResolvedValue({
    _sum: { estimatedCostUsdMicros: 0n },
  });
  // Reset transaction so earlier tests cannot leave a polluted budget mock
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    async (fn: (tx: {
      aiOrgSpendLock: { upsert: jest.Mock };
      $executeRaw: jest.Mock;
      aiUsageEvent: { aggregate: jest.Mock };
      aiBudgetConfig: { findMany: jest.Mock };
    }) => unknown) =>
      fn({
        aiOrgSpendLock: { upsert: jest.fn().mockResolvedValue({}) },
        $executeRaw: jest.fn().mockResolvedValue(0),
        aiBudgetConfig: { findMany: jest.fn().mockResolvedValue([]) },
        aiUsageEvent: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { estimatedCostUsdMicros: 0n },
          }),
        },
      })
  );
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
}

function anthropicOk(text = 'Anthropic answer') {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      content: [{ type: 'text', text }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
      model: 'claude-sonnet-5',
      stop_reason: 'end_turn',
    }),
  } as Response;
}

function openaiOk(text = 'OpenAI answer') {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 80, completion_tokens: 40 },
      model: 'gpt-5.6-terra',
    }),
  } as Response;
}

function httpError(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  } as Response;
}

const baseReq = {
  organizationId: 'org-1',
  userId: 'user-1',
  feature: 'ask_advisor' as const,
  workloadProfile: 'routine_advisor' as const,
  system: 'You are Advisor.',
  user: 'How many active students?',
  enablePromptCache: true,
};

describe('AI gateway routing and cost controls', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearLedger();
    resetCircuitBreakersForTests();
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.AI_MAX_PROVIDER_RETRIES = '0';
    process.env.AI_FALLBACK_ENABLED = 'true';
    process.env.AI_PRIMARY_PROVIDER = 'anthropic';
    process.env.AI_FALLBACK_PROVIDER = 'openai';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5';
    process.env.OPENAI_MODEL = 'gpt-5.6-terra';
    process.env.AI_MAX_OUTPUT_TOKENS = '4096';
    process.env.AI_MAX_TOOL_ROUNDS = '6';
    process.env.AI_ORG_DAILY_COST_CAP_USD = '2';
    process.env.AI_GLOBAL_DAILY_COST_CAP_USD = '5';
    process.env.ANTHROPIC_MONTHLY_COST_CAP_USD = '80';
    process.env.OPENAI_MONTHLY_COST_CAP_USD = '8';
    delete process.env.AI_ALLOW_EXPENSIVE_STRATEGIC_MODELS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('A. Anthropic success does not call OpenAI', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (input: string | URL) => {
      urls.push(String(input));
      expect(String(input)).toContain('api.anthropic.com');
      return anthropicOk();
    }) as typeof fetch;

    const result = await runAiInference(baseReq);
    expect(result.provider).toBe('anthropic');
    expect(result.model).toContain('claude-sonnet-5');
    expect(result.usedFallback).toBe(false);
    expect(urls.some((u) => u.includes('openai'))).toBe(false);
    expect(mockPrisma.__usageCreates.some((u) => u.provider === 'anthropic')).toBe(
      true
    );
    expect(mockPrisma.__usageCreates.some((u) => u.provider === 'openai')).toBe(
      false
    );
    // Usage ledger has no prompt/response content
    for (const row of mockPrisma.__usageCreates) {
      expect(safeJson(row)).not.toContain('How many active students');
      expect(safeJson(row)).not.toContain('You are Advisor');
      expect(safeJson(row)).not.toContain('test-anthropic-key');
    }
  });

  it('B. Eligible Anthropic transient failure falls back to OpenAI once', async () => {
    let anthropicCalls = 0;
    let openaiCalls = 0;
    global.fetch = jest.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('anthropic')) {
        anthropicCalls += 1;
        return httpError(529, 'overloaded');
      }
      openaiCalls += 1;
      return openaiOk('Fallback answer');
    }) as typeof fetch;

    const result = await runAiInference(baseReq);
    expect(result.provider).toBe('openai');
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(anthropicCalls).toBe(1);
    expect(openaiCalls).toBe(1);
    expect(result.text).toBe('Fallback answer');
  });

  it('C. Anthropic auth failure does not fall back to OpenAI', async () => {
    let openaiCalls = 0;
    global.fetch = jest.fn(async (input: string | URL) => {
      if (String(input).includes('openai')) {
        openaiCalls += 1;
        return openaiOk();
      }
      return httpError(401, 'invalid x-api-key');
    }) as typeof fetch;

    await expect(runAiInference(baseReq)).rejects.toMatchObject({
      code: 'AI_AUTH_FAILED',
    });
    expect(openaiCalls).toBe(0);
    expect(
      mockPrisma.__usageCreates.some((u) => u.errorCategory === 'AI_AUTH_FAILED')
    ).toBe(true);
  });

  it('D. Safety refusal does not fall back to OpenAI', async () => {
    let openaiCalls = 0;
    global.fetch = jest.fn(async (input: string | URL) => {
      if (String(input).includes('openai')) {
        openaiCalls += 1;
        return openaiOk();
      }
      return httpError(400, 'content policy safety refusal');
    }) as typeof fetch;

    await expect(runAiInference(baseReq)).rejects.toMatchObject({
      code: 'AI_POLICY_REJECTED',
    });
    expect(openaiCalls).toBe(0);
  });

  it('D2. Anthropic stop_reason refusal does not fall back', async () => {
    let openaiCalls = 0;
    global.fetch = jest.fn(async (input: string | URL) => {
      if (String(input).includes('openai')) {
        openaiCalls += 1;
        return openaiOk();
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          content: [{ type: 'text', text: '' }],
          usage: { input_tokens: 1, output_tokens: 0 },
          model: 'claude-sonnet-5',
          stop_reason: 'refusal',
        }),
      } as Response;
    }) as typeof fetch;

    await expect(runAiInference(baseReq)).rejects.toMatchObject({
      code: 'AI_POLICY_REJECTED',
    });
    expect(openaiCalls).toBe(0);
  });

  it('E. Both providers unavailable → caller can use local fallback', async () => {
    global.fetch = jest.fn(async () =>
      httpError(503, 'service unavailable')
    ) as typeof fetch;

    await expect(runAiInference(baseReq)).rejects.toBeInstanceOf(AiGatewayError);

    const local = await recordLocalFallback({
      organizationId: 'org-1',
      feature: 'ask_advisor',
      workloadProfile: 'routine_advisor',
      text: 'Deterministic enrolment diagnosis: Conversion Leak.',
    });
    expect(local.provider).toBe('local');
    expect(local.estimatedCostUsdMicros).toBe(0n);
    expect(local.text).toContain('Conversion Leak');
    expect(local.text).not.toMatch(/\d{3,} active students invented/i);
  });

  it('F. Anthropic monthly budget blocks Anthropic and allows OpenAI fallback', async () => {
    (mockPrisma.aiUsageEvent.aggregate as jest.Mock).mockImplementation(
      async (args: { where?: { provider?: string } }) => {
        if (args?.where?.provider === 'anthropic') {
          return { _sum: { estimatedCostUsdMicros: 80_000_000n } }; // $80
        }
        return { _sum: { estimatedCostUsdMicros: 0n } };
      }
    );

    let openaiCalls = 0;
    global.fetch = jest.fn(async (input: string | URL) => {
      if (String(input).includes('anthropic')) {
        throw new Error('should not call Anthropic when over cap');
      }
      openaiCalls += 1;
      return openaiOk('After anthropic budget');
    }) as typeof fetch;

    const result = await runAiInference(baseReq);
    expect(result.provider).toBe('openai');
    expect(openaiCalls).toBe(1);
    expect(
      mockPrisma.__usageCreates.some((u) => u.status === 'budget_blocked')
    ).toBe(true);
  });

  it('G. OpenAI fallback budget reached → no OpenAI call', async () => {
    (mockPrisma.aiUsageEvent.aggregate as jest.Mock).mockImplementation(
      async (args: { where?: { provider?: string } }) => {
        if (args?.where?.provider === 'openai') {
          return { _sum: { estimatedCostUsdMicros: 8_000_000n } }; // $8
        }
        return { _sum: { estimatedCostUsdMicros: 0n } };
      }
    );

    let openaiCalls = 0;
    global.fetch = jest.fn(async (input: string | URL) => {
      if (String(input).includes('anthropic')) {
        return httpError(503, 'unavailable');
      }
      openaiCalls += 1;
      return openaiOk();
    }) as typeof fetch;

    await expect(runAiInference(baseReq)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    expect(openaiCalls).toBe(0);
  });

  it('H. Organization daily cap blocks one tenant only', async () => {
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: {
        aiOrgSpendLock: { upsert: jest.Mock };
        $executeRaw: jest.Mock;
        aiUsageEvent: { aggregate: jest.Mock };
        aiBudgetConfig: { findMany: jest.Mock };
      }) => unknown) => {
        const tx = {
          aiOrgSpendLock: { upsert: jest.fn().mockResolvedValue({}) },
          $executeRaw: jest.fn().mockResolvedValue(0),
          aiBudgetConfig: { findMany: jest.fn().mockResolvedValue([]) },
          aiUsageEvent: {
            aggregate: jest.fn(
              async (args: {
                where?: { organizationId?: string; createdAt?: unknown };
              }) => {
                const orgId = args?.where?.organizationId;
                // Org daily for org-blocked is over cap ($2)
                if (orgId === 'org-blocked' && args?.where?.createdAt) {
                  return {
                    _sum: { estimatedCostUsdMicros: 2_000_000n },
                  };
                }
                return { _sum: { estimatedCostUsdMicros: 0n } };
              }
            ),
          },
        };
        return fn(tx);
      }
    );

    global.fetch = jest.fn(async () => anthropicOk()) as typeof fetch;

    await expect(
      runAiInference({ ...baseReq, organizationId: 'org-blocked' })
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });

    // Reset transaction mock to allow other org
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          aiOrgSpendLock: { upsert: jest.fn().mockResolvedValue({}) },
          $executeRaw: jest.fn().mockResolvedValue(0),
          aiBudgetConfig: { findMany: jest.fn().mockResolvedValue([]) },
          aiUsageEvent: {
            aggregate: jest.fn().mockResolvedValue({
              _sum: { estimatedCostUsdMicros: 0n },
            }),
          },
        })
    );

    const ok = await runAiInference({
      ...baseReq,
      organizationId: 'org-other',
    });
    expect(ok.provider).toBe('anthropic');
  });

  it('I. Global daily cap blocks additional external calls', async () => {
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: {
        aiOrgSpendLock: { upsert: jest.Mock };
        $executeRaw: jest.Mock;
        aiUsageEvent: { aggregate: jest.Mock };
        aiBudgetConfig: { findMany: jest.Mock };
      }) => unknown) => {
        let call = 0;
        const tx = {
          aiOrgSpendLock: { upsert: jest.fn().mockResolvedValue({}) },
          $executeRaw: jest.fn().mockResolvedValue(0),
          aiBudgetConfig: { findMany: jest.fn().mockResolvedValue([]) },
          aiUsageEvent: {
            aggregate: jest.fn(async () => {
              call += 1;
              // 4th aggregate in assertBudgetAllows is global daily
              if (call === 4) {
                return { _sum: { estimatedCostUsdMicros: 5_000_000n } };
              }
              return { _sum: { estimatedCostUsdMicros: 0n } };
            }),
          },
        };
        return fn(tx);
      }
    );

    global.fetch = jest.fn(async () => anthropicOk()) as typeof fetch;
    await expect(runAiInference(baseReq)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
  });

  it('J. Tool-round limit stops the loop', async () => {
    await expect(
      runAiInference({ ...baseReq, toolRoundsUsed: 6 })
    ).rejects.toMatchObject({ code: 'AI_REQUEST_LIMIT_REACHED' });
  });

  it('K. Output limit is applied to provider request', async () => {
    let body = '';
    global.fetch = jest.fn(async (_input: string | URL, init?: RequestInit) => {
      body = typeof init?.body === 'string' ? init.body : '';
      return anthropicOk();
    }) as typeof fetch;

    await runAiInference(baseReq);
    const parsed = JSON.parse(body) as { max_tokens: number; model: string };
    expect(parsed.max_tokens).toBe(getAiConfig().limits.outputTokens.routine_advisor);
    expect(parsed.model).toBe('claude-sonnet-5');
  });

  it('L. Usage ledger records tokens, provider, model, feature, cost — no prompts', async () => {
    global.fetch = jest.fn(async () => anthropicOk()) as typeof fetch;
    await runAiInference(baseReq);
    const success = mockPrisma.__usageCreates.find(
      (u) => u.status === 'success'
    )!;
    expect(success.provider).toBe('anthropic');
    expect(success.model).toBe('claude-sonnet-5');
    expect(success.feature).toBe('ask_advisor');
    expect(success.inputTokens).toBe(100);
    expect(success.outputTokens).toBe(50);
    expect(success.cachedInputTokens).toBe(10);
    expect(success.cacheWriteTokens).toBe(5);
    expect(Number(success.estimatedCostUsdMicros)).toBeGreaterThan(0);
    expect(safeJson(success)).not.toContain(baseReq.user);
    expect(safeJson(success)).not.toContain(baseReq.system);
  });

  it('M. Secrets never appear in usage telemetry or config exports', () => {
    const cfg = getAiConfig();
    expect(safeJson(cfg)).not.toContain('test-anthropic-key');
    expect(safeJson(cfg)).not.toContain('test-openai-key');
    expect(process.env.ANTHROPIC_API_KEY).toBeDefined();
  });

  it('N. Idempotent logical request does not re-call providers', async () => {
    (mockPrisma.aiLogicalRequest.findFirst as jest.Mock).mockResolvedValue({
      id: 'existing-logical',
      providerCallCount: 1,
      totalCostUsdMicros: 1234n,
      resultSummary: {
        text: 'Cached answer',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
      },
    });
    global.fetch = jest.fn(async () => {
      throw new Error('should not fetch');
    }) as typeof fetch;

    const result = await runAiInference({
      ...baseReq,
      idempotencyKey: 'daily-org-1-2026-08-16',
    });
    expect(result.text).toBe('Cached answer');
    expect(result.providerCallCount).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('pricing registry uses official Sonnet 5 / Terra rates', () => {
    const cost = calculateUsageCost({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1_000_000,
        reasoningTokens: 0,
        reasoningBilledSeparately: false,
        totalTokensReported: null,
      },
      pricingVersion: '2026-08-16.v2',
    });
    // $2 input + $10 output = $12 = 12_000_000 micros
    expect(cost.estimatedCostUsdMicros).toBe(12_000_000n);

    const terra = calculateUsageCost({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      usage: {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1_000_000,
        reasoningTokens: 0,
        reasoningBilledSeparately: false,
        totalTokensReported: null,
      },
      pricingVersion: '2026-08-16.v2',
    });
    // $2 + $12 = $14
    expect(terra.estimatedCostUsdMicros).toBe(14_000_000n);
  });
});
