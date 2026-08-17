import { Router, Request, Response } from 'express';
import { EducationSubtype } from '@prisma/client';
import {
  acceptCurrentLegalVersions,
  loginUser,
  registerOrganization,
  resendVerificationEmail,
  verifyEmailToken,
} from '../services/authService';
import { createPilotCheckoutSession } from '../services/billingService';
import { authenticateToken } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import prisma from '../config/prisma';
import {
  EDUCATION_LABELS,
  subtypeLabel,
} from '../catalog/educationBlueprint';
import { legalAcceptanceStatus } from '../config/legal';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      organizationName,
      slug,
      email,
      password,
      firstName,
      lastName,
      educationSubtype,
      educationSubtypeOther,
      termsAccepted,
      privacyAccepted,
    } = req.body || {};
    if (!organizationName || !slug || !email || !password || !firstName || !lastName) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Missing required fields' },
      });
      return;
    }
    if (termsAccepted !== true || privacyAccepted !== true) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TERMS_REQUIRED',
          message:
            'You must agree to the Terms of Service and the Privacy Policy to create an organization.',
        },
      });
      return;
    }
    const { org, verification } = await registerOrganization({
      organizationName,
      slug,
      email,
      password,
      firstName,
      lastName,
      educationSubtype: educationSubtype as EducationSubtype | undefined,
      educationSubtypeOther,
    });
    const owner = org.users[0];
    const checkout = await createPilotCheckoutSession({
      organizationId: org.id,
      customerEmail: email,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/login?slug=${org.slug}&billing=success`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/signup?cancelled=1`,
    });
    res.status(201).json({
      success: true,
      data: {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
        },
        owner: { id: owner.id, email: owner.email },
        checkout,
        verification,
      },
    });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    res.status(e.status || 500).json({
      success: false,
      error: {
        code: e.code || 'REGISTER_FAILED',
        message: e.message || 'Registration failed',
      },
    });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, slug } = req.body || {};
    const resolvedSlug = slug || req.tenantSlug || req.organization?.slug;
    const result = await loginUser({
      email,
      password,
      slug: resolvedSlug,
      organizationId: req.organization?.id,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as {
      status?: number;
      code?: string;
      message?: string;
      requiresVerification?: boolean;
      email?: string;
    };
    res.status(e.status || 500).json({
      success: false,
      error: {
        code: e.code || 'LOGIN_FAILED',
        message: e.message || 'Login failed',
        ...(e.requiresVerification
          ? { requiresVerification: true, email: e.email }
          : {}),
      },
    });
  }
});

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    const result = await verifyEmailToken(token);
    res.json({
      success: true,
      message: result.alreadyVerified
        ? 'Your email has already been verified. You can now sign in.'
        : 'Your email has been verified. You can now sign in.',
      data: result,
    });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    res.status(e.status || 500).json({
      success: false,
      error: {
        code: e.code || 'VERIFY_FAILED',
        message: e.message || 'Email verification failed',
      },
    });
  }
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email, slug } = req.body || {};
    if (!email || !slug) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'Email and organization slug are required',
        },
      });
      return;
    }
    const result = await resendVerificationEmail({ email, slug });
    res.json({
      success: true,
      data: result,
      message: result.alreadyVerified
        ? 'This email is already verified. You can sign in.'
        : result.autoVerified
          ? 'Your email was verified for local development. You can sign in.'
          : 'If an unverified account matches, a new verification email was sent.',
    });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    res.status(e.status || 500).json({
      success: false,
      error: {
        code: e.code || 'RESEND_FAILED',
        message: e.message || 'Could not resend verification email',
      },
    });
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const [org, dbUser] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      include: { entitlement: true, subscription: true },
    }),
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        termsVersion: true,
        privacyVersion: true,
        termsAcceptedAt: true,
        privacyAcceptedAt: true,
      },
    }),
  ]);
  const legal = legalAcceptanceStatus({
    termsVersion: dbUser?.termsVersion,
    privacyVersion: dbUser?.privacyVersion,
  });
  res.json({
    success: true,
    data: {
      user: {
        ...req.user,
        termsVersion: dbUser?.termsVersion ?? null,
        privacyVersion: dbUser?.privacyVersion ?? null,
        termsAcceptedAt: dbUser?.termsAcceptedAt ?? null,
        privacyAcceptedAt: dbUser?.privacyAcceptedAt ?? null,
        legal,
      },
      organization: org,
      labels: EDUCATION_LABELS,
      educationSubtypeLabel: org
        ? subtypeLabel(org.educationSubtype, org.educationSubtypeOther)
        : undefined,
    },
  });
});

router.post('/accept-legal', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { termsAccepted, privacyAccepted } = req.body || {};
    if (termsAccepted !== true || privacyAccepted !== true) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TERMS_REQUIRED',
          message:
            'You must agree to the Terms of Service and the Privacy Policy to continue.',
        },
      });
      return;
    }
    const result = await acceptCurrentLegalVersions(req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    res.status(e.status || 500).json({
      success: false,
      error: {
        code: e.code || 'ACCEPT_LEGAL_FAILED',
        message: e.message || 'Could not record legal acceptance',
      },
    });
  }
});

router.get('/blueprint', requireTenant, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      key: 'after_school_tutoring_enrichment',
      labels: EDUCATION_LABELS,
      industrySelectorExposed: false,
    },
  });
});

export default router;
