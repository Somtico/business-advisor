import { PrismaClient } from '@prisma/client';

/**
 * Idempotent schema repairs for Railway when migrate deploy lags or is skipped.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "audit_events" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT,
        "actorUserId" TEXT,
        "action" TEXT NOT NULL,
        "resourceType" TEXT,
        "resourceId" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cashBalanceCents" INTEGER NOT NULL DEFAULT 0;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "industryBlueprintKey" TEXT NOT NULL DEFAULT 'after_school_tutoring_enrichment';
    `);

    console.log('ensure-db-schema: ok');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('ensure-db-schema failed', err);
  process.exit(1);
});
