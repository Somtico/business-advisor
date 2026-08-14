-- CreateEnum
CREATE TYPE "ImpactType" AS ENUM ('SAVINGS', 'REVENUE');

-- CreateEnum
CREATE TYPE "ImpactRealizationSource" AS ENUM ('MEASURED', 'USER_CONFIRMED');

-- CreateEnum
CREATE TYPE "RecommendationSource" AS ENUM ('INSIGHT', 'ADVISOR_CHAT', 'MANUAL');

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "baselineJson" JSONB,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "impactType" "ImpactType",
ADD COLUMN     "realizedNote" TEXT,
ADD COLUMN     "realizedSource" "ImpactRealizationSource",
ADD COLUMN     "source" "RecommendationSource" NOT NULL DEFAULT 'INSIGHT',
ADD COLUMN     "verificationDueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "recommendations_organizationId_realizedAt_idx" ON "recommendations"("organizationId", "realizedAt");

-- CreateIndex
CREATE INDEX "recommendations_organizationId_verificationDueAt_idx" ON "recommendations"("organizationId", "verificationDueAt");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
