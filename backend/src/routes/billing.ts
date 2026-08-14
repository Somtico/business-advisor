import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import {
  createConnectExpressAccount,
  createPilotCheckoutSession,
  refreshConnectStatus,
} from '../services/billingService';
import prisma from '../config/prisma';

const router = Router();

router.use(requireTenant, authenticateToken);

router.get('/subscription', async (req: Request, res: Response) => {
  const sub = await prisma.platformSubscription.findUnique({
    where: { organizationId: req.user!.organizationId },
  });
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    select: {
      stripeConnectAccountId: true,
      stripeConnectReady: true,
      status: true,
    },
  });
  res.json({ success: true, data: { subscription: sub, connect: org } });
});

router.post(
  '/checkout',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const checkout = await createPilotCheckoutSession({
      organizationId: req.user!.organizationId,
      customerEmail: req.user!.email,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/settings/billing?billing=success`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/settings/billing?billing=cancel`,
    });
    res.json({ success: true, data: checkout });
  }
);

router.post(
  '/connect/onboard',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const result = await createConnectExpressAccount(req.user!.organizationId);
    res.json({ success: true, data: result });
  }
);

router.post(
  '/connect/refresh',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const result = await refreshConnectStatus(req.user!.organizationId);
    res.json({ success: true, data: result });
  }
);

export default router;
