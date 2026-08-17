-- Soft Help Improve Advisor invitation snooze (30-day re-invite for OFF orgs).
ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "learningInviteSnoozedUntil" TIMESTAMP(3);
