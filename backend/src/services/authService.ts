import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  EducationSubtype,
  OrganizationStatus,
  PlanTier,
} from '@prisma/client';
import prisma from '../config/prisma';
import {
  AFTER_SCHOOL_BLUEPRINT_KEY,
  EDUCATION_DATASETS,
} from '../catalog/educationBlueprint';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { writeAudit } from './auditService';
import { PILOT_AMOUNT_CENTS } from '../config/stripe';
import { PRIVACY_VERSION, TERMS_VERSION } from '../config/legal';
import { sendVerificationEmail } from './emailService';

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

/** When Brevo is not configured, auto-verify so local signup is not blocked. */
function shouldAutoVerifyEmail(): boolean {
  return !process.env.BREVO_API_KEY;
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

  const passwordHash = await bcrypt.hash(input.password, 12);
  const autoVerify = shouldAutoVerifyEmail();
  const { token, expires } = createVerificationToken();

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
      users: {
        create: {
          email: input.email.toLowerCase(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'OWNER',
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
          privacyAcceptedAt: new Date(),
          privacyVersion: PRIVACY_VERSION,
          emailVerified: autoVerify,
          emailVerificationToken: autoVerify ? null : token,
          emailVerificationExpires: autoVerify ? null : expires,
        },
      },
    },
    include: {
      users: true,
      entitlement: true,
      subscription: true,
    },
  });

  await seedDataReadiness(org.id);
  await writeAudit({
    organizationId: org.id,
    actorUserId: org.users[0]?.id,
    action: 'organization.created',
    resourceType: 'Organization',
    resourceId: org.id,
    metadata: {
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date().toISOString(),
      privacyVersion: PRIVACY_VERSION,
      privacyAcceptedAt: new Date().toISOString(),
    },
  });

  const owner = org.users[0];
  let verification: { sent: boolean; dryRun: boolean; autoVerified: boolean } = {
    sent: false,
    dryRun: false,
    autoVerified: autoVerify,
  };

  if (!autoVerify && owner) {
    const verificationUrl = `${frontendBaseUrl()}/verify-email?token=${token}`;
    try {
      const result = await sendVerificationEmail({
        email: owner.email,
        firstName: owner.firstName,
        verificationUrl,
      });
      verification = { ...result, autoVerified: false };
    } catch (err) {
      console.error('[auth] verification email failed', err);
    }
  } else if (autoVerify) {
    console.log(
      '[auth] BREVO_API_KEY unset — owner email auto-verified for local/dev'
    );
  }

  return { org, verification };
}

export async function loginUser(input: {
  email: string;
  password: string;
  organizationId?: string;
  slug?: string;
}) {
  let organizationId = input.organizationId;
  if (!organizationId && input.slug) {
    const org = await prisma.organization.findUnique({
      where: { slug: input.slug.toLowerCase() },
    });
    if (!org) {
      throw Object.assign(new Error('Organization not found'), {
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });
    }
    organizationId = org.id;
  }
  if (!organizationId) {
    throw Object.assign(new Error('Organization context required'), {
      status: 400,
      code: 'TENANT_REQUIRED',
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      organizationId,
      email: input.email.toLowerCase(),
      isActive: true,
    },
    include: {
      organization: { include: { entitlement: true, subscription: true } },
    },
  });
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), {
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw Object.assign(new Error('Invalid credentials'), {
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
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

  const payload = {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    role: user.role,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
    },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      status: user.organization.status,
      industryBlueprintKey: user.organization.industryBlueprintKey,
      educationSubtype: user.organization.educationSubtype,
      educationSubtypeOther: user.organization.educationSubtypeOther,
      onboardingCompleted: user.organization.onboardingCompleted,
    },
    entitlements: user.organization.entitlement,
    subscription: user.organization.subscription,
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
        role: byActiveToken.role,
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
      role: updated.role,
    },
  };
}

export async function resendVerificationEmail(input: {
  email: string;
  slug: string;
}) {
  const org = await prisma.organization.findUnique({
    where: { slug: input.slug.toLowerCase().trim() },
  });
  if (!org) {
    // Avoid account enumeration
    return { sent: true, dryRun: false };
  }

  const user = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      email: input.email.toLowerCase().trim(),
      isActive: true,
    },
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
