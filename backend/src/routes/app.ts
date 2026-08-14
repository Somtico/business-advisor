import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import prisma from '../config/prisma';
import { executiveDashboard, buildForecasts } from '../services/metrics/analyticsService';
import { runBusinessInsights } from '../services/businessInsightService';
import { askAdvisor } from '../services/aiAdvisorService';
import { importCsv } from '../services/csvImportService';
import { fetchAndSyncPortal, syncPortalPayload } from '../services/portalSyncService';
import { EDUCATION_DATASETS } from '../catalog/educationBlueprint';
import { writeAudit } from '../services/auditService';
import {
  runDailyAnalysisForOrg,
  sendWeeklyExecutiveBrief,
} from '../services/briefingService';

const router = Router();
router.use(requireTenant, authenticateToken);

router.get('/dashboard', async (req: Request, res: Response) => {
  const data = await executiveDashboard(req.user!.organizationId);
  res.json({ success: true, data });
});

router.get('/readiness', async (req: Request, res: Response) => {
  const items = await prisma.dataReadinessItem.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { priority: 'desc' },
  });
  res.json({
    success: true,
    data: {
      items,
      catalogue: EDUCATION_DATASETS,
    },
  });
});

router.patch(
  '/readiness/:datasetKey',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const { status, notes, deferredUntil } = req.body || {};
    const item = await prisma.dataReadinessItem.update({
      where: {
        organizationId_datasetKey: {
          organizationId: req.user!.organizationId,
          datasetKey: req.params.datasetKey,
        },
      },
      data: {
        status,
        notes,
        deferredUntil: deferredUntil ? new Date(deferredUntil) : undefined,
      },
    });
    res.json({ success: true, data: item });
  }
);

router.post(
  '/onboarding/complete',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const { educationSubtype, cashBalanceCents } = req.body || {};
    const org = await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: {
        onboardingCompleted: true,
        educationSubtype: educationSubtype || undefined,
        cashBalanceCents:
          typeof cashBalanceCents === 'number' ? cashBalanceCents : undefined,
        cashBalanceAsOf: typeof cashBalanceCents === 'number' ? new Date() : undefined,
      },
    });
    res.json({ success: true, data: org });
  }
);

// ---- Manual CRUD (core entities) ----

