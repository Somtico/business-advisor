# Business Advisor — Project Specification

**Product:** Business Advisor  
**Customer #1:** STEM Lantern Education Inc. (operating name STEM Lantern)  
**Portal data source (during rebrand):** Skill Samurai Saskatoon Registration Portal  
**Ports:** frontend 3007 · backend 5007  
**Revision:** Phase 0 + Phase 1 beachhead — 13 August 2026

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
- Auto AI Advisor with usage metering (OpenAI → Claude → Gemini; privacy-aware request flags)
- Daily analysis + weekly executive brief jobs (Brevo when configured)
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
