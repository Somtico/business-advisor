/**
 * Legal constants shared across the API surface.
 * Bump TERMS_VERSION whenever the Terms of Service change so acceptance
 * records stay tied to the exact text a user agreed to.
 * Bump PRIVACY_VERSION the same way when the Privacy Policy text changes.
 *
 * Corpus purposeVersion strings are immutable once shipped — never redefine
 * somtico_models_v1. Add a new version string for new learning schemas.
 */
export const TERMS_VERSION = '2026-08-14.4';
export const PRIVACY_VERSION = '2026-08-15.2';

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

export const DECISION_OUTCOME_SCHEMA_VERSION = 'decision_outcome_v1';
export const DECISION_CONTEXT_SCHEMA_VERSION = 'decision_context_v1';
export const OUTCOME_OBSERVATION_V2_SCHEMA_VERSION = 'outcome_observation_v2';
export const BENCHMARK_SNAPSHOT_SCHEMA_VERSION = 'benchmark_snapshot_v1';

/** Default minimum comparable peers before claiming contextual playbook evidence. */
export const DEFAULT_MIN_PEER_CONTEXT_SAMPLE = 8;

export const ADVICE_DISCLAIMER =
  'AI Business Advisor provides analytics and suggestions for information purposes only. ' +
  'It is not financial, legal, tax, accounting, or investment advice. All figures are ' +
  'derived from the data you provide; verify them before acting. Decisions and their ' +
  'outcomes remain solely your responsibility.';