router.get('/locations', async (req: Request, res: Response) => {
  const rows = await prisma.location.findMany({
    where: { organizationId: req.user!.organizationId },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/locations',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const row = await prisma.location.create({
      data: {
        organizationId: req.user!.organizationId,
        name: req.body.name,
        addressLine1: req.body.addressLine1,
        city: req.body.city,
        province: req.body.province,
        postalCode: req.body.postalCode,
      },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/programmes', async (req: Request, res: Response) => {
  const rows = await prisma.productService.findMany({
    where: { organizationId: req.user!.organizationId },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/programmes',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const row = await prisma.productService.create({
      data: {
        organizationId: req.user!.organizationId,
        name: req.body.name,
        category: req.body.category,
        priceCents: req.body.priceCents,
        capacity: req.body.capacity,
        deliveryMode: req.body.deliveryMode,
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: req.user!.organizationId,
        datasetKey: 'programmes',
      },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/students', async (req: Request, res: Response) => {
  const rows = await prisma.person.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { engagements: true },
    orderBy: { lastName: 'asc' },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/students',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const row = await prisma.person.create({
      data: {
        organizationId: req.user!.organizationId,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        gradeOrAge: req.body.gradeOrAge,
        status: req.body.status || 'active',
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: { organizationId: req.user!.organizationId, datasetKey: 'students' },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.post(
  '/enrolments',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const row = await prisma.engagement.create({
      data: {
        organizationId: req.user!.organizationId,
        personId: req.body.personId,
        productServiceId: req.body.productServiceId,
        status: req.body.status || 'ACTIVE',
        isTrial: Boolean(req.body.isTrial),
        startDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: req.user!.organizationId,
        datasetKey: 'enrolments',
      },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/staff', async (req: Request, res: Response) => {
  const rows = await prisma.staffMember.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { compensation: true, shifts: { take: 10, orderBy: { startsAt: 'desc' } } },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/staff',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const row = await prisma.staffMember.create({
      data: {
        organizationId: req.user!.organizationId,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        roleTitle: req.body.roleTitle,
        locationId: req.body.locationId,
        compensation: req.body.hourlyCents
          ? {
              create: {
                organizationId: req.user!.organizationId,
                payType: 'hourly',
                hourlyCents: req.body.hourlyCents,
                burdenPercent: req.body.burdenPercent ?? 15,
              },
            }
          : undefined,
      },
      include: { compensation: true },
    });
    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: req.user!.organizationId,
        datasetKey: { in: ['staffing', 'wages'] },
      },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.post(
  '/shifts',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const row = await prisma.shift.create({
      data: {
        organizationId: req.user!.organizationId,
        staffMemberId: req.body.staffMemberId,
        locationId: req.body.locationId,
        startsAt: new Date(req.body.startsAt),
        endsAt: new Date(req.body.endsAt),
        notes: req.body.notes,
      },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/expenses', async (req: Request, res: Response) => {
  const rows = await prisma.expenseTransaction.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { occurredAt: 'desc' },
    take: 200,
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/expenses',
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  async (req: Request, res: Response) => {
    const row = await prisma.expenseTransaction.create({
      data: {
        organizationId: req.user!.organizationId,
        amountCents: req.body.amountCents,
        category: req.body.category,
        description: req.body.description,
        occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(),
        isRecurring: Boolean(req.body.isRecurring),
        vendorId: req.body.vendorId,
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: { organizationId: req.user!.organizationId, datasetKey: 'expenses' },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/subscriptions', async (req: Request, res: Response) => {
  const rows = await prisma.recurringSubscription.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { amountCents: 'desc' },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/subscriptions',
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  async (req: Request, res: Response) => {
    const row = await prisma.recurringSubscription.create({
      data: {
        organizationId: req.user!.organizationId,
        name: req.body.name,
        amountCents: req.body.amountCents,
        cadence: req.body.cadence || 'monthly',
        category: req.body.category,
        nextRenewalAt: req.body.nextRenewalAt
          ? new Date(req.body.nextRenewalAt)
          : undefined,
        usageNotes: req.body.usageNotes,
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: req.user!.organizationId,
        datasetKey: 'subscriptions',
      },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/loans', async (req: Request, res: Response) => {
  const rows = await prisma.loan.findMany({
    where: { organizationId: req.user!.organizationId },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/loans',
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  async (req: Request, res: Response) => {
    const row = await prisma.loan.create({
      data: {
        organizationId: req.user!.organizationId,
        name: req.body.name,
        principalCents: req.body.principalCents,
        balanceCents: req.body.balanceCents,
        ratePercent: req.body.ratePercent,
        paymentCents: req.body.paymentCents,
        paymentCadence: req.body.paymentCadence,
        maturityDate: req.body.maturityDate
          ? new Date(req.body.maturityDate)
          : undefined,
        notes: req.body.notes,
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: req.user!.organizationId,
        datasetKey: 'loans_cash',
      },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.get('/targets', async (req: Request, res: Response) => {
  const rows = await prisma.target.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { periodEnd: 'asc' },
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/targets',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const row = await prisma.target.create({
      data: {
        organizationId: req.user!.organizationId,
        metricKey: req.body.metricKey,
        label: req.body.label,
        periodStart: new Date(req.body.periodStart),
        periodEnd: new Date(req.body.periodEnd),
        targetValue: Number(req.body.targetValue),
        unit: req.body.unit || 'count',
      },
    });
    await prisma.dataReadinessItem.updateMany({
      where: { organizationId: req.user!.organizationId, datasetKey: 'targets' },
      data: { status: 'MANUAL' },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.post(
  '/import/csv',
  requireRole(['OWNER', 'ADMIN', 'FINANCE', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const { kind, csvText } = req.body || {};
    if (!kind || !csvText) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'kind and csvText required' },
      });
      return;
    }
    const result = await importCsv({
      organizationId: req.user!.organizationId,
      kind,
      csvText,
    });
    await writeAudit({
      organizationId: req.user!.organizationId,
      actorUserId: req.user!.id,
      action: 'csv.imported',
      metadata: { kind, imported: result.imported },
    });
    res.json({ success: true, data: result });
  }
);

router.post(
  '/connector/sync',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    try {
      if (req.body?.payload) {
        let dataSource = await prisma.dataSource.findFirst({
          where: {
            organizationId: req.user!.organizationId,
            connectorKey: 'stem_lantern_portal',
          },
        });
        if (!dataSource) {
          dataSource = await prisma.dataSource.create({
            data: {
              organizationId: req.user!.organizationId,
              kind: 'API_CONNECTOR',
              name: 'STEM Lantern Registration Portal',
              connectorKey: 'stem_lantern_portal',
              status: 'MISSING',
            },
          });
        }
        const result = await syncPortalPayload({
          organizationId: req.user!.organizationId,
          dataSourceId: dataSource.id,
          payload: req.body.payload,
        });
        res.json({ success: true, data: result });
        return;
      }
      const result = await fetchAndSyncPortal(req.user!.organizationId);
      res.json({ success: true, data: result });
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      res.status(e.status || 500).json({
        success: false,
        error: {
          code: e.code || 'SYNC_FAILED',
          message: e.message || 'Sync failed',
        },
      });
    }
  }
);

router.get('/insights', async (req: Request, res: Response) => {
  const rows = await prisma.insight.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ success: true, data: rows });
});

router.post(
  '/insights/run',
  requireRole(['OWNER', 'ADMIN', 'ANALYST', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const result = await runBusinessInsights(req.user!.organizationId);
    res.json({ success: true, data: result });
  }
);

router.get('/actions', async (req: Request, res: Response) => {
  const rows = await prisma.recommendation.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    include: { insight: true },
  });
  res.json({ success: true, data: rows });
});

router.patch(
  '/actions/:id',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const row = await prisma.recommendation.updateMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      data: {
        status: req.body.status,
        realizedImpactCents: req.body.realizedImpactCents,
        realizedAt: req.body.realizedImpactCents != null ? new Date() : undefined,
        ownerUserId: req.body.ownerUserId,
      },
    });
    if (row.count === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recommendation not found' },
      });
      return;
    }
    const updated = await prisma.recommendation.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.json({ success: true, data: updated });
  }
);

router.post('/forecasts/rebuild', async (req: Request, res: Response) => {
  const rows = await buildForecasts(req.user!.organizationId);
  res.json({ success: true, data: rows });
});

router.post('/advisor/ask', async (req: Request, res: Response) => {
  const { question, conversationId } = req.body || {};
  if (!question) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION', message: 'question required' },
    });
    return;
  }
  const result = await askAdvisor({
    organizationId: req.user!.organizationId,
    userId: req.user!.id,
    question,
    conversationId,
  });
  res.json({ success: true, data: result });
});

router.post(
  '/jobs/daily',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const result = await runDailyAnalysisForOrg(req.user!.organizationId);
    res.json({ success: true, data: result });
  }
);

router.post(
  '/jobs/weekly-brief',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const result = await sendWeeklyExecutiveBrief(req.user!.organizationId);
    res.json({ success: true, data: result });
  }
);

router.get('/audit', requireRole(['OWNER', 'ADMIN']), async (req: Request, res: Response) => {
  const rows = await prisma.auditEvent.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ success: true, data: rows });
});

export default router;
