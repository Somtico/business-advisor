import { Router, Request, Response } from 'express';
import { EducationSubtype } from '@prisma/client';
import {
  loginUser,
  registerOrganization,
} from '../services/authService';
import { createPilotCheckoutSession } from '../services/billingService';
import { authenticateToken } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import prisma from '../config/prisma';
import {
  EDUCATION_LABELS,
  subtypeLabel,
} from '../catalog/educationBlueprint';

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
    } = req.body || {};
    if (!organizationName || !slug || !email || !password || !firstName || !lastName) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Missing required fields' },
      });
      return;
    }
    const org = await registerOrganization({
      organizationName,
      slug,
      email,
      password,
      firstName,
      lastName,
      educationSubtype: educationSubtype as EducationSubtype | undefined,
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
    const e = err as { status?: number; code?: string; message?: string };
    res.status(e.status || 500).json({
      success: false,
      error: {
        code: e.code || 'LOGIN_FAILED',
        message: e.message || 'Login failed',
      },
    });
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    include: { entitlement: true, subscription: true },
  });
  res.json({
    success: true,
    data: {
      user: req.user,
      organization: org,
      labels: EDUCATION_LABELS,
      educationSubtypeLabel: org
        ? subtypeLabel(org.educationSubtype)
        : undefined,
    },
  });
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
