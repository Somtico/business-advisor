jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    authSession: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import prisma from '../config/prisma';
import {
  SessionAuthError,
  assertAuthSession,
  createAuthSession,
  revokeAllAuthSessionsForUser,
  revokeAuthSession,
} from './authSessionService';

function sessionRow(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'sess-1',
    userId: 'user-1',
    createdAt: new Date(now - 60_000),
    lastActivityAt: new Date(now - 5_000),
    expiresAt: new Date(now + 8 * 60 * 60 * 1000),
    revokedAt: null,
    ...overrides,
  };
}

describe('assertAuthSession', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.SESSION_IDLE_MINUTES = '15';
    process.env.SESSION_ABSOLUTE_HOURS = '8';
    process.env.SESSION_TOUCH_THROTTLE_SECONDS = '30';
    (prisma.authSession.update as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => sessionRow(data)
    );
    (prisma.authSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects a missing session id', async () => {
    await expect(assertAuthSession(undefined, 'user-1')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    });
  });

  it('rejects a revoked session', async () => {
    (prisma.authSession.findFirst as jest.Mock).mockResolvedValue(
      sessionRow({ revokedAt: new Date() })
    );
    await expect(assertAuthSession('sess-1', 'user-1')).rejects.toBeInstanceOf(
      SessionAuthError
    );
    await expect(assertAuthSession('sess-1', 'user-1')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('revokes and rejects an idle session', async () => {
    (prisma.authSession.findFirst as jest.Mock).mockResolvedValue(
      sessionRow({ lastActivityAt: new Date(Date.now() - 16 * 60 * 1000) })
    );
    await expect(assertAuthSession('sess-1', 'user-1')).rejects.toMatchObject({
      code: 'SESSION_IDLE',
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalled();
  });

  it('revokes and rejects an absolutely expired session', async () => {
    (prisma.authSession.findFirst as jest.Mock).mockResolvedValue(
      sessionRow({ expiresAt: new Date(Date.now() - 1000) })
    );
    await expect(assertAuthSession('sess-1', 'user-1')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('accepts an active session without writing when recently touched', async () => {
    const row = sessionRow({ lastActivityAt: new Date() });
    (prisma.authSession.findFirst as jest.Mock).mockResolvedValue(row);
    const result = await assertAuthSession('sess-1', 'user-1');
    expect(result.id).toBe('sess-1');
    expect(prisma.authSession.update).not.toHaveBeenCalled();
  });
});

describe('createAuthSession', () => {
  it('stores an absolute expiry', async () => {
    (prisma.authSession.create as jest.Mock).mockImplementation(async ({ data }: { data: { expiresAt: Date } }) => ({
      id: 'sess-new',
      userId: 'user-1',
      createdAt: new Date(),
      lastActivityAt: data.expiresAt,
      ...data,
      revokedAt: null,
    }));
    const created = await createAuthSession('user-1');
    expect(created.id).toBe('sess-new');
    expect(prisma.authSession.create).toHaveBeenCalled();
  });
});

describe('revoke helpers', () => {
  beforeEach(() => {
    (prisma.authSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('revokes one session', async () => {
    await revokeAuthSession('sess-1');
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'sess-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes every session for a user', async () => {
    await revokeAllAuthSessionsForUser('user-1');
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
