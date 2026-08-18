-- Multi-organization accounts: User is global identity; OrganizationMembership is workspace access.
-- Duplicate legacy emails (same address in more than one organization) are merged onto the
-- oldest user row. If those rows had different password hashes, passwordResetRequired is set
-- and login is refused until the person completes email password reset. No production data
-- is written by this file except through `prisma migrate deploy`.

-- ---------------------------------------------------------------------------
-- 1. New columns and tables
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "organization_memberships" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

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

-- ---------------------------------------------------------------------------
-- 2. Backfill memberships from legacy User.organizationId + User.role
-- ---------------------------------------------------------------------------

INSERT INTO "organization_memberships" (
  "id", "userId", "organizationId", "role", "isActive", "createdAt", "updatedAt"
)
SELECT
  CONCAT('mem_', "id"),
  "id",
  "organizationId",
  "role",
  "isActive",
  "createdAt",
  "updatedAt"
FROM "users"
WHERE "organizationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" m WHERE m."userId" = "users"."id"
  );

-- ---------------------------------------------------------------------------
-- 3. Merge duplicate emails onto the oldest user (deterministic)
-- ---------------------------------------------------------------------------

-- passwordResetRequired when the canonical row's hash differs from any duplicate
UPDATE "users" AS canonical
SET "passwordResetRequired" = true
WHERE canonical."id" IN (
  SELECT keep_id FROM (
    SELECT DISTINCT ON (lower(u.email))
      u."id" AS keep_id,
      u.email AS keep_email,
      u."passwordHash" AS keep_hash
    FROM "users" u
    ORDER BY lower(u.email), u."createdAt" ASC, u."id" ASC
  ) keep
  JOIN "users" other
    ON lower(other.email) = lower(keep.keep_email)
   AND other."passwordHash" <> keep.keep_hash
);

-- Map discarded user ids -> canonical id
CREATE TEMP TABLE "user_merge_map" AS
SELECT
  other."id" AS "fromId",
  keep.keep_id AS "toId"
FROM "users" other
JOIN (
  SELECT DISTINCT ON (lower(u.email))
    u."id" AS keep_id,
    lower(u.email) AS email_key
  FROM "users" u
  ORDER BY lower(u.email), u."createdAt" ASC, u."id" ASC
) keep ON lower(other.email) = keep.email_key
WHERE other."id" <> keep.keep_id;

-- Re-point memberships that still point at discarded users
UPDATE "organization_memberships" m
SET "userId" = map."toId"
FROM "user_merge_map" map
WHERE m."userId" = map."fromId"
  AND NOT EXISTS (
    SELECT 1
    FROM "organization_memberships" existing
    WHERE existing."userId" = map."toId"
      AND existing."organizationId" = m."organizationId"
  );

DELETE FROM "organization_memberships" m
USING "user_merge_map" map
WHERE m."userId" = map."fromId";

UPDATE "staff_members" s
SET "userId" = map."toId"
FROM "user_merge_map" map
WHERE s."userId" = map."fromId"
  AND NOT EXISTS (
    SELECT 1 FROM "staff_members" existing
    WHERE existing."organizationId" = s."organizationId"
      AND existing."userId" = map."toId"
  );

UPDATE "staff_members" s
SET "userId" = NULL
FROM "user_merge_map" map
WHERE s."userId" = map."fromId";

UPDATE "recommendations" r
SET "ownerUserId" = map."toId"
FROM "user_merge_map" map
WHERE r."ownerUserId" = map."fromId";

UPDATE "ai_conversations" c
SET "userId" = map."toId"
FROM "user_merge_map" map
WHERE c."userId" = map."fromId";

UPDATE "audit_events" a
SET "actorUserId" = map."toId"
FROM "user_merge_map" map
WHERE a."actorUserId" = map."fromId";

DO $remap$ BEGIN
  IF to_regclass('public.ai_usage_events') IS NOT NULL THEN
    UPDATE "ai_usage_events" e
    SET "userId" = map."toId"
    FROM "user_merge_map" map
    WHERE e."userId" = map."fromId";
  END IF;
  IF to_regclass('public.ai_logical_requests') IS NOT NULL THEN
    UPDATE "ai_logical_requests" r
    SET "userId" = map."toId"
    FROM "user_merge_map" map
    WHERE r."userId" = map."fromId";
  END IF;
  IF to_regclass('public.learning_consents') IS NOT NULL THEN
    UPDATE "learning_consents" l
    SET "grantedByUserId" = map."toId"
    FROM "user_merge_map" map
    WHERE l."grantedByUserId" = map."fromId";
  END IF;
END $remap$;

DELETE FROM "users" u
USING "user_merge_map" map
WHERE u."id" = map."fromId";

DROP TABLE "user_merge_map";

-- Normalize remaining emails
UPDATE "users" SET email = lower(email) WHERE email <> lower(email);

-- ---------------------------------------------------------------------------
-- 4. Drop legacy user-org identity columns and indexes
-- ---------------------------------------------------------------------------

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organizationId_email_key";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organizationId_fkey";
DROP INDEX IF EXISTS "users_organizationId_email_key";
DROP INDEX IF EXISTS "users_emailVerificationToken_idx";

ALTER TABLE "users" DROP COLUMN IF EXISTS "organizationId";
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_emailVerificationToken_idx" ON "users"("emailVerificationToken");
CREATE INDEX IF NOT EXISTS "users_passwordResetToken_idx" ON "users"("passwordResetToken");

-- ---------------------------------------------------------------------------
-- 5. Membership / invitation constraints
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_organizationId_userId_key"
  ON "organization_memberships"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "organization_memberships_userId_idx"
  ON "organization_memberships"("userId");

DO $fk$ BEGIN
  ALTER TABLE "organization_memberships"
    ADD CONSTRAINT "organization_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN
  ALTER TABLE "organization_memberships"
    ADD CONSTRAINT "organization_memberships_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_tokenHash_key"
  ON "organization_invitations"("tokenHash");
CREATE INDEX IF NOT EXISTS "organization_invitations_organizationId_email_idx"
  ON "organization_invitations"("organizationId", "email");

DO $fk$ BEGIN
  ALTER TABLE "organization_invitations"
    ADD CONSTRAINT "organization_invitations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN
  ALTER TABLE "organization_invitations"
    ADD CONSTRAINT "organization_invitations_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

-- ---------------------------------------------------------------------------
-- 6. Staff members: one linked user per organization, not globally
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "staff_members_userId_key";
ALTER TABLE "staff_members" DROP CONSTRAINT IF EXISTS "staff_members_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "staff_members_organizationId_userId_key"
  ON "staff_members"("organizationId", "userId");
