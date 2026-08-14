-- CreateEnum
CREATE TYPE "EnrolmentTacticKey" AS ENUM ('TRIAL_FOLLOWUP', 'FAMILY_REFERRAL', 'SCHOOL_OUTREACH', 'OPEN_HOUSE', 'SCHEDULE_CHANGE', 'WAITLIST', 'PRICE_PROMO', 'SOCIAL_ORGANIC', 'PAID_ADS', 'OTHER');

-- CreateEnum
CREATE TYPE "TacticOutcome" AS ENUM ('HELPED', 'NO_EFFECT', 'HURT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TacticCostBand" AS ENUM ('FREE', 'LOW', 'PAID');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "privacyVersion" TEXT;

-- CreateTable
CREATE TABLE "enrolment_tactics_tried" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrolment_tactics_tried_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymized_tactic_outcomes" (
    "id" TEXT NOT NULL,
    "tacticKey" "EnrolmentTacticKey" NOT NULL,
    "outcome" "TacticOutcome" NOT NULL,
    "costBand" "TacticCostBand" NOT NULL,
    "leakType" TEXT NOT NULL,
    "educationBucket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymized_tactic_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrolment_tactics_tried_organizationId_createdAt_idx" ON "enrolment_tactics_tried"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "anonymized_tactic_outcomes_tacticKey_leakType_outcome_idx" ON "anonymized_tactic_outcomes"("tacticKey", "leakType", "outcome");

-- AddForeignKey
ALTER TABLE "enrolment_tactics_tried" ADD CONSTRAINT "enrolment_tactics_tried_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
