/**
 * Parse a customer-typed dollar amount into integer cents.
 * Blank stays blank (null). Commas are display-only and are stripped.
 * Does not treat blank as zero.
 */
export function parseDollarInputToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('INVALID_CASH_AMOUNT');
  }
  return Math.round(Number(normalized) * 100);
}

/**
 * Optional cash from a JSON body: omit/null/undefined means "not supplied".
 * Integer cents only. Zero is a real value.
 */
export function parseOptionalCashBalanceCents(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throw new Error('INVALID_CASH_BALANCE');
  }
  return raw;
}
