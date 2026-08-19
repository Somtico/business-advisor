import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  EducationSubtype,
  OrganizationStatus,
  PlanTier,
  UserRole,
} from '@prisma/client';
import prisma from '../config/prisma';
import {
  AFTER_SCHOOL_BLUEPRINT_KEY,
  EDUCATION_DATASETS,
} from '../catalog/educationBlueprint';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { writeAudit } from './auditService';
import { PILOT_AMOUNT_CENTS } from '../config/stripe';
import {
  legalAcceptanceStatus,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '../config/legal';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './emailService';

/** Precomputed bcrypt hash so unknown-email login spends similar time to a real compare. */
const TIMING_PAD_HASH =
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const INVALID_CREDENTIALS = Object.assign(new Error('Invalid credentials'), {
  status: 401,
  code: 'INVALID_CREDENTIALS',
});

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: UserRole;
  status: OrganizationStatus;
  onboardingCompleted: boolean;
};

async function seedDataReadiness(organizationId: string) {
  for (const ds of EDUCATION_DATASETS) {
    await prisma.dataReadinessItem.upsert({
      where: {
        organizationId_datasetKey: {
          organizationId,
          datasetKey: ds.datasetKey,
        },
      },
      create: {
        organizationId,
        datasetKey: ds.datasetKey,
        label: ds.label,
        whyItMatters: ds.whyItMatters,
        exampleInsight: ds.exampleInsight,
        priority: ds.priority,
        status: ds.defaultStatus ?? 'MISSING',
      },
      update: {
        label: ds.label,
        whyItMatters: ds.whyItMatters,
        exampleInsight: ds.exampleInsight,
        priority: ds.priority,
      },
    });
  }
}

function frontendBaseUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3007';
}

function createVerificationToken(): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { token, expires };
}

function shouldAutoVerifyEmail(): boolean {
  return !process.env.BREVO_API_KEY;
}

function invalidCredentials(): never {
  throw INVALID_CREDENTIALS;
}

export async function listActiveWorkspaces(
  userId: string
): Promise<WorkspaceSummary[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId, isActive: true },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.displayName || m.organization.name,
    slug: m.organization.slug,
    role: m.role,
    status: m.organization.status,
    onboardingCompleted: m.organization.onboardingCompleted,
  }));
}

async function loadMembership(userId: string, organizationId: string) {
  return prisma.organizationMembership.findFirst({
    where: { userId, organizationId, isActive: true },
    include: { organization: { include: { entitlement: true, subscription: true } } },
  });
}

function sessionFor(
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    termsVersion: string | null;
    privacyVersion: string | null;
  },
  membership: {
    id: string;
    role: UserRole;
    organization: {
      id: string;
      name: string;
      slug: string;
      status: OrganizationStatus;
      industryBlueprintKey: string;
      educationSubtype: EducationSubtype;
      educationSubtypeOther: string | null;
      currency: string;
      onboardingCompleted: boolean;
      entitlement: unknown;
      subscription: unknown;
    };
  },
  workspaces: WorkspaceSummary[]
) {
  const payload = {
    userId: user.id,
    email: user.email,
    organizationId: membership.organization.id,
    membershipId: membership.id,
    role: membership.role,
  };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    needsWorkspaceSelection: false,
    noWorkspace: false,
    workspaces,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership.role,
      organizationId: membership.organization.id,
      membershipId: membership.id,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      legal: legalAcceptanceStatus({
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
      }),
    },
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      industryBlueprintKey: membership.organization.industryBlueprintKey,
      educationSubtype: membership.organization.educationSubtype,
      educationSubtypeOther: membership.organization.educationSubtypeOther,
      currency: membership.organization.currency,
      onboardingCompleted: membership.organization.onboardingCompleted,
    },
    entitlements: membership.organization.entitlement,
    subscription: membership.organization.subscription,
  };
}

function identitySession(
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    termsVersion: string | null;
    privacyVersion: string | null;
  },
  workspaces: WorkspaceSummary[],
  needsWorkspaceSelection: boolean
) {
  const payload = { userId: user.id, email: user.email };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    needsWorkspaceSelection,
    noWorkspace: workspaces.length === 0,
    workspaces,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: undefined,
      organizationId: undefined,
      membershipId: undefined,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      legal: legalAcceptanceStatus({
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
      }),
    },
    organization: null,
    entitlements: null,
    subscription: null,
  };
}

