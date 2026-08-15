# AI Business Advisor — Project Specification

**Product:** AI Business Advisor  
**Customer #1:** STEM Lantern Education Inc. (operating name STEM Lantern)  
**Portal data source (during rebrand):** Skill Samurai Saskatoon Registration Portal  
**Ports:** frontend 3007 · backend 5007  
**Revision:** Phase 0 + Phase 1 beachhead + advice impact ledger + pricing advisor + enrolment advisor + privacy policy + terms of service + Chuk branding + signup UX / email verification + public landing page + Cloudflare R2 daily DB backups — 15 August 2026

## Positioning

AI business intelligence and operating advisor for independent after-school, tutoring, and enrichment centres. Launch vocabulary: Students, Families, Enrolments, Programmes, Classes, Instructors, Trials, Tuition. Canonical data model underneath stays domain-neutral.

## Architecture

- Multi-tenant SaaS (Express + Prisma + PostgreSQL + JWT)
- Vite/React executive app
- Stripe Billing ($5 CAD/month pilot) + Stripe Connect foundation
- Deterministic analytics services; Chuk (the AI advisor) calls those tools only
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
- Advice impact ledger (14 Aug 2026): every recommendation carries `impactType` (SAVINGS/REVENUE), `source` (INSIGHT/ADVISOR_CHAT/MANUAL), and verified realized impact. Completing an action never auto-copies the estimate; it snapshots a measurement baseline and starts a 30-day verification window. The daily job then measures the delta from actuals (weekly labour cost for staffing actions, monthly recurring subscription spend for tool audits, conservatively capped at the estimate) or prompts the owner to confirm/adjust/record zero (`POST /api/app/actions/:id/impact`, USER_CONFIRMED). Rollups (`GET /api/app/impact/summary` + `advisorImpact` AI tool) keep verified, estimated-pending, and pipeline strictly separate. Surfaces: Command Centre Advisor Impact card, Action Centre totals + confirmation forms, weekly brief impact section, and "Track This as an Action" on Chuk's answers (links the recommendation to the conversation). Insight runs skip creating a recommendation whose title already has an open action, so the pipeline is not inflated by duplicates.
- Pricing advisor (14 Aug 2026): per-programme cost floor ("cheapest you can afford") and recommended price at the org's configurable target margin (`Organization.pricingTargetMarginPercent`, default 30%). Floor = (weekly session labour × 4.345 ÷ active enrolments) + (monthly expenses + subscriptions ÷ all active students); salaried wages expressed hourly at 2080 h/year. Hard no-guessing gate: a programme gets numbers only when price, active enrolments, next-7-day sessions with end times and instructors, wage profiles for those instructors, and at least one expense/subscription record all exist — otherwise `INSUFFICIENT_DATA` with a concrete `missingData` ask list (that ask IS the advice). Verdicts: Below Cost, Below Target Margin, On Track, and Above Target: Price Test. The price-test verdict fires only when (1) list price sits clearly above recommended (≥15% and ≥$10), (2) utilization has been under 60% now and 28 days ago, (3) spare seats exist, and (4) a recorded demand signal is weak (trial-to-paid conversion, enquiry-to-enrol, or enrolment velocity vs the prior 28 days, each with a minimum sample). Advice is a time-boxed 6-week test at the recommended price (still above the cost floor) or limited promo/scholarship seats, then watch enrolments and conversion — never "price caused empty seats" and never "cut to $X and you will fill." Empty seats alone keep On Track ("filling seats beats a price change"). Household income, census, and area-affordability figures are out of scope and must not drive a cut. Surfaces: `/app/pricing` page (verdict cards, suggested test-price band, a collapsed-by-default "How This Was Calculated" accordion including the price-test gate, plus inline weekly-session form via `POST /api/app/sessions`), `GET /api/app/pricing/guidance`, `pricingGuidance` AI tool, and insight-run recommendations (REVENUE impact = price gap × enrolments for below-cost/below-target; price-test actions carry no promised dollar impact) that feed the impact ledger.
- AI safeguards + advice disclaimer (14 Aug 2026): system prompt enforces evidence-only answers — never guess/extrapolate/invent, relay `missingData` verbatim, request the missing dataset as the answer when evidence is insufficient, no legal/tax/accounting/investment advice. `ADVICE_DISCLAIMER` (`backend/src/config/legal.ts`) is returned on every advisor answer, shown under AI responses and pricing guidance, and appended to the weekly brief.
- Terms of Service (14 Aug 2026, version `2026-08-14.4`): `/terms` public page for Somtico Technologies Inc. (operating name Somtico Tech) — information-not-advice, assumption of risk, AI limitations (defines Chuk as the AI advisor feature; software, not a person), data responsibility, fees/renewals/no refunds, acceptable use, IP (including Somtico-owned models trained on opted-in de-identified outcomes), Privacy Policy incorporated by reference (section 11), warranty disclaimer, liability cap (12 months' fees, no consequential damages), indemnification, termination + 30-day export, Saskatchewan governing law/venue, class-action waiver, 1-year claim limit. Section 7 defines enrolment-tactic, leak (enrolment diagnosis, not a security incident), and playbooks on first use. Signup requires an explicit checkbox covering Terms and Privacy; `POST /api/auth/register` rejects without `termsAccepted` and `privacyAccepted` (`TERMS_REQUIRED`) and stores `termsAcceptedAt` + `termsVersion` plus `privacyAcceptedAt` + `privacyVersion` on the owner user. Terms text is a template pending lawyer review, not legal advice.
- Privacy Policy (14 Aug 2026, version `2026-08-14.4`): separate public page at `/privacy` (public footer, signed-in app footer, Help & FAQ, signup, Terms). Covers account and Customer Data, no sale of personal information, AI provider calls using aggregated evidence with training opted out, optional de-identified enrolment-tactic outcomes (tactic type, cost band, outcome, leak type, coarse education bucket; no notes, names, or organization id; shown only after 8 similar reports). Section 4 defines Enrolment Advisor, leak, tactic, outcome, and playbook counts on first use. The opt-in is offered only when a leak is named and the owner logs a clear outcome. Opted-in rows written under `somtico_models_v1` may later train or evaluate Somtico-owned models; they are never sent to train third-party providers. `purposeVersion` stays in the database; it is not explained in the public policy. Processors, retention/export, children/minors as Customer Data, PIPEDA, Saskatchewan contact. Template pending lawyer review.
- Enrolment advisor (14 Aug 2026): `/app/enrolment` diagnoses the leak from records (Needs Data, Full Room, Conversion Leak, Retention Leak, Enrolment Velocity Down, Spare Seats, On Track). Cheap next steps first; a time-boxed paid test only when conversion is healthy, spare seats exist, and cash/runway can absorb it. Owner logs what they tried and the result they got (`enrolment_tactics_tried`; notes stay org-private). The de-identified share checkbox appears only when `canShareAnonymized` is true (a leak is named) and the outcome is not `UNKNOWN`. Opt-in writes a de-identified row to `anonymized_tactic_outcomes` (no org id, no free text) with `purposeVersion` `somtico_models_v1`. Surfaces: `GET /api/app/enrolment/guidance`, tactic POST/DELETE, `enrolmentGuidance` AI tool, insight-run recommendations. Ask Chuk must ask for tried-and-results when that log is empty and must not invent student counts or ROI.
- Signup UX + email verification (14 Aug 2026): required-field asterisks; label **Business / Organization Name**; organization **slug** helper copy (subdomain + sign-in identifier) with auto-fill from the name (still editable); confirm password + shared eye/slash password reveal on signup and login; education subtype **STEM Academy** (was STEM / Coding Academy; coding is under STEM) plus **Other** with required free-text (`educationSubtypeOther`); signup shows Terms of Service and Privacy Policy in a scrollable mini panel (`LegalAcceptScroll`); the accept checkbox stays disabled until the owner scrolls to the end (Skill Samurai waiver pattern); Brevo verification link flow (`POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `/verify-email` page) mirroring SFNWA — login blocked until verified when `BREVO_API_KEY` is set; without Brevo, local/dev auto-verifies and dry-runs the email.
- Chuk branding (14 Aug 2026): the AI is named **Chuk** in all user-facing copy — nav ("Ask Chuk"), chat page, Pricing Advisor, Action Centre messages, Command Centre "Chuk's Impact" card, weekly brief, and the system prompt (the model refers to itself as Chuk). The signed-in sidebar shows the organization name only (no "software, not a person" gloss under the business name). That gloss stays on the landing hero, Privacy section 3, and the FAQ "Who is Chuk?". Later mentions on the same page are just **Chuk**. The product name is **AI Business Advisor**.
- Analysis loading states (14 Aug 2026): `AnalysisProgress` component (staged step list with spinner/checkmarks, cosmetic pacing, unmounts when real results land) + `SkeletonCard` pulse placeholders. Pricing Advisor shows the six datasets being checked plus skeleton cards (and again when recalculating after a session is added); Ask Chuk shows a five-step reasoning progression and hides the previous answer until the new one lands; Command Centre and Action Centre "Run Insights" use the same staged progress instead of a blank wait.
- Cloudflare R2 database backups (15 Aug 2026): `.github/workflows/database-backup.yml` dumps Railway PostgreSQL daily at 2:00 AM UTC (gzip → `backups/YYYY/MM/`), with setup steps in `R2_BACKUP_SETUP_GUIDE.md`. Requires the six GitHub Secrets listed under **Database backups (Cloudflare R2)** below.
- Help & FAQ page (14 Aug 2026): `/app/help` ("Help & FAQ" nav item) opens with a "Meet Chuk" introduction, then accordion FAQs across About Chuk, Pricing Advisor, Impact Ledger, Data & Privacy, Getting Started, and Accounts, Billing & Access. The same FAQ source (`frontend/src/content/faqs.tsx`) feeds a visitor subset on the public landing page.
- Public landing page + brand (14 Aug 2026): `/` is a marketing homepage (logged-in users are sent to `/app`) with Somtico Technologies Inc. attribution, Meet Chuk trust points, how-it-works, capabilities, the same product screenshots used on somticoweb.com (`/images/screenshots/`), visitor FAQs, and Start Pilot / Sign In CTAs. Public chrome (`PublicShell`) wraps landing, login, signup, terms, and email verification. Footer copy is "{product} is a product of Somtico Technologies Inc." with the company name linked to somticoweb.com (no second company link in the footer nav). Chuk logo lives at `frontend/public/images/logo/` (`chuk-ai-logo.png` full mark, `chuk-ai-mark.png` for UI); favicon set is `frontend/public/favicon.ico`, `favicon-32x32.png`, and `apple-touch-icon.png`. `/login` remains the sign-in form.
- Marketing screenshots tooling: `backend/scripts/seed-demo-screenshots.ts` seeds (and `--cleanup` deletes) a fictional local org (Northlight Learning Studio) signed in as **John Smith** (`demo@northlight.test`), with programmes, enrolments, wages, sessions, expenses, subscriptions, targets, and a verified recommendation. `backend/scripts/capture-demo-screenshots.mjs` logs in at 1440×900 and writes Command Centre, Pricing Advisor, Action Centre, Ask Chuk, and Help & FAQ PNGs (`*-v2.png`) to the gitignored `.screenshots/` folder, then those files are copied into `frontend/public/images/screenshots/` and somtico-tech.
- Auto Chuk (AI advisor) with usage metering (OpenAI → Claude → Gemini; privacy-aware request flags)
- Daily analysis + weekly executive brief jobs (Brevo when configured); daily job also runs impact verification
- Portal connector sync into canonical objects via ExternalIdentity

### Deferred

- Restaurant / second vertical UI
- Write-back agents, payroll automation
- QuickBooks production connector
- Somtico-owned industry model (fine-tune or ranker on `somtico_models_v1` de-identified outcomes once volume is enough; playbook counts ship first)
- Benchmarking network
- Fast/Standard/Deep AI mode packaging
- Public API/SDK marketplace

## Onboarding

Use `/signup` to create an organization (education blueprint applied automatically). Connect the STEM Lantern registration portal from Settings after you set `STEM_LANTERN_PORTAL_URL` and `STEM_LANTERN_PORTAL_API_KEY`.

## Env

See `backend/.env.example` and `frontend/.env.example`.

## Database backups (Cloudflare R2)

Automated daily PostgreSQL dumps to Cloudflare R2 via GitHub Actions (same pattern as Skill Samurai Saskatoon Portal).

- **Guide:** `R2_BACKUP_SETUP_GUIDE.md` (repo root)
- **Workflow:** `.github/workflows/database-backup.yml` — daily at 2:00 AM UTC; also `workflow_dispatch`
- **Bucket (recommended):** `business-advisor-database-backups`
- **Object path:** `backups/YYYY/MM/backup-YYYY-MM-DD-HHMMSS.sql.gz`
- **Retention:** Object lifecycle rule delete after 30 days with prefix **`backups/`** only (optional but recommended). Never leave the rule-scope prefix empty; that deletes every object in the bucket (same failure mode as SFNWA / FNOCC).
- **GitHub Secrets required:** `RAILWAY_DATABASE_URL` (Railway `DATABASE_PUBLIC_URL`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`

Complete Cloudflare + GitHub secret setup before the first manual Actions run. Local `prisma migrate deploy` does not configure R2 or GitHub Secrets.
