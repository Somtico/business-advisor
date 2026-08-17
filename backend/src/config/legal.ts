/**
 * Legal constants shared across the API surface.
 * Bump TERMS_VERSION whenever the Terms of Service change so acceptance
 * records stay tied to the exact text a user agreed to.
 * Bump PRIVACY_VERSION the same way when the Privacy Policy text changes.
 *
 * Corpus purposeVersion strings are immutable once shipped — never redefine
 * somtico_models_v1. Add a new version string for new learning schemas.
 */
export const TERMS_VERSION = '2026-08-16.2';
export const PRIVACY_VERSION = '2026-08-16.2';

/**
 * Material legal update notice for users who already accepted an older version.
 * Published 16 August 2026; effective date respects the Terms promise that
 * material changes take effect no less than 30 days after notice.
 * New signups accept TERMS_VERSION / PRIVACY_VERSION immediately.
 * Existing users are not rewritten to the new version; after the effective
 * date they must explicitly re-accept before continuing in the app.
 */
export const LEGAL_NOTICE_PUBLISHED_AT = '2026-08-16';
export const LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT = '2026-09-15';

/** De-identified tactic rows written under this purpose may later train Somtico-owned models. */
export const OUTCOME_CORPUS_PURPOSE_VERSION = 'somtico_models_v1';
/** Legacy opted-in rows collected for playbook counts only; do not put them in a training corpus. */
export const OUTCOME_CORPUS_PLAYBOOK_ONLY_VERSION = 'playbook_counts_v1';
/**
 * V2 privacy-safe decision/outcome observations (context bands + diagnosis +
 * intervention + outcome). Distinct from somtico_models_v1.
 */
export const OUTCOME_CORPUS_PURPOSE_VERSION_V2 = 'somtico_models_v2';
/** Opt-in privacy-safe benchmark metric snapshots (customer UI deferred). */
export const BENCHMARK_SNAPSHOTS_PURPOSE_VERSION = 'benchmark_snapshots_v1';
/**
 * Customer-facing Help Improve Advisor setting version (audit / notes).
 * Enabling the setting grants the internal purposes listed in
 * HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES — not a separate anonymized table.
 */
export const HELP_IMPROVE_ADVISOR_SETTING_VERSION = 'help_improve_advisor_v1';
/** Internal LearningConsent purposeVersions authorized by Help Improve Advisor. */
export const HELP_IMPROVE_ADVISOR_INTERNAL_PURPOSES = [
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
] as const;

export const DECISION_OUTCOME_SCHEMA_VERSION = 'decision_outcome_v1';
export const DECISION_CONTEXT_SCHEMA_VERSION = 'decision_context_v1';
export const OUTCOME_OBSERVATION_V2_SCHEMA_VERSION = 'outcome_observation_v2';
export const BENCHMARK_SNAPSHOT_SCHEMA_VERSION = 'benchmark_snapshot_v1';

/** Default minimum comparable peers before claiming contextual playbook evidence. */
export const DEFAULT_MIN_PEER_CONTEXT_SAMPLE = 8;

export const ADVICE_DISCLAIMER =
  'Somtico Business Advisor provides analytics and suggestions for information purposes only. ' +
  'It is not financial, legal, tax, accounting, or investment advice. All figures are ' +
  'derived from the data you provide; verify them before acting. Decisions and their ' +
  'outcomes remain solely your responsibility.';

export function materialLegalChangeIsInForce(now: Date = new Date()): boolean {
  const effective = new Date(`${LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT}T00:00:00.000Z`);
  return now.getTime() >= effective.getTime();
}

/**
 * Whether a stored acceptance is current.
 * Before the material-change effective date, older acceptances remain valid
 * for continued use (notice period). After that date, versions must match.
 */
export function needsLegalReacceptance(params: {
  termsVersion: string | null | undefined;
  privacyVersion: string | null | undefined;
  now?: Date;
}): boolean {
  const termsOk = params.termsVersion === TERMS_VERSION;
  const privacyOk = params.privacyVersion === PRIVACY_VERSION;
  if (termsOk && privacyOk) return false;
  if (!materialLegalChangeIsInForce(params.now)) return false;
  return true;
}

/** Client-facing legal acceptance status derived from stored version stamps. */
export function legalAcceptanceStatus(params: {
  termsVersion: string | null | undefined;
  privacyVersion: string | null | undefined;
  now?: Date;
}) {
  const current =
    params.termsVersion === TERMS_VERSION &&
    params.privacyVersion === PRIVACY_VERSION;
  const pendingNotice = !current && !materialLegalChangeIsInForce(params.now);
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedTermsVersion: params.termsVersion ?? null,
    acceptedPrivacyVersion: params.privacyVersion ?? null,
    noticePublishedAt: LEGAL_NOTICE_PUBLISHED_AT,
    materialChangeEffectiveAt: LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT,
    materialChangeInForce: materialLegalChangeIsInForce(params.now),
    current,
    /** Soft notice during the ≥30-day window; acceptance not yet required. */
    pendingNotice,
    /** Hard gate after the effective date when versions are stale. */
    requiresReacceptance: needsLegalReacceptance(params),
  };
}
