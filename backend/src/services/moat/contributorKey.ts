import { createHmac } from 'crypto';

/**
 * Privacy-safe contributor pseudonyms for cross-tenant learning tables.
 *
 * =============================================================================
 * WHAT THIS IS (AND IS NOT)
 * =============================================================================
 *
 * This is NOT encryption and NOT reversible anonymization of organizationIds.
 * It is a keyed HMAC that produces a stable pseudonym so we can:
 *   1) store learning/benchmark rows WITHOUT organizationId, and
 *   2) still delete that org's contributed rows on consent withdrawal.
 *
 * Anyone with the salt and organizationId can recompute the same key.
 * Anyone without the salt cannot usefully reverse a key back to an org id.
 *
 * =============================================================================
 * WHY organizationId MUST NOT APPEAR ON ANONYMIZED TABLES
 * =============================================================================
 *
 * Cross-tenant learning tables (V2 outcomes, benchmark snapshots) must never
 * contain organizationId, names, emails, or free text. A contributorKey is the
 * only org-linked handle we keep, and only as an irreversible (without the salt)
 * pseudonym for withdrawal cleanup.
 *
 * =============================================================================
 * WHY purposeVersion IS PART OF THE HMAC INPUT
 * =============================================================================
 *
 * Different learning purposes must not share one universal pseudonym.
 * HMAC(salt, `${purposeVersion}:${organizationId}`) means:
 *   - somtico_models_v2       → one contributorKey for that org
 *   - benchmark_snapshots_v1  → a different contributorKey for the same org
 * Withdrawal of one purpose therefore cannot target rows of another purpose
 * even if a caller forgot an extra purposeVersion filter.
 *
 * =============================================================================
 * WHY LEARNING_CONTRIBUTOR_SALT MUST BE SEPARATE FROM JWT_SECRET
 * =============================================================================
 *
 * JWT_SECRET authenticates sessions. LEARNING_CONTRIBUTOR_SALT pseudonymizes
 * learning contributors. Tying them together would couple auth-secret rotation
 * to irreversible learning-row identity, and would expand blast radius if either
 * secret leaked. Production must set LEARNING_CONTRIBUTOR_SALT explicitly and
 * must never fall back to JWT_SECRET.
 *
 * =============================================================================
 * SECRET ROTATION (NOT AUTOMATED)
 * =============================================================================
 *
 * LEARNING_CONTRIBUTOR_SALT is a long-lived privacy pseudonymization secret.
 * Changing it without an explicit migration makes previously generated
 * contributorKeys impossible to reproduce, so consent withdrawal can no longer
 * find historical anonymized rows for that org/purpose.
 * Future rotation requires a planned migration strategy (for example: dual-salt
 * re-key window). Do not rotate casually in production.
 */

/** Non-production only. Never used when NODE_ENV=production. */
export const DEV_LEARNING_CONTRIBUTOR_SALT_FALLBACK =
  'business-advisor-dev-learning-salt-not-for-production';

export class LearningContributorSaltConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LearningContributorSaltConfigError';
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve the dedicated learning salt.
 * Production: LEARNING_CONTRIBUTOR_SALT required (no JWT_SECRET fallback).
 * Development/test: dedicated env preferred; documented local fallback otherwise.
 */
export function resolveLearningContributorSalt(): string {
  const dedicated = (process.env.LEARNING_CONTRIBUTOR_SALT || '').trim();

  if (isProductionRuntime()) {
    if (!dedicated) {
      throw new LearningContributorSaltConfigError(
        'LEARNING_CONTRIBUTOR_SALT is required in production and must be a ' +
          'non-empty dedicated secret (do not use JWT_SECRET).'
      );
    }
    return dedicated;
  }

  if (dedicated) return dedicated;
  return DEV_LEARNING_CONTRIBUTOR_SALT_FALLBACK;
}

/**
 * Fail production startup early if the dedicated learning salt is missing/blank.
 * Safe to call in all environments; no-ops outside production when fallback is allowed.
 * Never logs the secret value.
 */
export function assertLearningContributorSaltConfigured(): void {
  if (!isProductionRuntime()) return;
  // Throws LearningContributorSaltConfigError when absent/blank.
  resolveLearningContributorSalt();
}

/**
 * Canonical contributor-key derivation for all moat learning/benchmark code paths.
 * Always pass both organizationId and purposeVersion.
 */
export function deriveContributorKey(
  organizationId: string,
  purposeVersion: string
): string {
  if (!organizationId || !purposeVersion) {
    throw new Error(
      'deriveContributorKey requires organizationId and purposeVersion'
    );
  }
  const salt = resolveLearningContributorSalt();
  return createHmac('sha256', salt)
    .update(`${purposeVersion}:${organizationId}`)
    .digest('hex');
}
