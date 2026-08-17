# Somtico Business Advisor — Project Specification

**Product:** Somtico Business Advisor  
**Customer #1:** STEM Lantern Education Inc. (operating name STEM Lantern)  
**Portal data source (during rebrand):** Skill Samurai Saskatoon Registration Portal  
**Ports:** frontend 3007 · backend 5007  
**Revision:** Phase 0 + Phase 1 beachhead + advice impact ledger + pricing advisor + enrolment advisor + privacy policy + terms of service + Advisor branding (Somtico Business Advisor) + signup UX / email verification + public landing page + Cloudflare R2 daily DB backups + Claude-first advisor + operating-loop moat + proprietary intelligence flywheel foundation (decision/outcome lifecycle, context snapshots, somtico_models_v2, benchmark-ready snapshots, mapping knowledge, evaluation harness, moat health) + provider-boundary PII minimization — 16 August 2026  
**Vision doc sync:** `AI_Business_Intelligence_SaaS_Product_Vision_and_Roadmap_Beachhead_Strategy.docx` updated 16 August 2026 so sections 38–40 and the header identity match this shipped behaviour (long-term roadmap sections remain intentional future scope).

## Positioning

AI business intelligence and operating advisor for independent after-school, tutoring, and enrichment centres. Launch vocabulary: Students, Families, Enrolments, Programmes, Classes, Instructors, Trials, Tuition. Canonical data model underneath stays domain-neutral.

## Architecture

- Multi-tenant SaaS (Express + Prisma + PostgreSQL + JWT)
- Vite/React executive app
- Stripe Billing ($5 CAD/month pilot) + Stripe Connect foundation
- Deterministic analytics services; Advisor (the AI within the product) calls those tools only
- Provider-boundary PII minimization (16 Aug 2026): every Anthropic/OpenAI Ask Advisor request is minimized locally before send (`providerPiiMinimizer` → `invokeProviderInference`). Request-scoped aliases for people; emails/phones/street addresses stripped or generalized; programme names and financial/operational metrics preserved. Independent of Help Improve Advisor consent. See `docs/PROVIDER_PII_MINIMIZATION.md`.
- Read-only portal connector (`GET /api/connector/v1/snapshot` on the academy portal)

## Phase status

### Shipped (Phase 0 + Phase 1)

