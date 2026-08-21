import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { getSessionPolicy } from '../config/session';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  /** AuthSession id. Required for idle/absolute timeout and server-side revoke. */
  sid?: string;
  /** Active workspace. Omitted until the person selects one. */
  organizationId?: string;
  membershipId?: string;
  role?: UserRole;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, secret(), {
    expiresIn: getSessionPolicy().jwtExpiresIn,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  return jwt.sign({ ...payload, type: 'refresh' }, secret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret()) as AccessTokenPayload & {
    type?: string;
  };
  if (decoded.type === 'refresh') {
    throw new Error('Refresh token used as access token');
  }
  return decoded;
}
