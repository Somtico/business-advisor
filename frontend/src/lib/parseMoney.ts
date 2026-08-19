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