async function createOrganizationRecord(input: {
  organizationName: string;
  slug: string;
  educationSubtype?: EducationSubtype;
  educationSubtypeOther?: string | null;
  ownerUserId: string;
  ownerRole?: UserRole;
}) {
  const slug = input.slug.toLowerCase().trim();
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    throw Object.assign(new Error('Organization slug already taken'), {
      status: 409,
      code: 'SLUG_TAKEN',
    });
  }

  const subtype = input.educationSubtype ?? 'STEM_ACADEMY';
  if (subtype === 'OTHER') {
    const other = (input.educationSubtypeOther || '').trim();
    if (!other) {
      throw Object.assign(
        new Error('Please describe your education subtype when selecting Other.'),
        { status: 400, code: 'OTHER_SUBTYPE_REQUIRED' }
      );
    }
  }

  const org = await prisma.organization.create({
    data: {
      name: input.organizationName,
      slug,
      displayName: input.organizationName,
      industryBlueprintKey: AFTER_SCHOOL_BLUEPRINT_KEY,
      educationSubtype: subtype,
      educationSubtypeOther:
        subtype === 'OTHER'
          ? (input.educationSubtypeOther || '').trim()
          : null,
      status: 'PENDING_PAYMENT',
      entitlement: {
        create: {
          plan: 'PILOT',
          adminSeatLimit: 5,
          aiMonthlyTokenCap: 500000,
          connectorLimit: 3,
        },
      },
      subscription: {
        create: {
          plan: 'PILOT',
          status: 'INCOMPLETE',
          unitAmountCents: PILOT_AMOUNT_CENTS,
          currency: 'CAD',
        },
      },
      domains: {
        create: {
          hostname: `${slug}.${process.env.ROOT_DOMAIN || 'businessadvisor.app'}`,
        },
      },
      memberships: {
        create: {
          userId: input.ownerUserId,
          role: input.ownerRole ?? 'OWNER',
        },
      },
    },
    include: {
      entitlement: true,
      subscription: true,
      memberships: true,
    },
  });

  await seedDataReadiness(org.id);
  await writeAudit({
    organizationId: org.id,
    actorUserId: input.ownerUserId,
    action: 'organization.created',
    resourceType: 'Organization',
    resourceId: org.id,
    metadata: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
  });
  return org;
}

export async function registerOrganization(input: {
  organizationName: string;
  slug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  educationSubtype?: EducationSubtype;
  educationSubtypeOther?: string | null;
}) {
  const email = input.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw Object.assign(
      new Error(
        'An account with this email already exists. Sign in, then create another organization from Settings.'
      ),
      { status: 409, code: 'ACCOUNT_EXISTS' }
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const autoVerify = shouldAutoVerifyEmail();
  const { token, expires } = createVerificationToken();

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      privacyAcceptedAt: new Date(),
      privacyVersion: PRIVACY_VERSION,
      emailVerified: autoVerify,
      emailVerificationToken: autoVerify ? null : token,
      emailVerificationExpires: autoVerify ? null : expires,
    },
  });

  const org = await createOrganizationRecord({
    organizationName: input.organizationName,
    slug: input.slug,
    educationSubtype: input.educationSubtype,
    educationSubtypeOther: input.educationSubtypeOther,
    ownerUserId: user.id,
  });

  let verification: { sent: boolean; dryRun: boolean; autoVerified: boolean } = {
    sent: false,
    dryRun: false,
    autoVerified: autoVerify,
  };

  if (!autoVerify) {
    const verificationUrl = `${frontendBaseUrl()}/verify-email?token=${token}`;
    try {
      const result = await sendVerificationEmail({
        email: user.email,
        firstName: user.firstName,
        verificationUrl,
      });
      verification = { ...result, autoVerified: false };
    } catch (err) {
      console.error('[auth] verification email failed', err);
    }
  } else {
    console.log(
      '[auth] BREVO_API_KEY unset — owner email auto-verified for local/dev'
    );
  }

  return { org, user, verification };
}

