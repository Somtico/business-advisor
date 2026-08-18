import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import prisma from '../config/prisma';
import { writeAudit } from './auditService';
import { sendInvitationEmail } from './emailService';
import { TERMS_VERSION, PRIVACY_VERSION } from '../config/legal';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function frontendBaseUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3007';
}

function shouldAutoVerifyEmail(): boolean {
  return !process.env.BREVO_API_KEY;
}

export async function listInvitations(organizationId: string) {
  return prisma.organizationInvitation.findMany({
    where: { organizationId, revokedAt: null, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

export async function listMembers(organizationId: string) {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, isActive: true },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return memberships
    .filter((m) => m.user.isActive)
    .map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role,
    }));
}

export async function createInvitation(params: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role: UserRole;
}) {
  if (params.role === 'OWNER') {
    throw Object.assign(new Error('Owner access cannot be granted by invitation.'), {
      status: 400,
      code: 'INVALID_ROLE',
    });
  }
  const email = params.email.toLowerCase().trim();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
  });

  const existingMember = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: params.organizationId,
      isActive: true,
      user: { email },
    },
  });
  if (existingMember) {
    throw Object.assign(
      new Error('That person already belongs to this organization.'),
      { status: 409, code: 'ALREADY_MEMBER' }
    );
  }

  await prisma.organizationInvitation.updateMany({
    where: {
      organizationId: params.organizationId,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: params.organizationId,
      email,
      role: params.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedByUserId: params.invitedByUserId,
    },
  });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const acceptUrl = `${frontendBaseUrl()}/accept-invitation?token=${token}`;
  await sendInvitationEmail({
    email,
    firstName: existingUser?.firstName,
    organizationName: org.displayName || org.name,
    roleLabel: ROLE_LABELS[params.role],
    acceptUrl,
  });

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.invitedByUserId,
    action: 'organization.invitation_created',
    resourceType: 'OrganizationInvitation',
    resourceId: invitation.id,
    metadata: { email, role: params.role },
  });

  return { id: invitation.id, email, role: params.role, expiresAt: invitation.expiresAt };
}

export async function revokeInvitation(params: {
  organizationId: string;
  invitationId: string;
  actorUserId: string;
}) {
  const invitation = await prisma.organizationInvitation.findFirst({
    where: { id: params.invitationId, organizationId: params.organizationId },
  });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
    throw Object.assign(new Error('Invitation not found'), {
      status: 404,
      code: 'NOT_FOUND',
    });
  }
  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { revokedAt: new Date() },
  });
  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: 'organization.invitation_revoked',
    resourceType: 'OrganizationInvitation',
    resourceId: invitation.id,
  });
  return { success: true };
}

export async function peekInvitation(token: string) {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { name: true, displayName: true } } },
  });
  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date()
  ) {
    throw Object.assign(
      new Error('This invitation is invalid or has expired.'),
      { status: 400, code: 'TOKEN_INVALID' }
    );
  }
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  return {
    email: invitation.email,
    role: invitation.role,
    organizationName:
      invitation.organization.displayName || invitation.organization.name,
    accountExists: Boolean(existingUser),
  };
}

export async function acceptInvitation(params: {
  token: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  authenticatedUserId?: string;
}) {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashToken(params.token) },
  });
  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date()
  ) {
    throw Object.assign(
      new Error('This invitation is invalid or has expired.'),
      { status: 400, code: 'TOKEN_INVALID' }
    );
  }

  let user = await prisma.user.findUnique({ where: { email: invitation.email } });

  if (user) {
    if (
      params.authenticatedUserId &&
      params.authenticatedUserId !== user.id
    ) {
      throw Object.assign(
        new Error('Sign in with the invited email address to accept this invitation.'),
        { status: 403, code: 'WRONG_ACCOUNT' }
      );
    }
    if (!params.authenticatedUserId) {
      if (!params.password) {
        throw Object.assign(
          new Error('An account with this email already exists. Sign in to accept the invitation.'),
          { status: 409, code: 'ACCOUNT_EXISTS_SIGN_IN' }
        );
      }
      const ok = await bcrypt.compare(params.password, user.passwordHash);
      if (!ok) {
        throw Object.assign(new Error('Invalid credentials'), {
          status: 401,
          code: 'INVALID_CREDENTIALS',
        });
      }
    }
  } else {
    const password = params.password || '';
    const firstName = (params.firstName || '').trim();
    const lastName = (params.lastName || '').trim();
    if (password.length < 8 || !firstName || !lastName) {
      throw Object.assign(
        new Error('First name, last name, and a password of at least 8 characters are required.'),
        { status: 400, code: 'VALIDATION' }
      );
    }
    user = await prisma.user.create({
      data: {
        email: invitation.email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName,
        lastName,
        emailVerified: true,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
        privacyAcceptedAt: new Date(),
        privacyVersion: PRIVACY_VERSION,
      },
    });
  }

  const already = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: invitation.organizationId,
      userId: user.id,
    },
  });
  if (already) {
    if (!already.isActive) {
      await prisma.organizationMembership.update({
        where: { id: already.id },
        data: { isActive: true, role: invitation.role },
      });
    }
  } else {
    await prisma.organizationMembership.create({
      data: {
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
      },
    });
  }

  if (shouldAutoVerifyEmail() || user.emailVerified === false) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  await writeAudit({
    organizationId: invitation.organizationId,
    actorUserId: user.id,
    action: 'organization.invitation_accepted',
    resourceType: 'OrganizationInvitation',
    resourceId: invitation.id,
  });

  return {
    success: true,
    organizationId: invitation.organizationId,
    userId: user.id,
    alreadyMember: Boolean(already?.isActive),
  };
}
