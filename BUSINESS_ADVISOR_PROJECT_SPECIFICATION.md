# Business Advisor — Project Specification

**Product:** Business Advisor  
**Customer #1:** STEM Lantern Education Inc. (operating name STEM Lantern)  
**Portal data source (during rebrand):** Skill Samurai Saskatoon Registration Portal  
**Ports:** frontend 3007 · backend 5007  
**Revision:** Phase 0 + Phase 1 beachhead + advice impact ledger + pricing advisor + terms of service + Nonso branding — 14 August 2026

## Positioning

AI business intelligence and operating advisor for independent after-school, tutoring, and enrichment centres. Launch vocabulary: Students, Families, Enrolments, Programmes, Classes, Instructors, Trials, Tuition. Canonical data model underneath stays domain-neutral.

## Architecture

- Multi-tenant SaaS (Express + Prisma + PostgreSQL + JWT)
- Vite/React executive app
- Stripe Billing ($5 CAD/month pilot) + Stripe Connect foundation
- Deterministic analytics services; Nonso (the AI advisor) calls those tools only
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
- Advice impact ledger (14 Aug 2026): every recommendation carries `impactType` (SAVINGS/REVENUE), `source` (INSIGHT/ADVISOR_CHAT/MANUAL), and verified realized impact. Completing an action never auto-copies the estimate; it snapshots a measurement baseline and starts a 30-day verification window. The daily job then measures the delta from actuals (weekly labour cost for staffing actions, monthly recurring subscription spend for tool audits, conservatively capped at the estimate) or prompts the owner to confirm/adjust/record zero (`POST /api/app/actions/:id/impact`, USER_CONFIRMED). Rollups (`GET /api/app/impact/summary` + `advisorImpact` AI tool) keep verified, estimated-pending, and pipeline strictly separate. Surfaces: Command Centre Advisor Impact card, Action Centre totals + confirmation forms, weekly brief impact section, and "Track This as an Action" on Nonso's answers (links the recommendation to the conversation). Insight runs skip creating a recommendation whose title already has an open action, so the pipeline is not inflated by duplicates.
- Pricing advisor (14 Aug 2026): per-programme cost floor ("cheapest you can afford") and recommended price at the org's configurable target margin (`Organization.pricingTargetMarginPercent`, default 30%). Floor = (weekly session labour × 4.345 ÷ active enrolments) + (monthly expenses + subscriptions ÷ all active students); salaried wages expressed hourly at 2080 h/year. Hard no-guessing gate: a programme gets numbers only when price, active enrolments, next-7-day sessions with end times and instructors, wage profiles for those instructors, and at least one expense/subscription record all exist — otherwise `INSUFFICIENT_DATA` with a concrete `missingData` ask list (that ask IS the advice). Surfaces: `/app/pricing` page (verdict cards Below Cost / Below Target Margin / On Track, a collapsed-by-default "How This Was Calculated" accordion per programme walking each step — per-session labour, monthly labour, overhead allocation, both floors, and the target margin dollars added to reach the recommended price — plus inline weekly-session form via new `POST /api/app/sessions`), `GET /api/app/pricing/guidance`, `pricingGuidance` AI tool, and insight-run recommendations (REVENUE impact = price gap × enrolments) that feed the impact ledger. Below-cost verdicts also warn when filling seats beats raising price (utilization < 60%).
- AI safeguards + advice disclaimer (14 Aug 2026): system prompt enforces evidence-only answers — never guess/extrapolate/invent, relay `missingData` verbatim, request the missing dataset as the answer when evidence is insufficient, no legal/tax/accounting/investment advice. `ADVICE_DISCLAIMER` (`backend/src/config/legal.ts`) is returned on every advisor answer, shown under AI responses and pricing guidance, and appended to the weekly brief.
- Terms of Service (14 Aug 2026, version `2026-08-14`): `/terms` public page for Somtico Technology Inc. — information-not-advice, assumption of risk, AI limitations, data responsibility, fees/renewals/no refunds, acceptable use, IP, PIPEDA reference, warranty disclaimer, liability cap (12 months' fees, no consequential damages), indemnification, termination + 30-day export, Saskatchewan governing law/venue, class-action waiver, 1-year claim limit. Signup requires an explicit checkbox; `POST /api/auth/register` rejects without `termsAccepted: true` (`TERMS_REQUIRED`) and stores `termsAcceptedAt` + `termsVersion` on the owner user and in the audit event. Terms text is a template pending lawyer review, not legal advice.
- Nonso branding (14 Aug 2026): the AI is named **Nonso** in all user-facing copy — nav ("Ask Nonso"), chat page, Pricing Advisor, Action Centre messages, Command Centre "Nonso's Impact" card, weekly brief, and the system prompt (the model refers to itself as Nonso). The product name stays Business Advisor.
- Analysis loading states (14 Aug 2026): `AnalysisProgress` component (staged step list with spinner/checkmarks, cosmetic pacing, unmounts when real results land) + `SkeletonCard` pulse placeholders. Pricing Advisor shows the six datasets being checked plus skeleton cards (and again when recalculating after a session is added); Ask Nonso shows a five-step reasoning progression and hides the previous answer until the new one lands; Command Centre and Action Centre "Run Insights" use the same staged progress instead of a blank wait.
- Help & FAQ page (14 Aug 2026): `/app/help` ("Help & FAQ" nav item) opens with a "Meet Nonso" introduction, then accordion FAQs across About Nonso, Pricing Advisor, Impact Ledger, Data & Privacy, Getting Started, and Accounts, Billing & Access.
- Marketing screenshots tooling: `backend/scripts/seed-demo-screenshots.ts` seeds (and `--cleanup` deletes) a fictional local org (Northlight Learning Studio) with programmes, enrolments, wages, sessions, expenses, subscriptions, targets, and a verified recommendation, for capturing product screenshots. Local dev only; output goes to the gitignored `.screenshots/`.
- Auto Nonso (AI advisor) with usage metering (OpenAI → Claude → Gemini; privacy-aware request flags)
- Daily analysis + weekly executive brief jobs (Brevo when configured); daily job also runs impact verification
- Portal connector sync into canonical objects via ExternalIdentity

### Deferred

- Restaurant / second vertical UI
- Write-back agents, payroll automation
- QuickBooks production connector
- Benchmarking network
- Fast/Standard/Deep AI mode packaging
- Public API/SDK marketplace

## Onboarding

Use `/signup` to create an organization (education blueprint applied automatically). Connect the STEM Lantern registration portal from Settings after you set `STEM_LANTERN_PORTAL_URL` and `STEM_LANTERN_PORTAL_API_KEY`.

## Env

See `backend/.env.example` and `frontend/.env.example`.
