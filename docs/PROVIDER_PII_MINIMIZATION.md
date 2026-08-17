# Provider PII minimization (Advisor inference)

## What this does

Before any Ask Advisor request is sent to Anthropic or OpenAI, the backend runs **deterministic, local PII minimization** so unnecessary personal identity is not disclosed to third-party inference providers.

This produces a **provider-safe context**: business evidence is preserved; personal identifiers are removed, generalized, or replaced with **request-scoped aliases** (pseudonymization within a single inference request).

This is **data minimization at the provider boundary**, not a claim of perfect anonymization.

## Where it sits

```text
Owner question + local tool results (tenant DB)
        ↓
minimizeForProviderInference()   ← providerPiiMinimizer.ts
        ↓
provider-safe question + tool JSON
        ↓
invokeProviderInference() / callProvider()
        ↓
Anthropic (primary) → OpenAI (fallback) → local text
```

Entry points:

| Module | Role |
|---|---|
| `backend/src/services/providerPiiMinimizer.ts` | Shared minimization policy |
| `backend/src/services/aiAdvisorService.ts` | Sole provider HTTP gateway (`invokeProviderInference`) |

All Anthropic/OpenAI traffic for Advisor must go through `askAdvisor` → `invokeProviderInference`. Do not add `fetch` calls to `api.anthropic.com` or `api.openai.com` elsewhere.

## Different from Help Improve Advisor

| Control | Question it answers |
|---|---|
| **Help Improve Advisor** / learning consent | May Somtico derive privacy-safe signals for cross-customer learning, benchmarks, and product improvement? |
| **Provider PII minimization** | What does Anthropic/OpenAI need to receive for *this* inference? |

They are independent:

- Opting **into** Help Improve Advisor does **not** mean raw student/parent/staff identities should be sent to inference providers.
- Opting **out** does **not** disable ordinary Advisor chat or this minimizer.

Do not merge these systems.

## What is normally removed or aliased

| Type | Typical treatment |
|---|---|
| Person names (students, parents, instructors, staff, customers) | Request-scoped aliases (`Instructor A`, `Student A`, …) |
| Email addresses | `[email removed]` |
| Phone numbers | `[phone removed]` |
| Street addresses / postal codes | Removed or generalized |
| Exact date of birth | Age band / `Age N` when computable |
| Person-linked DB ids (`personId`, `staffMemberId`, …) | Request-scoped refs |

Identity → alias maps stay **in-process for the request only**. They are **not** persisted, **not** logged, and **not** sent to the provider.

## What is normally preserved

- Programme / product / class / course names
- Roles, wages, hours, revenue, expenses, enrolment counts
- Attendance, conversion, capacity, operational and financial metrics
- Centre/branch names when they do not identify a private individual
- Dates and periods needed for analysis
- Evidence required for Advisor recommendations

Goal: keep analytical usefulness while reducing unnecessary identity disclosure.

## Adding a future provider feature

1. Build your prompt/context from application data as usual.
2. Call **`invokeProviderInference`** (or `minimizeForProviderInference` then the same `callProvider` path). Never call Anthropic/OpenAI HTTP APIs directly.
3. Pass **tool results / structured evidence** through the minimizer before serialization into the user message.
4. If you add provider tool/function calling later, minimize **tool results returned to the model** the same way — not only the first user message.
5. Prefer field-aware structured minimization; use free-text scrubbing as a second layer only.
6. Add an invariant test that fixture PII strings never appear in the mocked provider request body.
7. If a future central AI gateway wraps provider HTTP, call `minimizeForProviderInference` **before** that gateway sends `system`/`user` (or inside the gateway as the first step). Do not bypass this module.

## Logging

Log **minimization stats** (counts), provider, model, tokens, request/conversation ids — not raw prompts or alias lookup tables.

## How to test a new provider path

```bash
cd backend && npm test -- --maxWorkers=1 src/services/providerPiiMinimizer.test.ts
```

Include:

1. Unit cases on `minimizeForProviderInference` for your new fields.
2. A gateway test that mocks `fetch` and asserts fixture values such as `PII_TEST_STUDENT_JANE_SMITH` / `pii-test-parent@example.com` are absent from the outbound body for both Anthropic and OpenAI paths.

## Limitations

- Free-form text that invents novel names never seen in structured fields may not be aliased (emails/phones/street patterns are still scrubbed).
- Deterministic heuristics can miss unusual formats or over-generalize edge cases.
- This layer does not replace authorization, tenant isolation, or learning-consent controls.
