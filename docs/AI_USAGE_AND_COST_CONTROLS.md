# AI usage and cost controls

Business Advisor sends production AI inference through
`backend/src/services/ai/aiGateway.ts`. Feature services supply a workload
profile and privacy-minimized evidence. They do not select raw models or call a
provider API directly.

**Routing defaults and Railway checklist:** see
[AI_PROVIDER_ROUTING.md](./AI_PROVIDER_ROUTING.md).

## Request flow

1. The feature gathers deterministic, tenant-scoped evidence.
2. The provider PII minimizer removes direct identifiers.
3. The gateway checks organization, feature, provider, and application budgets.
4. `modelPolicy.ts` selects the primary route for the workload profile
   (Anthropic primary; OpenAI fallback when enabled).
5. The gateway makes a bounded provider call, records normalized token usage,
   and retries only transient same-provider failures.
6. Eligible outages may use one cross-provider fallback route. Safety,
   authentication, validation, and organization budget errors do not fall back.
7. `AiLogicalRequest` records the user-level operation. `AiUsageEvent` records
   each provider call without prompts or response bodies.

The process-local circuit breaker pauses a failing provider for a short
cooldown. Database spend locks serialize budget checks for each organization.

## Routing and configuration

`backend/src/services/ai/aiConfig.ts` owns model IDs, workload limits, retry
bounds, and default budgets. Environment variables override these defaults;
see `backend/.env.example`.

Default production models (official API IDs, verified 16 August 2026):

- Anthropic primary: `claude-sonnet-5` (`ANTHROPIC_MODEL`)
- OpenAI fallback: `gpt-5.6-terra` (`OPENAI_MODEL`)

Features request one of these profiles:

- `cheap_background`
- `routine_advisor`
- `standard_advisor`
- `complex_strategy`

Expensive strategic models stay disabled unless
`AI_ALLOW_EXPENSIVE_STRATEGIC_MODELS=true`.

## Pricing

`backend/src/services/ai/modelPricing.ts` is the only pricing registry. Prices
use integer USD micros per one million tokens. Update the effective date,
pricing version, official source links, and model rows together. Unknown models
use a conservative estimated fallback rate and are marked
`estimated_fallback`.

Official sources used for registry version `2026-08-16.v2`:

- https://platform.claude.com/docs/en/about-claude/pricing
- https://developers.openai.com/api/docs/models/gpt-5.6-terra

## Adding an AI feature

1. Add a stable feature ID to `AiFeatureId` in `aiConfig.ts`.
2. Gather tenant-scoped evidence and minimize it before inference.
3. Call `runAiInference` with the organization, user when available, feature,
   workload profile, system instructions, and dynamic evidence.
4. Use an idempotency key for retried jobs or client requests.
5. Keep prompts, provider credentials, and response bodies out of usage
   metadata and logs.
6. Add focused tests for routing, budget behaviour, and usage normalization.

## Analytics and budgets

Owners and administrators can read `GET /api/app/ai-usage`. Owners can set
organization daily and monthly USD budgets through
`PATCH /api/app/ai-usage/budget`. The AI Usage page reports estimated spend by
provider, model, and feature for operational cost control (not shown on
ordinary Ask Advisor responses). Budget enforcement uses USD micros even though
the organization may bill customers in CAD.

## Testing without provider credits

Unit tests mock Prisma and provider modules or `fetch`; they never need live
provider keys. Run:

```bash
npm test -- --testPathPattern=services/ai --maxWorkers=1
```

To exercise the deterministic path manually, leave provider keys unset. Do not
put production keys in test environment files or snapshots.
