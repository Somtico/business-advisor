import { createHash } from 'crypto';

/** Stable fingerprint of a source schema (field names + types only — no values). */
export function schemaFingerprint(
  fields: Array<{ name: string; dataType?: string | null }>
): string {
  const normalized = fields
    .map((f) => `${f.name.trim().toLowerCase()}:${(f.dataType || 'unknown').toLowerCase()}`)
    .sort()
    .join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}
