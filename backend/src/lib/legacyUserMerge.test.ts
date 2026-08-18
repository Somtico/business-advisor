import { planLegacyEmailMerge } from './legacyUserMerge';

describe('legacy email merge', () => {
  it('keeps the oldest user as canonical and creates a membership per organization', () => {
    const plans = planLegacyEmailMerge([
      {
        id: 'u2',
        email: 'Ada@Example.com',
        passwordHash: 'h1',
        createdAt: '2026-08-02T00:00:00.000Z',
        organizationId: 'org-b',
        role: 'ADMIN',
      },
      {
        id: 'u1',
        email: 'ada@example.com',
        passwordHash: 'h1',
        createdAt: '2026-08-01T00:00:00.000Z',
        organizationId: 'org-a',
        role: 'OWNER',
      },
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].canonicalId).toBe('u1');
    expect(plans[0].discardedIds).toEqual(['u2']);
    expect(plans[0].passwordResetRequired).toBe(false);
    expect(plans[0].memberships).toEqual([
      { organizationId: 'org-a', role: 'OWNER', userId: 'u1' },
      { organizationId: 'org-b', role: 'ADMIN', userId: 'u1' },
    ]);
  });

  it('requires a password reset when duplicate emails have different hashes', () => {
    const plans = planLegacyEmailMerge([
      {
        id: 'a',
        email: 'same@example.com',
        passwordHash: 'hash-a',
        createdAt: '2026-01-01T00:00:00.000Z',
        organizationId: 'org-1',
        role: 'OWNER',
      },
      {
        id: 'b',
        email: 'same@example.com',
        passwordHash: 'hash-b',
        createdAt: '2026-02-01T00:00:00.000Z',
        organizationId: 'org-2',
        role: 'VIEWER',
      },
    ]);
    expect(plans[0].passwordResetRequired).toBe(true);
    expect(plans[0].canonicalId).toBe('a');
  });
});
