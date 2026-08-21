-- Server-side login sessions for idle (15 min) and absolute (8 h) timeout.

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "auth_sessions_userId_revokedAt_idx"
  ON "auth_sessions"("userId", "revokedAt");

CREATE INDEX IF NOT EXISTS "auth_sessions_expiresAt_idx"
  ON "auth_sessions"("expiresAt");

DO $fk$ BEGIN
  ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $fk$;
