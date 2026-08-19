import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('./emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ sent: false, dryRun: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ sent: false, dryRun: true }),
}));

import prisma from '../config/prisma';
import { loginUser, selectWorkspace } from './authService';

const password = 'CorrectHorse-1';
let passwordHash = '';

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-for-auth';
  passwordHash = await bcrypt.hash(password, 4);
});

function userRow() {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    passwordHash,
    firstName: 'Ada',
    lastName: 'Lovelace',
    isActive: true,
    emailVerified: true,
    passwordResetRequired: false,
    termsVersion: '2026-08-16.2',
    privacyVersion: '2026-08-16.2',
  };
}

function membership(orgId: string, slug: string, role: UserRole, name: string) {
  return {
    id: `mem-${orgId}`,
    userId: 'user-1',
    organizationId: orgId,
    role,
    isActive: true,
    organization: {
      id: orgId,
      name,
      displayName: name,
      slug,
      status: 'ACTIVE',
      industryBlueprintKey: 'after_school_tutoring_enrichment',
      educationSubtype: 'STEM_ACADEMY',
      educationSubtypeOther: null,
      currency: 'CAD',
      onboardingCompleted: true,
      entitlement: null,
      subscription: null,
    },
  };
}

describe('loginUser', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.user.update as jest.Mock).mockResolvedValue({});
  });

  it('signs a one-organization user into that workspace', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      membership('org-a', 'acme', 'OWNER', 'Acme Centre'),
    ]);
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(
      membership('org-a', 'acme', 'OWNER', 'Acme Centre')
    );

    const result = await loginUser({
      email: 'owner@example.com',
      password,
    });
    expect(result.needsWorkspaceSelection).toBe(false);
    expect(result.organization?.id).toBe('org-a');
    expect(result.user.role).toBe('OWNER');
    expect(result.accessToken).toBeTruthy();
  });

  it('requires workspace selection when the account has multiple organizations', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      membership('org-a', 'acme', 'OWNER', 'Acme Centre'),
      membership('org-b', 'northlight', 'ADMIN', 'Northlight'),
    ]);

    const result = await loginUser({
      email: 'owner@example.com',
      password,
    });
    expect(result.needsWorkspaceSelection).toBe(true);
    expect(result.organization).toBeNull();
    expect(result.workspaces).toHaveLength(2);
    expect(result.accessToken).toBeTruthy();
  });

  it('enters the host workspace when the user is a member', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      membership('org-a', 'acme', 'OWNER', 'Acme Centre'),
      membership('org-b', 'northlight', 'ADMIN', 'Northlight'),
    ]);
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(
      membership('org-a', 'acme', 'OWNER', 'Acme Centre')
    );

    const result = await loginUser({
      email: 'owner@example.com',
      password,
      hostSlug: 'acme',
    });
    expect(result.needsWorkspaceSelection).toBe(false);
    expect(result.organization?.slug).toBe('acme');
  });

  it('rejects a host workspace the user does not belong to', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      membership('org-b', 'northlight', 'ADMIN', 'Northlight'),
    ]);

    await expect(
      loginUser({
        email: 'owner@example.com',
        password,
        hostSlug: 'acme',
      })
    ).rejects.toMatchObject({ code: 'WORKSPACE_FORBIDDEN', status: 403 });
  });

  it('rejects an incorrect password', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    await expect(
      loginUser({ email: 'owner@example.com', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });

  it('rejects an unknown email with the same credentials error', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      loginUser({ email: 'missing@example.com', password })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });

  it('returns a no-workspace session when the account has no memberships', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([]);
    const result = await loginUser({ email: 'owner@example.com', password });
    expect(result.noWorkspace).toBe(true);
    expect(result.needsWorkspaceSelection).toBe(false);
    expect(result.organization).toBeNull();
    expect(result.workspaces).toEqual([]);
  });

  it('refuses login when a merged account requires a password reset', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...userRow(),
      passwordResetRequired: true,
    });
    await expect(
      loginUser({ email: 'owner@example.com', password })
    ).rejects.toMatchObject({ code: 'PASSWORD_RESET_REQUIRED', status: 403 });
  });
});

describe('selectWorkspace', () => {
  it('allows a membership the user holds', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(
      membership('org-a', 'acme', 'OWNER', 'Acme Centre')
    );
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      membership('org-a', 'acme', 'OWNER', 'Acme Centre'),
    ]);
    const result = await selectWorkspace('user-1', 'org-a');
    expect(result.organization?.id).toBe('org-a');
  });

  it('rejects an organization the user does not belong to', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(userRow());
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(selectWorkspace('user-1', 'org-other')).rejects.toMatchObject({
      code: 'WORKSPACE_FORBIDDEN',
      status: 403,
    });
  });
});
