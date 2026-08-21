import prisma from '../config/prisma';
import { getSessionPolicy, publicSessionPolicy } from '../config/session';

export class SessionAuthError extends Error {
  status = 401;
  code: 'SESSION_IDLE' | 'SESSION_EXPIRED';

  constructor(
    code: 'SESSION_IDLE' | 'SESSION_EXPIRED',
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = 'SessionAuthError';
  }
}

export type AuthSessionRow = {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export async function createAuthSession(userId: string): Promise<AuthSessionRow> {
  const policy = getSessionPolicy();
  const now = new Date();
  return prisma.authSession.create({
    data: {
      userId,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + policy.absoluteTimeoutMs),
    },
  });
}

export function sessionClientPayload(session: AuthSessionRow) {
  return {
    ...publicSessionPolicy(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function assertAuthSession(
  sessionId: string | undefined,
  userId: string
): Promise<AuthSessionRow> {
  if (!sessionId) {
    throw new SessionAuthError(
      'SESSION_EXPIRED',
      'Your session is no longer valid. Sign in again.'
    );
  }

  const session = await prisma.authSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session || session.revokedAt) {
    throw new SessionAuthError(
      'SESSION_EXPIRED',
      'Your session is no longer valid. Sign in again.'
    );
  }

  const now = Date.now();
  if (now >= session.expiresAt.getTime()) {
    await revokeAuthSession(session.id);
    throw new SessionAuthError(
      'SESSION_EXPIRED',
      'Your session reached its maximum length. Sign in again.'
    );
  }

  const policy = getSessionPolicy();
  if (now - session.lastActivityAt.getTime() >= policy.idleTimeoutMs) {
    await revokeAuthSession(session.id);
    throw new SessionAuthError(
      'SESSION_IDLE',
      'You were signed out after a period of inactivity.'
    );
  }

  return touchAuthSession(session);
}

export async function touchAuthSession(
  session: AuthSessionRow
): Promise<AuthSessionRow> {
  const policy = getSessionPolicy();
  const now = Date.now();
  if (now - session.lastActivityAt.getTime() < policy.touchThrottleMs) {
    return session;
  }
  return prisma.authSession.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date(now) },
  });
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllAuthSessionsForUser(userId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
