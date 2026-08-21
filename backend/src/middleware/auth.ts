import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import prisma from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import {
  SessionAuthError,
  assertAuthSession,
  type AuthSessionRow,
} from '../services/authSessionService';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        organizationId: string;
        membershipId?: string;
        role?: UserRole;
        sessionId: string;
      };
      authSession?: AuthSessionRow;
    }
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' },
      });
      return;
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    const session = await assertAuthSession(payload.sid, payload.userId);
    req.authSession = session;

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' },
      });
      return;
    }

    const organizationId = payload.organizationId || undefined;
    let membershipId = payload.membershipId;
    let role = payload.role;

    if (organizationId) {
      const membership = await prisma.organizationMembership.findFirst({
        where: {
          userId: user.id,
          organizationId,
          isActive: true,
        },
      });
      if (!membership) {
        res.status(403).json({
          success: false,
          error: {
            code: 'WORKSPACE_FORBIDDEN',
            message: 'You do not have access to this organization.',
          },
        });
        return;
      }
      membershipId = membership.id;
      role = membership.role;

      if (req.organization && req.organization.id !== organizationId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_MISMATCH',
            message: 'Token organization does not match request tenant',
          },
        });
        return;
      }

      if (req.tenantSlug && req.tenantSlug !== req.organization?.slug) {
        const hinted = await prisma.organization.findUnique({
          where: { slug: req.tenantSlug },
          select: { id: true, slug: true },
        });
        if (!hinted || hinted.id !== organizationId) {
          res.status(403).json({
            success: false,
            error: {
              code: 'TENANT_MISMATCH',
              message: 'Token organization does not match request tenant',
            },
          });
          return;
        }
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: organizationId || '',
      membershipId,
      role,
      sessionId: session.id,
    };
    next();
  } catch (err) {
    if (err instanceof SessionAuthError) {
      res.status(401).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }
    next();
  };
}

/**
 * Tenant-scoped routes: workspace comes from the authenticated membership,
 * never from X-Tenant-Slug / host alone. A header slug, if present, must match.
 */
export async function requireWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user?.membershipId || !req.user.role) {
    res.status(403).json({
      success: false,
      error: {
        code: 'WORKSPACE_REQUIRED',
        message: 'Choose a workspace to continue.',
      },
    });
    return;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { entitlement: true },
  });
  if (!organization) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Organization not found' },
    });
    return;
  }

  if (req.tenantSlug && req.tenantSlug !== organization.slug) {
    res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_MISMATCH',
        message: 'Token organization does not match request tenant',
      },
    });
    return;
  }

  req.organization = organization;
  next();
}
