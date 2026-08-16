/**
 * Legal constants shared across the API surface.
 * Bump TERMS_VERSION whenever the Terms of Service change so acceptance
 * records stay tied to the exact text a user agreed to.
 * Bump PRIVACY_VERSION the same way when the Privacy Policy text changes.
 */
export const TERMS_VERSION = '2026-08-14.4';
export const PRIVACY_VERSION = '2026-08-15.1';

/** De-identified tactic rows written under this purpose may later train Somtico-owned models. */
export const OUTCOME_CORPUS_PURPOSE_VERSION = 'somtico_models_v1';
/** Legacy opted-in rows collected for playbook counts only; do not put them in a training corpus. */
export const OUTCOME_CORPUS_PLAYBOOK_ONLY_VERSION = 'playbook_counts_v1';

export const ADVICE_DISCLAIMER =
  'AI Business Advisor provides analytics and suggestions for information purposes only. ' +
  'It is not financial, legal, tax, accounting, or investment advice. All figures are ' +
  'derived from the data you provide; verify them before acting. Decisions and their ' +
  'outcomes remain solely your responsibility.';
