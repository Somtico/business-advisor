import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
  },
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

import prisma from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { authenticateToken, requireRole, requireWorkspace } from './auth';

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('authenticateToken tenant isolation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifyAccessToken as jest.Mock).mockReturnValue({
      userId: 'user-1',
      email: 'ada@example.com',
      organizationId: 'org-a',
      membershipId: 'mem-a',
      role: 'OWNER',
    });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      isActive: true,
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'mem-a',
      userId: 'user-1',
      organizationId: 'org-a',
      role: 'OWNER',
      isActive: true,
    });
  });

  it('allows an authorized organization', async () => {
    const req = {
      headers: { authorization: 'Bearer token' },
      tenantSlug: 'acme',
      organization: { id: 'org-a', slug: 'acme' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.organizationId).toBe('org-a');
    expect(req.user?.role).toBe('OWNER');
  });

  it('rejects X-Tenant-Slug / host for an organization that is not in the token', async () => {
    const req = {
      headers: { authorization: 'Bearer token' },
      tenantSlug: 'other-co',
      organization: { id: 'org-b', slug: 'other-co' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error.code).toBe('TENANT_MISMATCH');
  });

  it('rejects a token organization with no active membership', async () => {
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(null);
    const req = {
      headers: { authorization: 'Bearer token' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error.code).toBe('WORKSPACE_FORBIDDEN');
  });

  it('uses the membership role, not the role claimed in the JWT', async () => {
    (verifyAccessToken as jest.Mock).mockReturnValue({
      userId: 'user-1',
      email: 'ada@example.com',
      organizationId: 'org-a',
      membershipId: 'mem-a',
      role: 'OWNER',
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'mem-a',
      userId: 'user-1',
      organizationId: 'org-a',
      role: 'VIEWER',
      isActive: true,
    });
    const req = {
      headers: { authorization: 'Bearer token' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('VIEWER');
  });
});

describe('requireWorkspace', () => {
  it('loads the JWT organization and rejects a mismatched header slug', async () => {
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
      id: 'org-a',
      slug: 'acme',
      entitlement: null,
    });
    const req = {
      user: {
        id: 'user-1',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationId: 'org-a',
        membershipId: 'mem-a',
        role: 'OWNER' as UserRole,
      },
      tenantSlug: 'other-co',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    await requireWorkspace(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].error.code).toBe('TENANT_MISMATCH');
  });
});

describe('requireRole is organization-specific', () => {
  it('allows OWNER in the active workspace', () => {
    const req = {
      user: { role: 'OWNER' as UserRole, organizationId: 'org-a' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    requireRole(['OWNER'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('forbids OWNER-only routes when the active membership is VIEWER', () => {
    const req = {
      user: { role: 'VIEWER' as UserRole, organizationId: 'org-b' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();
    requireRole(['OWNER'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
