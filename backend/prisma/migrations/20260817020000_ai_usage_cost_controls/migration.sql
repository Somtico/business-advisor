-- AI usage cost controls, logical requests, budgets, spend locks

CREATE TYPE "AiBudgetScope" AS ENUM ('GLOBAL', 'ORGANIZATION', 'FEATURE');

CREATE TABLE "ai_logical_requests" (
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

CREATE TABLE "ai_budget_configs" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_budget_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_org_spend_locks" (
    "organizationId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_org_spend_locks_pkey" PRIMARY KEY ("organizationId")
);

-- Expand ai_usage_events (preserve existing rows)
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "logicalRequestId" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "feature" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "subFeature" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "workloadProfile" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'success';
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "isFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "originalProvider" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "retryNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "cachedInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "reasoningTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "totalTokensReported" INTEGER;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "estimatedCostUsdMicros" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "pricingVersion" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "calculationMode" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "errorCategory" TEXT;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "isBackground" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_usage_events" ADD COLUMN IF NOT EXISTS "fallbackReason" TEXT;

-- Backfill micros from legacy cents where micros is still 0
UPDATE "ai_usage_events"
SET "estimatedCostUsdMicros" = ("estimatedCostUsdCents"::bigint * 10000)
WHERE "estimatedCostUsdMicros" = 0 AND "estimatedCostUsdCents" > 0;

UPDATE "ai_usage_events"
SET "feature" = COALESCE("feature", "taskType", 'unknown')
WHERE "feature" IS NULL;

ALTER TABLE "ai_logical_requests" ADD CONSTRAINT "ai_logical_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_budget_configs" ADD CONSTRAINT "ai_budget_configs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_org_spend_locks" ADD CONSTRAINT "ai_org_spend_locks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_logicalRequestId_fkey"
  FOREIGN KEY ("logicalRequestId") REFERENCES "ai_logical_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_logical_requests_organizationId_createdAt_idx" ON "ai_logical_requests"("organizationId", "createdAt");
CREATE INDEX "ai_logical_requests_feature_createdAt_idx" ON "ai_logical_requests"("feature", "createdAt");
CREATE INDEX "ai_logical_requests_organizationId_idempotencyKey_idx" ON "ai_logical_requests"("organizationId", "idempotencyKey");
CREATE INDEX "ai_logical_requests_status_idx" ON "ai_logical_requests"("status");

CREATE INDEX "ai_usage_events_feature_createdAt_idx" ON "ai_usage_events"("feature", "createdAt");
CREATE INDEX "ai_usage_events_provider_createdAt_idx" ON "ai_usage_events"("provider", "createdAt");
CREATE INDEX "ai_usage_events_model_createdAt_idx" ON "ai_usage_events"("model", "createdAt");
CREATE INDEX "ai_usage_events_logicalRequestId_idx" ON "ai_usage_events"("logicalRequestId");
CREATE INDEX "ai_usage_events_status_createdAt_idx" ON "ai_usage_events"("status", "createdAt");
CREATE INDEX "ai_usage_events_isBackground_createdAt_idx" ON "ai_usage_events"("isBackground", "createdAt");

CREATE INDEX "ai_budget_configs_organizationId_scope_idx" ON "ai_budget_configs"("organizationId", "scope");
CREATE INDEX "ai_budget_configs_scope_feature_idx" ON "ai_budget_configs"("scope", "feature");
