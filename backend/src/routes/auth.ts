import { Router, Request, Response } from 'express';
import { EducationSubtype } from '@prisma/client';
import {
  acceptCurrentLegalVersions,
  createOrganizationForUser,
  listActiveWorkspaces,
  loginUser,
  registerOrganization,
  requestPasswordReset,
  resendVerificationEmail,
  resetPasswordWithToken,
  selectWorkspace,
  verifyEmailToken,
} from '../services/authService';
import { acceptInvitation, peekInvitation } from '../services/invitationService';
import { createPilotCheckoutSession } from '../services/billingService';
import { authenticateToken } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { verifyAccessToken } from '../utils/jwt';
import prisma from '../config/prisma';
import {
  EDUCATION_LABELS,
  subtypeLabel,
} from '../catalog/educationBlueprint';
import { legalAcceptanceStatus } from '../config/legal';

const router = Router();

function authError(
  err: unknown,
  res: Response,
  fallbackCode: string,
  fallbackMessage: string
) {
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
      code: e.code || fallbackCode,
      message: e.message || fallbackMessage,
      ...(e.requiresVerification
        ? { requiresVerification: true, email: e.email }
        : {}),
    },
  });
}

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
    const { org, user, verification } = await registerOrganization({
      organizationName,
      slug,
      email,
      password,
      firstName,
      lastName,
      educationSubtype: educationSubtype as EducationSubtype | undefined,
      educationSubtypeOther,
    });
    const checkout = await createPilotCheckoutSession({
      organizationId: org.id,
      customerEmail: email,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/login?billing=success`,
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
        owner: { id: user.id, email: user.email },
        checkout,
        verification,
      },
    });
  } catch (err) {
    authError(err, res, 'REGISTER_FAILED', 'Registration failed');
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    // Legacy clients sent `slug` with email/password. Ignore it: identity is
    // email + password. Workspace comes from membership, or from the Host subdomain.
    const hostSlug = req.tenantFromHost ? req.tenantSlug : undefined;
    const result = await loginUser({
      email,
      password,
      hostSlug,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    authError(err, res, 'LOGIN_FAILED', 'Login failed');
  }
});

router.post('/select-workspace', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = String(req.body?.organizationId || '');
    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Organization is required' },
      });
      return;
    }
    const result = await selectWorkspace(req.user!.id, organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    authError(err, res, 'WORKSPACE_SELECT_FAILED', 'Could not open that workspace');
  }
});

router.get('/workspaces', authenticateToken, async (req: Request, res: Response) => {
  const workspaces = await listActiveWorkspaces(req.user!.id);
  res.json({ success: true, data: { workspaces } });
});

router.post('/organizations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const {
      organizationName,
      slug,
      educationSubtype,
      educationSubtypeOther,
    } = req.body || {};
    if (!organizationName || !slug) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Organization name and slug are required' },
      });
      return;
    }
    const org = await createOrganizationForUser(req.user!.id, {
      organizationName,
      slug,
      educationSubtype: educationSubtype as EducationSubtype | undefined,
      educationSubtypeOther,
    });
    const checkout = await createPilotCheckoutSession({
      organizationId: org.id,
      customerEmail: req.user!.email,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/login?billing=success`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/app/settings`,
    });
    const session = await selectWorkspace(req.user!.id, org.id);
    res.status(201).json({
      success: true,
      data: { organization: { id: org.id, name: org.name, slug: org.slug }, checkout, session },
    });
  } catch (err) {
    authError(err, res, 'ORG_CREATE_FAILED', 'Could not create organization');
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
    authError(err, res, 'VERIFY_FAILED', 'Email verification failed');
  }
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Email is required' },
      });
      return;
    }
    const result = await resendVerificationEmail({ email });
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
    authError(err, res, 'RESEND_FAILED', 'Could not resend verification email');
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Email is required' },
      });
      return;
    }
    await requestPasswordReset(email);
    res.json({
      success: true,
      message: 'If an account matches, a password reset email was sent.',
    });
  } catch (err) {
    authError(err, res, 'RESET_FAILED', 'Could not start password reset');
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body || {};
    const result = await resetPasswordWithToken(token, password);
    res.json({ success: true, data: result });
  } catch (err) {
    authError(err, res, 'RESET_FAILED', 'Could not reset password');
  }
});

router.get('/invitations/peek', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || '');
    const data = await peekInvitation(token);
    res.json({ success: true, data });
  } catch (err) {
    authError(err, res, 'TOKEN_INVALID', 'Invitation is invalid');
  }
});

router.post('/invitations/accept', async (req: Request, res: Response) => {
  try {
    const { token, password, firstName, lastName } = req.body || {};
    if (!token) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Invitation token is required' },
      });
      return;
    }
    let authenticatedUserId: string | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        authenticatedUserId = verifyAccessToken(header.slice(7)).userId;
      } catch {
        authenticatedUserId = undefined;
      }
    }
    const result = await acceptInvitation({
      token,
      password,
      firstName,
      lastName,
      authenticatedUserId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    authError(err, res, 'INVITE_ACCEPT_FAILED', 'Could not accept invitation');
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const workspaces = await listActiveWorkspaces(req.user!.id);
  const [org, dbUser] = await Promise.all([
    req.user!.organizationId
      ? prisma.organization.findUnique({
          where: { id: req.user!.organizationId },
          include: { entitlement: true, subscription: true },
        })
      : Promise.resolve(null),
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
      workspaces,
      needsWorkspaceSelection: !org && workspaces.length > 1,
      noWorkspace: workspaces.length === 0,
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
    authError(err, res, 'ACCEPT_LEGAL_FAILED', 'Could not record legal acceptance');
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
