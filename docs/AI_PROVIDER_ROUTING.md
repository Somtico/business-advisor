# AI provider routing and cost controls

**Shipped behaviour (16 August 2026):** Ask Advisor and all other external-model calls go through the centralized backend AI gateway (`backend/src/services/ai/`).

## Route

1. Deterministic Business Advisor tools / analytics (always first; the LLM is not the calculator)
2. **Anthropic** (primary) — default model `claude-sonnet-5` via `ANTHROPIC_MODEL`
3. **OpenAI** (fallback) — default model `gpt-5.6-terra` via `OPENAI_MODEL` — only for eligible transient provider failures
4. Deterministic / local fallback text from tool evidence when both externals fail

There is no race between providers. There is no Anthropic ↔ OpenAI ping-pong. One primary attempt chain plus at most one fallback-provider attempt chain.

## Eligible OpenAI fallback

Allowed: timeout, connection failure, 5xx / overloaded / rate-limit class failures, circuit-open, Anthropic monthly application cap reached (then try OpenAI once).

Not allowed: safety / content-policy refusal, invalid request, context too large, authentication / permission errors (401/403), model-id misconfiguration, “answer quality” dissatisfaction, insufficient data from tools.

## Cost controls (application-level)

| Variable | Default | Scope |
|---|---|---|
| `AI_GLOBAL_DAILY_COST_CAP_USD` | 5 | All orgs, UTC day |
| `AI_ORG_DAILY_COST_CAP_USD` | 2 | Per organization, UTC day |
| `ANTHROPIC_MONTHLY_COST_CAP_USD` | 80 | Anthropic provider spend |
| `OPENAI_MONTHLY_COST_CAP_USD` | 8 | OpenAI provider spend |

These coexist with provider-dashboard spend limits. Soft warnings at `AI_BUDGET_WARNING_PERCENTAGES` (default `50,80,100`) emit structured `ai.budget.warning` logs (no prompts).

## Other guardrails

- `AI_REQUEST_TIMEOUT_MS=30000` with AbortController cancellation
- `AI_MAX_OUTPUT_TOKENS=4096` (profile-specific ceilings also exist)
- `AI_MAX_TOOL_ROUNDS=6`
- Process-local circuit breaker after repeated outage failures
- Idempotency keys on logical requests prevent duplicate spend for the same key
- Anthropic prompt caching on stable system prefixes only (`enablePromptCache`)

## Privacy

Usage ledger (`ai_usage_events` / `ai_logical_requests`) stores operational metadata, tokens, routing, and estimated USD micros. It must not store raw prompts, responses, or PII. API keys are backend env only.

**Provider-boundary PII minimization** is separate from cost controls: Ask Advisor runs `minimizeForProviderInference` in `invokeProviderInference` **before** `runAiInference`, so Anthropic/OpenAI receive provider-safe context (request-scoped aliases; emails/phones/addresses scrubbed). See [PROVIDER_PII_MINIMIZATION.md](./PROVIDER_PII_MINIMIZATION.md). Do not call `runAiInference` with raw unminimized evidence.

## Customer UI

Provider and model names are not returned on Ask Advisor API success payloads and are not shown in ordinary product UI. Privacy Policy / Terms may name providers for legal transparency.

## Railway

See `backend/.env.example` for the full variable checklist. Set secrets `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` on the backend service only.
