jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    organization: { findUniqueOrThrow: jest.fn() },
    organizationMembership: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organizationInvitation: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditEvent: { create: jest.fn() },
  },
}));

jest.mock('./emailService', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue({ sent: false, dryRun: true }),
}));

jest.mock('./auditService', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../config/prisma';
import { acceptInvitation, createInvitation } from './invitationService';

describe('invitations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates an organization-specific invitation', async () => {
    (prisma.organization.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'org-a',
      name: 'Acme',
      displayName: 'Acme Centre',
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organizationInvitation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.organizationInvitation.create as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      email: 'new@example.com',
      role: 'VIEWER',
      expiresAt: new Date(),
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await createInvitation({
      organizationId: 'org-a',
      invitedByUserId: 'owner-1',
      email: 'new@example.com',
      role: 'VIEWER',
    });
    expect(result.email).toBe('new@example.com');
    expect(prisma.organizationInvitation.create).toHaveBeenCalled();
  });

  it('rejects inviting an existing member', async () => {
    (prisma.organization.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'org-a',
      name: 'Acme',
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'mem-1',
    });
    await expect(
      createInvitation({
        organizationId: 'org-a',
        invitedByUserId: 'owner-1',
        email: 'already@example.com',
        role: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('creates a user and membership for a new email', async () => {
    (prisma.organizationInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      organizationId: 'org-a',
      email: 'new@example.com',
      role: 'ANALYST',
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-new',
      email: 'new@example.com',
      emailVerified: true,
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organizationMembership.create as jest.Mock).mockResolvedValue({});
    (prisma.organizationInvitation.update as jest.Mock).mockResolvedValue({});

    const result = await acceptInvitation({
      token: 'a'.repeat(64),
      password: 'Password12',
      firstName: 'New',
      lastName: 'Person',
    });
    expect(result.userId).toBe('user-new');
    expect(prisma.organizationMembership.create).toHaveBeenCalled();
  });

  it('links an existing global user instead of creating a duplicate', async () => {
    (prisma.organizationInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      organizationId: 'org-b',
      email: 'ada@example.com',
      role: 'VIEWER',
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: 'x',
      emailVerified: true,
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organizationMembership.create as jest.Mock).mockResolvedValue({});
    (prisma.organizationInvitation.update as jest.Mock).mockResolvedValue({});

    const result = await acceptInvitation({
      token: 'b'.repeat(64),
      authenticatedUserId: 'user-1',
    });
    expect(result.userId).toBe('user-1');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an expired invitation', async () => {
    (prisma.organizationInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-old',
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(acceptInvitation({ token: 'c'.repeat(64) })).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('does not create a second membership when one already exists', async () => {
    (prisma.organizationInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      organizationId: 'org-a',
      email: 'ada@example.com',
      role: 'VIEWER',
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: 'x',
      emailVerified: true,
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'mem-1',
      isActive: true,
    });
    (prisma.organizationInvitation.update as jest.Mock).mockResolvedValue({});
    const result = await acceptInvitation({
      token: 'd'.repeat(64),
      authenticatedUserId: 'user-1',
    });
    expect(result.alreadyMember).toBe(true);
    expect(prisma.organizationMembership.create).not.toHaveBeenCalled();
  });
});
