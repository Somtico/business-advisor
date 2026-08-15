-- Existing opted-in rows stay playbook-only. New opt-ins write somtico_models_v1 in application code.
ALTER TABLE "anonymized_tactic_outcomes"
  ADD COLUMN IF NOT EXISTS "purposeVersion" TEXT NOT NULL DEFAULT 'playbook_counts_v1';
