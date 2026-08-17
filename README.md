# Somtico Business Advisor

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
cp backend/.env.example backend/.env   # then set DATABASE_URL / JWT_SECRET / LEARNING_CONTRIBUTOR_SALT
cp frontend/.env.example frontend/.env
cd backend && npx prisma migrate deploy
cd .. && npm run dev
```

Create STEM Lantern (or any centre) yourself via **Create Organization** at `/signup`. Seed does not pre-create tenants.

**Production env note:** `LEARNING_CONTRIBUTOR_SALT` is required, must be a dedicated secret (not `JWT_SECRET`), and should remain stable unless you intentionally migrate contributor keys.

## Spec

See [BUSINESS_ADVISOR_PROJECT_SPECIFICATION.md](./BUSINESS_ADVISOR_PROJECT_SPECIFICATION.md).

Developer note: provider-boundary PII minimization for Ask Advisor is documented in [docs/PROVIDER_PII_MINIMIZATION.md](./docs/PROVIDER_PII_MINIMIZATION.md).

## Database backups

Daily Railway PostgreSQL dumps to Cloudflare R2. Follow [R2_BACKUP_SETUP_GUIDE.md](./R2_BACKUP_SETUP_GUIDE.md) to create the bucket, API token, GitHub Secrets, and verify the Actions workflow.
