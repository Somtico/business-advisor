/**
 * Documents how legacy User rows that share an email are merged onto one identity.
 * The SQL migration is what production runs; this function is the testable spec.
 */
export type LegacyUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  organizationId: string;
  role: string;
};

export type MergePlan = {
  canonicalId: string;
  discardedIds: string[];
  memberships: Array<{ organizationId: string; role: string; userId: string }>;
  passwordResetRequired: boolean;
};

export function planLegacyEmailMerge(rows: LegacyUserRow[]): MergePlan[] {
  const byEmail = new Map<string, LegacyUserRow[]>();
  for (const row of rows) {
    const key = row.email.toLowerCase();
    const list = byEmail.get(key) ?? [];
    list.push(row);
    byEmail.set(key, list);
  }

  const plans: MergePlan[] = [];
  for (const group of byEmail.values()) {
    const sorted = [...group].sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt)
    );
    const canonical = sorted[0];
    const discarded = sorted.slice(1);
    const hashes = new Set(sorted.map((r) => r.passwordHash));
    plans.push({
      canonicalId: canonical.id,
      discardedIds: discarded.map((r) => r.id),
      memberships: sorted.map((r) => ({
        organizationId: r.organizationId,
        role: r.role,
        userId: canonical.id,
      })),
      passwordResetRequired: hashes.size > 1,
    });
  }
  return plans;
}