export async function createOrganizationForUser(
  userId: string,
  input: {
    organizationName: string;
    slug: string;
    educationSubtype?: EducationSubtype;
    educationSubtypeOther?: string | null;
  }
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
  });
  if (!user) {
    throw Object.assign(new Error('User not found or inactive'), {
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }
  if (!user.emailVerified) {
    throw Object.assign(
      new Error('Verify your email before creating another organization.'),
      { status: 403, code: 'EMAIL_NOT_VERIFIED' }
    );
  }
  return createOrganizationRecord({
    organizationName: input.organizationName,
    slug: input.slug,
    educationSubtype: input.educationSubtype,
    educationSubtypeOther: input.educationSubtypeOther,
    ownerUserId: user.id,
  });
}

export async function loginUser(input: {
  email: string;
  password: string;
  /** Host-subdomain workspace. Membership is required or access is denied. */
  hostSlug?: string;
}) {
  const email = (input.email || '').toLowerCase().trim();
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
  });

  if (!user) {
    await bcrypt.compare(input.password || '', TIMING_PAD_HASH);
    invalidCredentials();
  }

  const ok = await bcrypt.compare(input.password || '', user.passwordHash);
  if (!ok) invalidCredentials();

  if (user.passwordResetRequired) {
    throw Object.assign(
      new Error(
        'This account needs a new password. Use Forgot Password on the sign-in page.'
      ),
      { status: 403, code: 'PASSWORD_RESET_REQUIRED' }
    );
  }

  if (!user.emailVerified) {
    throw Object.assign(
      new Error(
        'Please verify your email before signing in. Check your inbox for the verification link.'
      ),
      {
        status: 403,
        code: 'EMAIL_NOT_VERIFIED',
        requiresVerification: true,
        email: user.email,
      }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const workspaces = await listActiveWorkspaces(user.id);

  if (input.hostSlug) {
    const hostSlug = input.hostSlug.toLowerCase();
    const target = workspaces.find((w) => w.slug === hostSlug);
    if (!target) {
      throw Object.assign(
        new Error('You do not have access to this organization.'),
        { status: 403, code: 'WORKSPACE_FORBIDDEN' }
      );
    }
    const membership = await loadMembership(user.id, target.id);
    if (!membership) {
      throw Object.assign(
        new Error('You do not have access to this organization.'),
        { status: 403, code: 'WORKSPACE_FORBIDDEN' }
      );
    }
    return sessionFor(user, membership, workspaces);
  }

  if (workspaces.length === 1) {
    const membership = await loadMembership(user.id, workspaces[0].id);
    if (!membership) return identitySession(user, workspaces, false);
    return sessionFor(user, membership, workspaces);
  }

  return identitySession(user, workspaces, workspaces.length > 1);
}

export async function selectWorkspace(userId: string, organizationId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
  });
  if (!user) {
    throw Object.assign(new Error('User not found or inactive'), {
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }
  const membership = await loadMembership(userId, organizationId);
  if (!membership) {
    throw Object.assign(
      new Error('You do not have access to this organization.'),
      { status: 403, code: 'WORKSPACE_FORBIDDEN' }
    );
  }
  const workspaces = await listActiveWorkspaces(userId);
  return sessionFor(user, membership, workspaces);
}

export async function acceptCurrentLegalVersions(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || !existing.isActive) {
    throw Object.assign(new Error('User not found or inactive'), {
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      termsAcceptedAt: now,
      termsVersion: TERMS_VERSION,
      privacyAcceptedAt: now,
      privacyVersion: PRIVACY_VERSION,
    },
  });

  await writeAudit({
    organizationId: null,
    actorUserId: updated.id,
    action: 'user.legal_accepted',
    resourceType: 'User',
    resourceId: updated.id,
    metadata: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      termsAcceptedAt: now.toISOString(),
      privacyAcceptedAt: now.toISOString(),
      previousTermsVersion: existing.termsVersion,
      previousPrivacyVersion: existing.privacyVersion,
    },
  });

  return {
    termsVersion: updated.termsVersion,
    privacyVersion: updated.privacyVersion,
    legal: legalAcceptanceStatus({
      termsVersion: updated.termsVersion,
      privacyVersion: updated.privacyVersion,
    }),
  };
}

