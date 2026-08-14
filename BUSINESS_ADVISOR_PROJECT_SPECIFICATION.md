# Business Advisor — Project Specification

**Product:** Business Advisor  
**Customer #1:** STEM Lantern Education Inc. (operating name STEM Lantern)  
**Portal data source (during rebrand):** Skill Samurai Saskatoon Registration Portal  
**Ports:** frontend 3007 · backend 5007  
**Revision:** Phase 0 + Phase 1 beachhead + advice impact ledger — 14 August 2026

## Positioning

AI business intelligence and operating advisor for independent after-school, tutoring, and enrichment centres. Launch vocabulary: Students, Families, Enrolments, Programmes, Classes, Instructors, Trials, Tuition. Canonical data model underneath stays domain-neutral.

## Architecture

- Multi-tenant SaaS (Express + Prisma + PostgreSQL + JWT)
- Vite/React executive app
- Stripe Billing ($5 CAD/month pilot) + Stripe Connect foundation
- Deterministic analytics services; AI Advisor calls those tools only
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
- Advice impact ledger (14 Aug 2026): every recommendation carries `impactType` (SAVINGS/REVENUE), `source` (INSIGHT/ADVISOR_CHAT/MANUAL), and verified realized impact. Completing an action never auto-copies the estimate; it snapshots a measurement baseline and starts a 30-day verification window. The daily job then measures the delta from actuals (weekly labour cost for staffing actions, monthly recurring subscription spend for tool audits, conservatively capped at the estimate) or prompts the owner to confirm/adjust/record zero (`POST /api/app/actions/:id/impact`, USER_CONFIRMED). Rollups (`GET /api/app/impact/summary` + `advisorImpact` AI tool) keep verified, estimated-pending, and pipeline strictly separate. Surfaces: Command Centre Advisor Impact card, Action Centre totals + confirmation forms, weekly brief impact section, and "Track This as an Action" on AI Advisor answers (links the recommendation to the conversation). Insight runs skip creating a recommendation whose title already has an open action, so the pipeline is not inflated by duplicates.
- Auto AI Advisor with usage metering (OpenAI → Claude → Gemini; privacy-aware request flags)
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
