-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "pricingTargetMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