function parseUsedTokens(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string');
}

export async function verifyEmailToken(token: string) {
  if (!token || typeof token !== 'string') {
    throw Object.assign(new Error('Verification token required'), {
      status: 400,
      code: 'TOKEN_REQUIRED',
    });
  }

  const byActiveToken = await prisma.user.findFirst({
    where: { emailVerificationToken: token },
  });

  if (byActiveToken?.emailVerified) {
    return {
      success: true,
      alreadyVerified: true,
      user: {
        id: byActiveToken.id,
        email: byActiveToken.email,
        firstName: byActiveToken.firstName,
      },
    };
  }

  const eligible =
    byActiveToken &&
    byActiveToken.emailVerificationExpires &&
    byActiveToken.emailVerificationExpires > new Date()
      ? byActiveToken
      : null;

  if (!eligible) {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw Object.assign(
        new Error(
          'Invalid or expired verification link. Request a new one from the sign-in page.'
        ),
        { status: 400, code: 'TOKEN_INVALID' }
      );
    }
    const usedHit = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM users WHERE "usedVerificationTokens" @> $1::jsonb LIMIT 1`,
      JSON.stringify([token])
    );
    if (usedHit.length > 0) {
      throw Object.assign(
        new Error('This verification link has already been used.'),
        { status: 400, code: 'TOKEN_ALREADY_USED' }
      );
    }
    throw Object.assign(
      new Error(
        'Invalid or expired verification link. Request a new one from the sign-in page.'
      ),
      { status: 400, code: 'TOKEN_INVALID' }
    );
  }

  const used = parseUsedTokens(eligible.usedVerificationTokens);
  if (used.includes(token)) {
    throw Object.assign(
      new Error('This verification link has already been used.'),
      { status: 400, code: 'TOKEN_ALREADY_USED' }
    );
  }

  const updated = await prisma.user.update({
    where: { id: eligible.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      usedVerificationTokens: [...used, token],
    },
  });

  return {
    success: true,
    alreadyVerified: false,
    user: {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
    },
  };
}

export async function resendVerificationEmail(input: { email: string }) {
  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
  });

  if (!user) {
    return { sent: true, dryRun: false };
  }

  if (user.emailVerified) {
    return { sent: false, dryRun: false, alreadyVerified: true };
  }

  if (shouldAutoVerifyEmail()) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
    return { sent: false, dryRun: true, autoVerified: true };
  }

  const { token, expires } = createVerificationToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    },
  });

  const verificationUrl = `${frontendBaseUrl()}/verify-email?token=${token}`;
  const result = await sendVerificationEmail({
    email: user.email,
    firstName: user.firstName,
    verificationUrl,
  });
  return { ...result, alreadyVerified: false };
}

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.toLowerCase().trim();
  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) {
    return { sent: true };
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpires: expires,
    },
  });
  const resetUrl = `${frontendBaseUrl()}/reset-password?token=${token}`;
  await sendPasswordResetEmail({
    email: user.email,
    firstName: user.firstName,
    resetUrl,
  });
  return { sent: true };
}

export async function resetPasswordWithToken(token: string, password: string) {
  if (!token || !password || password.length < 8) {
    throw Object.assign(
      new Error('A valid reset link and a password of at least 8 characters are required.'),
      { status: 400, code: 'VALIDATION' }
    );
  }
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gt: new Date() },
      isActive: true,
    },
  });
  if (!user) {
    throw Object.assign(
      new Error('Invalid or expired reset link. Request a new one from the sign-in page.'),
      { status: 400, code: 'TOKEN_INVALID' }
    );
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      passwordResetRequired: false,
    },
  });
  return { success: true };
}

export async function activateOrganizationDev(
  organizationId: string
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { status: 'ACTIVE' as OrganizationStatus },
  });
  await prisma.platformSubscription.update({
    where: { organizationId },
    data: {
      status: 'ACTIVE',
      plan: 'PILOT' as PlanTier,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

export { seedDataReadiness };
