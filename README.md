# AI Business Advisor

Multi-tenant AI business intelligence and operating advisor for independent after-school, tutoring, and enrichment education centres.

**Customer #1:** STEM Lantern (portal: Skill Samurai Saskatoon Registration Portal during rebrand)

## Local ports

| Service | Port |
|---------|------|
| Frontend | 3007 |
| Backend | 5007 |

## Quick start

```bash
npm run install:all
# Create DB: createdb business_advisor (or equivalent)
cp backend/.env.example backend/.env   # then set DATABASE_URL / JWT_SECRET
cp frontend/.env.example frontend/.env
cd backend && npx prisma migrate deploy
cd .. && npm run dev
```

Create STEM Lantern (or any centre) yourself via **Create Organization** at `/signup`. Seed does not pre-create tenants.

## Spec

See [BUSINESS_ADVISOR_PROJECT_SPECIFICATION.md](./BUSINESS_ADVISOR_PROJECT_SPECIFICATION.md).