- Organizations, RBAC, audit events, education blueprint auto-provision on signup
- Empty database by default — onboard STEM Lantern (or any centre) through `/signup`
- Manual CRUD: locations, programmes, students, enrolments, staff/wages, shifts, expenses, subscriptions, loans, targets
- CSV import (students, expenses, subscriptions, revenue)
- Data Readiness Centre with why-we-ask copy
- Executive dashboard, forecasts (Conservative/Expected/Growth), staffing-vs-demand
- BusinessInsightService + Action Centre + realized impact fields
- Advice impact ledger (14 Aug 2026): every recommendation carries `impactType` (SAVINGS/REVENUE), `source` (INSIGHT/ADVISOR_CHAT/MANUAL), and verified realized impact. Completing an action never auto-copies the estimate; it snapshots a measurement baseline and starts a 30-day verification window. The daily job then measures the delta from actuals (weekly labour cost for staffing actions, monthly recurring subscription spend for tool audits, conservatively capped at the estimate) or prompts the owner to confirm/adjust/record zero (`POST /api/app/actions/:id/impact`, USER_CONFIRMED). Rollups (`GET /api/app/impact/summary` + `advisorImpact` AI tool) keep verified, estimated-pending, and pipeline strictly separate. Surfaces: Command Centre Advisor Impact card, Action Centre totals + confirmation forms, weekly brief impact section, and "Track This as an Action" on Advisor's answers (links the recommendation to the conversation). Insight runs skip creating a recommendation whose title already has an open action, so the pipeline is not inflated by duplicates.
- Pricing advisor (14 Aug 2026): per-programme cost floor ("cheapest you can afford") and recommended price at the org's configurable target margin (`Organization.pricingTargetMarginPercent`, default 30%). Floor = (weekly session labour × 4.345 ÷ active enrolments) + (monthly expenses + subscriptions ÷ all active students); salaried wages expressed hourly at 2080 h/year. Hard no-guessing gate: a programme gets numbers only when price, active enrolments, next-7-day sessions with end times and instructors, wage profiles for those instructors, and at least one expense/subscription record all exist — otherwise `INSUFFICIENT_DATA` with a concrete `missingData` ask list (that ask IS the advice). Verdicts: Below Cost, Below Target Margin, On Track, and Above Target: Price Test. The price-test verdict fires only when (1) list price sits clearly above recommended (≥15% and ≥$10), (2) utilization has been under 60% now and 28 days ago, (3) spare seats exist, and (4) a recorded demand signal is weak (trial-to-paid conversion, enquiry-to-enrol, or enrolment velocity vs the prior 28 days, each with a minimum sample). Advice is a time-boxed 6-week test at the recommended price (still above the cost floor) or limited promo/scholarship seats, then watch enrolments and conversion — never "price caused empty seats" and never "cut to $X and you will fill." Empty seats alone keep On Track ("filling seats beats a price change"). Household income, census, and area-affordability figures are out of scope and must not drive a cut. Surfaces: `/app/pricing` page (verdict cards, suggested test-price band, a collapsed-by-default "How This Was Calculated" accordion including the price-test gate, plus inline weekly-session form via `POST /api/app/sessions`), `GET /api/app/pricing/guidance`, `pricingGuidance` AI tool, and insight-run recommendations (REVENUE impact = price gap × enrolments for below-cost/below-target; price-test actions carry no promised dollar impact) that feed the impact ledger.
- AI safeguards + advice disclaimer (14 Aug 2026): system prompt enforces evidence-only answers — never guess/extrapolate/invent, relay `missingData` verbatim, request the missing dataset as the answer when evidence is insufficient, no legal/tax/accounting/investment advice. `ADVICE_DISCLAIMER` (`backend/src/config/legal.ts`) is returned on every advisor answer, shown under AI responses and pricing guidance, and appended to the weekly brief.
- Terms of Service (16 Aug 2026, version `2026-08-16.2`): `/terms` — includes Help Improve Advisor as the single optional organization learning setting (off by default; Terms acceptance does not enable it). Contact: Privacy Officer Somto Ufondu, somto@somticoweb.com, 202B Meadows Blvd., Saskatoon, SK S7V 0E4. Material notice published `2026-08-16`, effective `2026-09-15` for existing accounts; `POST /api/auth/accept-legal` re-acceptance after the effective date.
- Privacy Policy (16 Aug 2026, version `2026-08-16.2`): single customer-facing **Help Improve Advisor** setting (Settings → Privacy & Data Learning). Off by default; OWNER/ADMIN explicit Turn On. Covers eligible future privacy-safe Business Advisor activity while on (structured signals, not raw DB dumps / not third-party training). Turn Off stops future optional contribution. 30-day soft re-invite for OFF orgs. Historical legacy V1 enrolment shares without withdrawal keys remain accurately disclosed. Internal purposes (`somtico_models_v2`, `benchmark_snapshots_v1`) stay separate in storage.
- Enrolment advisor (14 Aug 2026): `/app/enrolment` diagnoses the leak from records (Needs Data, Full Room, Conversion Leak, Retention Leak, Enrolment Velocity Down, Spare Seats, On Track). Cheap next steps first; a time-boxed paid test only when conversion is healthy, spare seats exist, and cash/runway can absorb it. Owner logs what they tried and the result they got (`enrolment_tactics_tried`; notes stay org-private). The de-identified share checkbox appears only when `canShareAnonymized` is true (a leak is named) and the outcome is not `UNKNOWN`. Opt-in writes a de-identified row to `anonymized_tactic_outcomes` (no org id, no free text) with `purposeVersion` `somtico_models_v1`. Surfaces: `GET /api/app/enrolment/guidance`, tactic POST/DELETE, `enrolmentGuidance` AI tool, insight-run recommendations. Ask Advisor must ask for tried-and-results when that log is empty and must not invent student counts or ROI.
- Signup UX + email verification (14 Aug 2026): required-field asterisks; label **Business / Organization Name**; organization **slug** helper copy (subdomain + sign-in identifier) with auto-fill from the name (still editable); confirm password + shared eye/slash password reveal on signup and login; education subtype **STEM Academy** (was STEM / Coding Academy; coding is under STEM) plus **Other** with required free-text (`educationSubtypeOther`); signup shows Terms of Service and Privacy Policy in a scrollable mini panel (`LegalAcceptScroll`); the accept checkbox stays disabled until the owner scrolls to the end (Skill Samurai waiver pattern); Brevo verification link flow (`POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `/verify-email` page) mirroring SFNWA — login blocked until verified when `BREVO_API_KEY` is set; without Brevo, local/dev auto-verifies and dry-runs the email.
- Advisor branding (16 Aug 2026): the product is **Somtico Business Advisor** (shorter: **Business Advisor**). The AI has no character name and is referred to as **Advisor** in user-facing copy — nav ("Ask Advisor"), chat page, Pricing Advisor, Action Centre messages, Command Centre "Advisor's Impact" card, weekly brief, and the system prompt (the model refers to itself as Advisor and must not claim a personal name such as Chuk or Tico). The signed-in sidebar shows the organization name only. Company attribution remains Somtico Technologies Inc. Logos: `frontend/public/images/logo/` (`business-advisor-logo.png`, `business-advisor-mark.png`).
- Analysis loading states (14 Aug 2026): `AnalysisProgress` component (staged step list with spinner/checkmarks, cosmetic pacing, unmounts when real results land) + `SkeletonCard` pulse placeholders. Pricing Advisor shows the six datasets being checked plus skeleton cards (and again when recalculating after a session is added); Ask Advisor shows a five-step reasoning progression and hides the previous answer until the new one lands; Command Centre and Action Centre "Run Insights" use the same staged progress instead of a blank wait.
- Cloudflare R2 database backups (15 Aug 2026): `.github/workflows/database-backup.yml` dumps Railway PostgreSQL daily at 2:00 AM UTC (gzip → `backups/YYYY/MM/`), with setup steps in `R2_BACKUP_SETUP_GUIDE.md`. Requires the six GitHub Secrets listed under **Database backups (Cloudflare R2)** below.
- Help & FAQ page (14 Aug 2026): `/app/help` ("Help & FAQ" nav item) opens with a "Meet Your Advisor" introduction, then accordion FAQs across About Advisor, Pricing Advisor, Impact Ledger, Data & Privacy, Getting Started, and Accounts, Billing & Access. The same FAQ source (`frontend/src/content/faqs.tsx`) feeds a visitor subset on the public landing page.
- Public landing page + brand (14 Aug 2026): `/` is a marketing homepage (logged-in users are sent to `/app`) with Somtico Technologies Inc. attribution, Meet Your Advisor trust points, how-it-works, capabilities, the same product screenshots used on somticoweb.com (`/images/screenshots/`), visitor FAQs, and Start Pilot / Sign In CTAs. Public chrome (`PublicShell`) wraps landing, login, signup, terms, and email verification. Footer copy is "{product} is a product of Somtico Technologies Inc." with the company name linked to somticoweb.com (no second company link in the footer nav). Product logo lives at `frontend/public/images/logo/` (`business-advisor-logo.png` full mark, `business-advisor-mark.png` for UI); favicon set is `frontend/public/favicon.ico`, `favicon-32x32.png`, and `apple-touch-icon.png`. `/login` remains the sign-in form.
- Marketing screenshots tooling: `backend/scripts/seed-demo-screenshots.ts` seeds (and `--cleanup` deletes) a fictional local org (Northlight Learning Studio) signed in as **John Smith** (`demo@northlight.test`), with programmes, enrolments, wages, sessions, expenses, subscriptions, targets, and a verified recommendation. `backend/scripts/capture-demo-screenshots.mjs` logs in at 1440×900 and writes Command Centre, Pricing Advisor, Action Centre, Ask Advisor, and Help & FAQ PNGs (`*-v2.png`) to the gitignored `.screenshots/` folder, then those files are copied into `frontend/public/images/screenshots/` and somtico-tech.
- Advisor (AI within the product) with usage metering (Claude preferred → OpenAI fallback; privacy-aware request flags). Local fallback restates leak/impact/pricing verdicts without dumping tool JSON into the chat. Provider-bound prompts are PII-minimized once before primary/fallback/retry; audit metadata stores minimization counts only (not identity maps).
- Organization memory tool (15 Aug 2026): every Ask Advisor call includes this centre's last 90 days of actions, verified impact, and enrolment tactics. Advisor must not recommend repeating a tactic whose recorded outcome here was NO_EFFECT or HURT unless the owner asks.
- Deterministic unit-economics tools (15 Aug 2026): instructor cost per seat-hour, household monthly/annualized list-price value, trial-to-paid by programme, and cash-safe weekly paid-test cap. Enrolment paid tests use that cap. Verdicts stay in services; the model only phrases them.
- Playbook ranking (15 Aug 2026): peer patterns (8+ similar opted-in reports) sort by helped share and reorder the tactic catalogue. Fine-tune/ranker on `somtico_models_v1` stays deferred until volume is enough.
- Command Centre operating loop (15 Aug 2026): `/app` leads with this week's named leak, cheap next step, last tactic, playbook counts, and open actions. Weekly brief emails the same loop. `GET /api/app/connectors` lists portal / CSV / manual data sources on Settings.
- API hygiene (15 Aug 2026): `GET /api/app/pricing/guidance` strips per-instructor hourly rates and burden percents from session evidence (Advisor still sees full evidence server-side). Ask Advisor UI no longer shows provider/model names.
- Daily analysis + weekly executive brief jobs (Brevo when configured); daily job also runs impact verification
- Portal connector sync into canonical objects via ExternalIdentity

### Deferred

- Restaurant / second vertical UI
- Write-back agents, payroll automation
- QuickBooks production connector
- Somtico-owned industry model (fine-tune on `somtico_models_v1` / `somtico_models_v2` de-identified outcomes once volume is enough; playbook counts, helped-share ranking, and contextual ranking foundation ship now)
- Customer-facing benchmarking network / peer percentile dashboard (benchmark-ready privacy-safe snapshots ship now; UI remains gated off)
- Fast/Standard/Deep AI mode packaging
- Public API/SDK marketplace
- Full PlatformAdmin product UI (moat health is internal services/scripts only)

## Proprietary intelligence flywheel (shipped 16 August 2026)

Somtico-owned intelligence increasingly lives in canonical data, deterministic metrics, vertical diagnostics, tenant operating history, decision/outcome records, validated playbooks, mapping knowledge, privacy-safe aggregates, and evaluation fixtures. Frontier models (Claude first, OpenAI fallback) remain replaceable language infrastructure; they must not invent authoritative business numbers.

### Decision / outcome lifecycle (`DecisionOutcome`)

- 1:1 with `Recommendation` (Action Centre). Schema version `decision_outcome_v1`.
- Captures diagnosis → evidence/context → recommendation → owner decision → action → outcome → learning eligibility.
- Owner decisions: `ACCEPTED`, `REJECTED`, `DEFERRED`, `MODIFIED`, `NOT_ACTED`, `UNKNOWN`.
- Outcomes: `PENDING`, `HELPED`, `NO_EFFECT`, `HURT`, `UNKNOWN` (`NO_EFFECT` and `HURT` are first-class learning signals).
- Preserves Impact Ledger separation of expected vs measured vs owner-confirmed realized impact; never auto-copies estimates into realized.
- Recommendations created before this system have no `DecisionOutcome` (or `contextAvailable=false` if later attached without capture) — historical context is not reconstructed.

### Context snapshots (`decision_context_v1`)

- Captured at recommendation creation from trusted deterministic services (enrolment, staffing, cash, locations, enrolment guidance).
- Exact values remain tenant-private in `contextJson`. Only coarse bands enter cross-tenant V2 tables.

### Learning consent (`LearningConsent`)

- Purpose/version aware: `somtico_models_v2`, `benchmark_snapshots_v1`.
- APIs: `GET/POST /api/app/learning/consents`, `POST /api/app/learning/consents/withdraw`.
- A private decision/outcome is not permission to share. No V2 row without active consent.
- Withdrawal stops future sharing and deletes previously shared V2 / benchmark rows via purpose-specific `contributorKey` values (`HMAC(LEARNING_CONTRIBUTOR_SALT, purposeVersion:organizationId)`). Organization id is never stored on anonymized tables. Withdrawing `somtico_models_v2` cannot delete `benchmark_snapshots_v1` rows (and vice versa) because each purpose gets a different pseudonym.
- `LEARNING_CONTRIBUTOR_SALT` is a dedicated long-lived secret, required in production, must differ from `JWT_SECRET`, and must stay stable unless an intentional contributor-key migration is planned. Production startup fails if it is missing or blank. Development/test may use a documented local fallback; there is never a JWT_SECRET fallback.
- `somtico_models_v1` rows in `anonymized_tactic_outcomes` remain unchanged (no contributorKey by design; irreversible aggregates).

### Privacy-safe outcomes V2 (`anonymized_outcome_observations_v2`, purpose `somtico_models_v2`)

- Derived from `DecisionOutcome` + banded context. No organizationId, PII, free text, chats, or raw DB rows.
- Enrolment Advisor v1 opt-in path (`somtico_models_v1`) is preserved.

### Contextual playbook ranking foundation

- Transparent cohort grouping on V2 observations (diagnosis + optional context bands).
- Below configurable min sample (default 8): peer evidence insufficient; fall back to deterministic education playbooks; never fabricate percentages.
- Existing v1 peer patterns (≥8) remain.

### Benchmark-ready snapshots (no customer UI)

- Definitions in `benchmark_metric_definitions`; opt-in snapshots in `anonymized_benchmark_snapshots`.
- `CUSTOMER_BENCHMARKS_ENABLED = false` with cohort suppression config ready.
- Captured on benchmark consent grant from deterministic metrics only.

### Source-mapping intelligence

- `source_mapping_knowledge` stores schema fingerprints, field names, proposed canonical fields, confidence, review status, use/correction counts — never raw source row values.
- `POST /api/app/mapping/propose`; CSV student import seeds synthetic approved mappings and proposes matches. Ambiguous mappings require confirmation (`confidence < 0.85` or not `APPROVED`).

### Evaluation harness + moat health

- Synthetic Advisor-vs-generic evaluation (`npm run moat:eval` / `evaluationHarness.ts`). Provider/model recorded; not shown in customer UI.
- Moat health aggregates via `computeMoatHealthMetrics` / `npm run moat:health` (no PlatformAdmin dashboard).

### Tests

- Backend Jest suite under `backend/src/services/moat/*.test.ts` (`npm test -- --maxWorkers=1`).

## Onboarding

Use `/signup` to create an organization (education blueprint applied automatically). Connect the STEM Lantern registration portal from Settings after you set `STEM_LANTERN_PORTAL_URL` and `STEM_LANTERN_PORTAL_API_KEY`.

## Env

See `backend/.env.example` and `frontend/.env.example`.

Notable privacy secret:

- **`LEARNING_CONTRIBUTOR_SALT`** — dedicated HMAC secret for purpose-specific learning/benchmark `contributorKey` values. Required in production (startup exits if missing/blank). Must not be `JWT_SECRET`. Keep stable unless you run an intentional contributor-key migration. Development/test may omit it and use the documented local fallback in `contributorKey.ts` (never a JWT fallback).

## Database backups (Cloudflare R2)

Automated daily PostgreSQL dumps to Cloudflare R2 via GitHub Actions (same pattern as Skill Samurai Saskatoon Portal).

- **Guide:** `R2_BACKUP_SETUP_GUIDE.md` (repo root)
- **Workflow:** `.github/workflows/database-backup.yml` — daily at 2:00 AM UTC; also `workflow_dispatch`
- **Bucket (recommended):** `business-advisor-database-backups`
- **Object path:** `backups/YYYY/MM/backup-YYYY-MM-DD-HHMMSS.sql.gz`
- **Retention:** Object lifecycle rule delete after 30 days with prefix **`backups/`** only (optional but recommended). Never leave the rule-scope prefix empty; that deletes every object in the bucket (same failure mode as SFNWA / FNOCC).
- **GitHub Secrets required:** `RAILWAY_DATABASE_URL` (Railway `DATABASE_PUBLIC_URL`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`

Complete Cloudflare + GitHub secret setup before the first manual Actions run. Local `prisma migrate deploy` does not configure R2 or GitHub Secrets.
