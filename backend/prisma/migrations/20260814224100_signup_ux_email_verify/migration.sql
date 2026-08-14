-- Rename STEM / Coding → STEM Academy; add OTHER subtype
ALTER TYPE "EducationSubtype" RENAME VALUE 'STEM_CODING_ACADEMY' TO 'STEM_ACADEMY';
ALTER TYPE "EducationSubtype" ADD VALUE 'OTHER';

-- Free-text when subtype is OTHER
ALTER TABLE "organizations" ADD COLUMN "educationSubtypeOther" TEXT;
ALTER TABLE "organizations" ALTER COLUMN "educationSubtype" SET DEFAULT 'STEM_ACADEMY';

-- Email verification (existing users treated as verified so login keeps working)
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerificationExpires" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "usedVerificationTokens" JSONB NOT NULL DEFAULT '[]';

UPDATE "users" SET "emailVerified" = true;

CREATE INDEX "users_emailVerificationToken_idx" ON "users"("emailVerificationToken");
