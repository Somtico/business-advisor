-- Moat intelligence flywheel foundation (16 August 2026)
-- Preserves anonymized_tactic_outcomes / somtico_models_v1 unchanged.

DO $$ BEGIN
  CREATE TYPE "OwnerDecision" AS ENUM ('ACCEPTED', 'REJECTED', 'DEFERRED', 'MODIFIED', 'NOT_ACTED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LifecycleOutcome" AS ENUM ('PENDING', 'HELPED', 'NO_EFFECT', 'HURT', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OutcomeVerificationType" AS ENUM ('NONE', 'PENDING', 'MEASURED', 'USER_CONFIRMED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LearningEligibility" AS ENUM ('INELIGIBLE', 'ELIGIBLE_PENDING_CONSENT', 'SHARED', 'WITHDRAWN_BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MappingReviewStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS "decision_outcomes_recommendationId_key" ON "decision_outcomes"("recommendationId");
CREATE INDEX IF NOT EXISTS "decision_outcomes_organizationId_createdAt_idx" ON "decision_outcomes"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "decision_outcomes_organizationId_diagnosisCode_idx" ON "decision_outcomes"("organizationId", "diagnosisCode");
CREATE INDEX IF NOT EXISTS "decision_outcomes_organizationId_lifecycleOutcome_idx" ON "decision_outcomes"("organizationId", "lifecycleOutcome");

DO $$ BEGIN
  ALTER TABLE "decision_outcomes"
    ADD CONSTRAINT "decision_outcomes_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "decision_outcomes"
    ADD CONSTRAINT "decision_outcomes_recommendationId_fkey"
    FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS "learning_consents_organizationId_purposeVersion_key"
  ON "learning_consents"("organizationId", "purposeVersion");
CREATE INDEX IF NOT EXISTS "learning_consents_purposeVersion_withdrawnAt_idx"
  ON "learning_consents"("purposeVersion", "withdrawnAt");

DO $$ BEGIN
  ALTER TABLE "learning_consents"
    ADD CONSTRAINT "learning_consents_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE INDEX IF NOT EXISTS "anonymized_outcome_observations_v2_purposeVersion_diagnosedLeak_interventionCategory_outcome_idx"
  ON "anonymized_outcome_observations_v2"("purposeVersion", "diagnosedLeak", "interventionCategory", "outcome");
CREATE INDEX IF NOT EXISTS "anonymized_outcome_observations_v2_contributorKey_purposeVersion_idx"
  ON "anonymized_outcome_observations_v2"("contributorKey", "purposeVersion");

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

CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_metric_definitions_metricKey_definitionVersion_key"
  ON "benchmark_metric_definitions"("metricKey", "definitionVersion");

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

CREATE INDEX IF NOT EXISTS "anonymized_benchmark_snapshots_metricKey_definitionVersion_reportingPeriod_idx"
  ON "anonymized_benchmark_snapshots"("metricKey", "definitionVersion", "reportingPeriod");
CREATE INDEX IF NOT EXISTS "anonymized_benchmark_snapshots_contributorKey_purposeVersion_idx"
  ON "anonymized_benchmark_snapshots"("contributorKey", "purposeVersion");

DO $$ BEGIN
  ALTER TABLE "anonymized_benchmark_snapshots"
    ADD CONSTRAINT "anonymized_benchmark_snapshots_metricDefinitionId_fkey"
    FOREIGN KEY ("metricDefinitionId") REFERENCES "benchmark_metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS "source_mapping_knowledge_sourceSystemType_schemaFingerprint_sourceFieldName_proposedCanonical_version_key"
  ON "source_mapping_knowledge"("sourceSystemType", "schemaFingerprint", "sourceFieldName", "proposedCanonical", "version");
CREATE INDEX IF NOT EXISTS "source_mapping_knowledge_sourceSystemType_schemaFingerprint_idx"
  ON "source_mapping_knowledge"("sourceSystemType", "schemaFingerprint");
CREATE INDEX IF NOT EXISTS "source_mapping_knowledge_reviewStatus_confidence_idx"
  ON "source_mapping_knowledge"("reviewStatus", "confidence");

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

CREATE INDEX IF NOT EXISTS "onboarding_telemetry_organizationId_idx" ON "onboarding_telemetry"("organizationId");

DO $$ BEGIN
  ALTER TABLE "onboarding_telemetry"
    ADD CONSTRAINT "onboarding_telemetry_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE INDEX IF NOT EXISTS "moat_evaluation_runs_fixtureId_createdAt_idx"
  ON "moat_evaluation_runs"("fixtureId", "createdAt");
