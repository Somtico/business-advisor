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

    // Advice impact ledger (2026-08-14)
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "ImpactType" AS ENUM ('SAVINGS', 'REVENUE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "ImpactRealizationSource" AS ENUM ('MEASURED', 'USER_CONFIRMED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "RecommendationSource" AS ENUM ('INSIGHT', 'ADVISOR_CHAT', 'MANUAL');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "recommendations"
        ADD COLUMN IF NOT EXISTS "baselineJson" JSONB,
        ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "conversationId" TEXT,
        ADD COLUMN IF NOT EXISTS "impactType" "ImpactType",
        ADD COLUMN IF NOT EXISTS "realizedNote" TEXT,
        ADD COLUMN IF NOT EXISTS "realizedSource" "ImpactRealizationSource",
        ADD COLUMN IF NOT EXISTS "source" "RecommendationSource" NOT NULL DEFAULT 'INSIGHT',
        ADD COLUMN IF NOT EXISTS "verificationDueAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "recommendations_organizationId_realizedAt_idx"
        ON "recommendations"("organizationId", "realizedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "recommendations_organizationId_verificationDueAt_idx"
        ON "recommendations"("organizationId", "verificationDueAt");
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        ALTER TABLE "recommendations"
          ADD CONSTRAINT "recommendations_conversationId_fkey"
          FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
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
