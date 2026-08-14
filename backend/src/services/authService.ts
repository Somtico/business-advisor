import bcrypt from 'bcryptjs';
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
import { TERMS_VERSION } from '../config/legal';

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

export async function registerOrganization(input: {
  organizationName: string;
  slug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  educationSubtype?: EducationSubtype;
}) {
  const slug = input.slug.toLowerCase().trim();
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    throw Object.assign(new Error('Organization slug already taken'), {
      status: 409,
      code: 'SLUG_TAKEN',
    });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const org = await prisma.organization.create({
    data: {
      name: input.organizationName,
      slug,
      displayName: input.organizationName,
      industryBlueprintKey: AFTER_SCHOOL_BLUEPRINT_KEY,
      educationSubtype: input.educationSubtype ?? 'STEM_CODING_ACADEMY',
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
    metadata: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date().toISOString() },
  });

  return org;
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
      onboardingCompleted: user.organization.onboardingCompleted,
    },
    entitlements: user.organization.entitlement,
    subscription: user.organization.subscription,
  };
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
