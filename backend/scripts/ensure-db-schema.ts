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
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cashBalanceAsOf" TIMESTAMP(3);
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

    // Pricing guidance + terms acceptance (2026-08-14)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pricingTargetMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "learningInviteSnoozedUntil" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "termsVersion" TEXT,
        ADD COLUMN IF NOT EXISTS "privacyAcceptedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "privacyVersion" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "EnrolmentTacticKey" AS ENUM ('TRIAL_FOLLOWUP', 'FAMILY_REFERRAL', 'SCHOOL_OUTREACH', 'OPEN_HOUSE', 'SCHEDULE_CHANGE', 'WAITLIST', 'PRICE_PROMO', 'SOCIAL_ORGANIC', 'PAID_ADS', 'OTHER');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "TacticOutcome" AS ENUM ('HELPED', 'NO_EFFECT', 'HURT', 'UNKNOWN');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "TacticCostBand" AS ENUM ('FREE', 'LOW', 'PAID');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "enrolment_tactics_tried" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "tacticKey" "EnrolmentTacticKey" NOT NULL,
        "otherLabel" TEXT,
        "resultSummary" TEXT NOT NULL,
        "outcome" "TacticOutcome" NOT NULL,
        "costBand" "TacticCostBand" NOT NULL,
        "shareAnonymized" BOOLEAN NOT NULL DEFAULT false,
        "leakTypeAtReport" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "enrolment_tactics_tried_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "enrolment_tactics_tried_organizationId_createdAt_idx"
        ON "enrolment_tactics_tried"("organizationId", "createdAt");
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        ALTER TABLE "enrolment_tactics_tried"
          ADD CONSTRAINT "enrolment_tactics_tried_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "anonymized_tactic_outcomes" (
        "id" TEXT NOT NULL,
        "tacticKey" "EnrolmentTacticKey" NOT NULL,
        "outcome" "TacticOutcome" NOT NULL,
        "costBand" "TacticCostBand" NOT NULL,
        "leakType" TEXT NOT NULL,
        "educationBucket" TEXT NOT NULL,
        "purposeVersion" TEXT NOT NULL DEFAULT 'playbook_counts_v1',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "anonymized_tactic_outcomes_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "anonymized_tactic_outcomes"
        ADD COLUMN IF NOT EXISTS "purposeVersion" TEXT NOT NULL DEFAULT 'playbook_counts_v1';
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "anonymized_tactic_outcomes_tacticKey_leakType_outcome_idx"
        ON "anonymized_tactic_outcomes"("tacticKey", "leakType", "outcome");
    `);

    // Moat intelligence flywheel (2026-08-16)
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "OwnerDecision" AS ENUM ('ACCEPTED', 'REJECTED', 'DEFERRED', 'MODIFIED', 'NOT_ACTED', 'UNKNOWN');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "LifecycleOutcome" AS ENUM ('PENDING', 'HELPED', 'NO_EFFECT', 'HURT', 'UNKNOWN');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "OutcomeVerificationType" AS ENUM ('NONE', 'PENDING', 'MEASURED', 'USER_CONFIRMED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "LearningEligibility" AS ENUM ('INELIGIBLE', 'ELIGIBLE_PENDING_CONSENT', 'SHARED', 'WITHDRAWN_BLOCKED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "MappingReviewStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "decision_outcomes" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "recommendationId" TEXT NOT NULL,
        "schemaVersion" TEXT NOT NULL DEFAULT 'decision_outcome_v1',
        "diagnosisCode" TEXT,
        "interventionCode" TEXT,
        "contextAvailable" BOOLEAN NOT NULL DEFAULT false,
        "contextSchemaVersion" TEXT,
        "contextCapturedAt" TIMESTAMP(3),
        "contextJson" JSONB,
        "dataFreshness" TEXT,
        "confidence" DOUBLE PRECISION,
        "estimatedImpactCents" INTEGER,
        "estimatedImpactType" "ImpactType",
        "expectedOutcomeHorizonDays" INTEGER,
        "ownerDecision" "OwnerDecision" NOT NULL DEFAULT 'UNKNOWN',
        "decisionAt" TIMESTAMP(3),
        "lifecycleOutcome" "LifecycleOutcome" NOT NULL DEFAULT 'PENDING',
        "outcomeAt" TIMESTAMP(3),
        "outcomeVerificationType" "OutcomeVerificationType" NOT NULL DEFAULT 'NONE',
        "realizedImpactCents" INTEGER,
        "learningEligibility" "LearningEligibility" NOT NULL DEFAULT 'INELIGIBLE',
        "learningPurposeVersion" TEXT,
        "implementationVersion" TEXT,
        "routerVersion" TEXT,
        "anonymizedObservationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "decision_outcomes_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "decision_outcomes_recommendationId_key"
        ON "decision_outcomes"("recommendationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "learning_consents" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "purposeVersion" TEXT NOT NULL,
        "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "grantedByUserId" TEXT,
        "withdrawnAt" TIMESTAMP(3),
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "learning_consents_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "learning_consents_organizationId_purposeVersion_key"
        ON "learning_consents"("organizationId", "purposeVersion");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "anonymized_outcome_observations_v2" (
        "id" TEXT NOT NULL,
        "schemaVersion" TEXT NOT NULL DEFAULT 'outcome_observation_v2',
        "purposeVersion" TEXT NOT NULL DEFAULT 'somtico_models_v2',
        "contributorKey" TEXT NOT NULL,
        "educationSubtype" TEXT,
        "programmeCategory" TEXT,
        "activeEnrolmentBand" TEXT,
        "locationCountBand" TEXT,
        "utilizationBand" TEXT,
        "conversionHealth" TEXT,
        "retentionHealth" TEXT,
        "spareCapacityState" TEXT,
        "cashSafetyBand" TEXT,
        "seasonOrPeriod" TEXT,
        "diagnosedLeak" TEXT,
        "interventionCategory" TEXT,
        "effortOrCostBand" TEXT,
        "outcome" "LifecycleOutcome" NOT NULL,
        "outcomeHorizonDays" INTEGER,
        "verificationType" "OutcomeVerificationType" NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "anonymized_outcome_observations_v2_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "benchmark_metric_definitions" (
        "id" TEXT NOT NULL,
        "metricKey" TEXT NOT NULL,
        "definitionVersion" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "unit" TEXT NOT NULL,
        "formulaSummary" TEXT NOT NULL,
        "provenance" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "benchmark_metric_definitions_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_metric_definitions_metricKey_definitionVersion_key"
        ON "benchmark_metric_definitions"("metricKey", "definitionVersion");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "anonymized_benchmark_snapshots" (
        "id" TEXT NOT NULL,
        "schemaVersion" TEXT NOT NULL DEFAULT 'benchmark_snapshot_v1',
        "purposeVersion" TEXT NOT NULL DEFAULT 'benchmark_snapshots_v1',
        "contributorKey" TEXT NOT NULL,
        "metricDefinitionId" TEXT NOT NULL,
        "metricKey" TEXT NOT NULL,
        "definitionVersion" TEXT NOT NULL,
        "value" DOUBLE PRECISION NOT NULL,
        "educationSubtype" TEXT,
        "activeLearnerBand" TEXT,
        "programmeCategory" TEXT,
        "locationCountBand" TEXT,
        "maturityBand" TEXT,
        "geographyLevel" TEXT,
        "reportingPeriod" TEXT,
        "dataQualityStatus" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "anonymized_benchmark_snapshots_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "source_mapping_knowledge" (
        "id" TEXT NOT NULL,
        "sourceSystemType" TEXT NOT NULL,
        "schemaFingerprint" TEXT NOT NULL,
        "sourceFieldName" TEXT NOT NULL,
        "sourceDataType" TEXT,
        "proposedCanonical" TEXT NOT NULL,
        "transformationRule" TEXT,
        "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        "reviewStatus" "MappingReviewStatus" NOT NULL DEFAULT 'PROPOSED',
        "successfulUses" INTEGER NOT NULL DEFAULT 0,
        "correctionCount" INTEGER NOT NULL DEFAULT 0,
        "version" INTEGER NOT NULL DEFAULT 1,
        "syntheticExample" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "source_mapping_knowledge_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "onboarding_telemetry" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "sourceSystemType" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "firstInsightAt" TIMESTAMP(3),
        "mappingSteps" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "onboarding_telemetry_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "moat_evaluation_runs" (
        "id" TEXT NOT NULL,
        "fixtureId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "model" TEXT NOT NULL,
        "mode" TEXT NOT NULL,
        "scoresJson" JSONB NOT NULL,
        "passed" BOOLEAN NOT NULL,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "moat_evaluation_runs_pkey" PRIMARY KEY ("id")
      );
    `);

    // AI usage and cost controls (2026-08-16)
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        CREATE TYPE "AiBudgetScope" AS ENUM ('GLOBAL', 'ORGANIZATION', 'FEATURE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ai_logical_requests" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT,
        "feature" TEXT NOT NULL,
        "subFeature" TEXT,
        "workloadProfile" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'in_progress',
        "providerCallCount" INTEGER NOT NULL DEFAULT 0,
        "totalCostUsdMicros" BIGINT NOT NULL DEFAULT 0,
        "isBackground" BOOLEAN NOT NULL DEFAULT false,
        "idempotencyKey" TEXT,
        "errorCategory" TEXT,
        "resultSummary" JSONB,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3),
        CONSTRAINT "ai_logical_requests_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ai_budget_configs" (
        "id" TEXT NOT NULL,
        "scope" "AiBudgetScope" NOT NULL,
        "organizationId" TEXT,
        "feature" TEXT,
        "monthlyBudgetUsdMicros" BIGINT,
        "dailyBudgetUsdMicros" BIGINT,
        "softThresholdsPercent" JSONB,
        "hardBlockAtPercent" INTEGER NOT NULL DEFAULT 100,
        "allowOverride" BOOLEAN NOT NULL DEFAULT false,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ai_budget_configs_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ai_org_spend_locks" (
        "organizationId" TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ai_org_spend_locks_pkey" PRIMARY KEY ("organizationId")
      );
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "ai_usage_events"
        ADD COLUMN IF NOT EXISTS "userId" TEXT,
        ADD COLUMN IF NOT EXISTS "logicalRequestId" TEXT,
        ADD COLUMN IF NOT EXISTS "feature" TEXT,
        ADD COLUMN IF NOT EXISTS "subFeature" TEXT,
        ADD COLUMN IF NOT EXISTS "workloadProfile" TEXT,
        ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'success',
        ADD COLUMN IF NOT EXISTS "isFallback" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "originalProvider" TEXT,
        ADD COLUMN IF NOT EXISTS "fallbackReason" TEXT,
        ADD COLUMN IF NOT EXISTS "retryNumber" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "totalTokensReported" INTEGER,
        ADD COLUMN IF NOT EXISTS "estimatedCostUsdMicros" BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "pricingVersion" TEXT,
        ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
        ADD COLUMN IF NOT EXISTS "calculationMode" TEXT,
        ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER,
        ADD COLUMN IF NOT EXISTS "errorCategory" TEXT,
        ADD COLUMN IF NOT EXISTS "isBackground" BOOLEAN NOT NULL DEFAULT false;
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "ai_usage_events"
      SET "estimatedCostUsdMicros" = ("estimatedCostUsdCents"::bigint * 10000)
      WHERE "estimatedCostUsdMicros" = 0 AND "estimatedCostUsdCents" > 0;
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "ai_usage_events"
      SET "feature" = COALESCE("feature", "taskType", 'unknown')
      WHERE "feature" IS NULL;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_logical_requests_organizationId_createdAt_idx"
        ON "ai_logical_requests"("organizationId", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_logical_requests_feature_createdAt_idx"
        ON "ai_logical_requests"("feature", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_logical_requests_organizationId_idempotencyKey_idx"
        ON "ai_logical_requests"("organizationId", "idempotencyKey")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_logical_requests_status_idx"
        ON "ai_logical_requests"("status")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_usage_events_feature_createdAt_idx"
        ON "ai_usage_events"("feature", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_usage_events_provider_createdAt_idx"
        ON "ai_usage_events"("provider", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_usage_events_model_createdAt_idx"
        ON "ai_usage_events"("model", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_usage_events_logicalRequestId_idx"
        ON "ai_usage_events"("logicalRequestId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_usage_events_status_createdAt_idx"
        ON "ai_usage_events"("status", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_usage_events_isBackground_createdAt_idx"
        ON "ai_usage_events"("isBackground", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_budget_configs_organizationId_scope_idx"
        ON "ai_budget_configs"("organizationId", "scope")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ai_budget_configs_scope_feature_idx"
        ON "ai_budget_configs"("scope", "feature")
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        ALTER TABLE "ai_logical_requests"
          ADD CONSTRAINT "ai_logical_requests_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        ALTER TABLE "ai_budget_configs"
          ADD CONSTRAINT "ai_budget_configs_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        ALTER TABLE "ai_org_spend_locks"
          ADD CONSTRAINT "ai_org_spend_locks_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        ALTER TABLE "ai_usage_events"
          ADD CONSTRAINT "ai_usage_events_logicalRequestId_fkey"
          FOREIGN KEY ("logicalRequestId") REFERENCES "ai_logical_requests"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $repair$;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT,
        ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "organization_memberships" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "organization_invitations" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
        "tokenHash" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "invitedByUserId" TEXT NOT NULL,
        "acceptedAt" TIMESTAMP(3),
        "revokedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_organizationId_userId_key"
        ON "organization_memberships"("organizationId", "userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "organization_memberships_userId_idx"
        ON "organization_memberships"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_tokenHash_key"
        ON "organization_invitations"("tokenHash");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "organization_invitations_organizationId_email_idx"
        ON "organization_invitations"("organizationId", "email");
    `);
    await prisma.$executeRawUnsafe(`
      DO $repair$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'organizationId'
        ) THEN
          INSERT INTO "organization_memberships" (
            "id", "userId", "organizationId", "role", "isActive", "createdAt", "updatedAt"
          )
          SELECT
            CONCAT('mem_', "id"),
            "id",
            "organizationId",
            "role",
            COALESCE("isActive", true),
            "createdAt",
            COALESCE("updatedAt", CURRENT_TIMESTAMP)
          FROM "users"
          WHERE "organizationId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "organization_memberships" m WHERE m."userId" = "users"."id"
            );
        END IF;
      END $repair$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $fk$ BEGIN
        ALTER TABLE "organization_memberships"
          ADD CONSTRAINT "organization_memberships_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $fk$ BEGIN
        ALTER TABLE "organization_memberships"
          ADD CONSTRAINT "organization_memberships_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $fk$ BEGIN
        ALTER TABLE "organization_invitations"
          ADD CONSTRAINT "organization_invitations_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $fk$ BEGIN
        ALTER TABLE "organization_invitations"
          ADD CONSTRAINT "organization_invitations_invitedByUserId_fkey"
          FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;
    `);
    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "staff_members_userId_key";
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "staff_members" DROP CONSTRAINT IF EXISTS "staff_members_userId_key";
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "staff_members_organizationId_userId_key"
        ON "staff_members"("organizationId", "userId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $emailuniq$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "users" GROUP BY lower(email) HAVING COUNT(*) > 1
        ) THEN
          CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
        END IF;
      END $emailuniq$;
    `);
    await prisma.$executeRawUnsafe(`
      SELECT 1 FROM "organization_memberships" LIMIT 1;
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
