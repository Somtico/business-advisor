import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authenticateToken, requireRole, requireWorkspace } from '../middleware/auth';
import prisma from '../config/prisma';
import { impactSummary } from '../services/impactService';
import {
  pricingGuidance,
  sanitizePricingGuidanceForClient,
} from '../services/pricingService';
import { listConnectors } from '../services/connectorsService';
import { operatingLoop } from '../services/organizationMemoryService';
import {
  deleteEnrolmentTactic,
  enrolmentGuidance,
  listEnrolmentTactics,
  recordEnrolmentTactic,
} from '../services/enrolmentService';
import {
  captureImpactBaseline,
  runImpactVerificationForOrg,
  IMPACT_VERIFICATION_DELAY_DAYS,
} from '../services/impactVerificationService';
import { executiveDashboard, buildForecasts } from '../services/metrics/analyticsService';
import { runBusinessInsights } from '../services/businessInsightService';
import { askAdvisor, AiGatewayError } from '../services/aiAdvisorService';
import { getOrganizationAiUsageAnalytics } from '../services/ai/aiUsageAnalyticsService';
import { importCsv } from '../services/csvImportService';
import { fetchAndSyncPortal, syncPortalPayload } from '../services/portalSyncService';
import { completeOnboarding, OnboardingError } from '../services/onboardingService';
import { EDUCATION_DATASETS } from '../catalog/educationBlueprint';
import {
  parseOptionalCashBalanceCents,
} from '../lib/parseMoney';
import {
  resolveCashPosition,
  updateCashPosition,
} from '../services/metrics/cashObservationService';
import { writeAudit } from '../services/auditService';
import {
  runDailyAnalysisForOrg,
  sendWeeklyExecutiveBrief,
} from '../services/briefingService';
import {
  attachDecisionOutcomeForRecommendation,
  getDecisionOutcomeForOrg,
  inferLifecycleFromRealizedImpact,
  recordLifecycleOutcome,
  syncDecisionFromRecommendationStatus,
} from '../services/moat/decisionOutcomeService';
import {
  listLearningConsents,
} from '../services/moat/learningConsentService';
import {
  disableHelpImproveAdvisor,
  dismissHelpImproveInvite,
  enableHelpImproveAdvisor,
  getHelpImproveAdvisorStatus,
} from '../services/moat/helpImproveAdvisorService';
import {
  BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
  OUTCOME_CORPUS_PURPOSE_VERSION_V2,
} from '../config/legal';
import { proposeMappings } from '../services/moat/sourceMappingService';
import { contextualPeerPatterns } from '../services/moat/contextualPlaybookService';
import {
  createInvitation,
  listInvitations,
  listMembers,
  revokeInvitation,
} from '../services/invitationService';
import { LifecycleOutcome, UserRole } from '@prisma/client';

const INVITABLE_ROLES: UserRole[] = [
  'ADMIN',
  'FINANCE',
  'OPERATIONS',
  'ANALYST',
  'VIEWER',
];

const router = Router();
router.use(authenticateToken, requireWorkspace);

router.get('/dashboard', async (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  const [data, loop] = await Promise.all([
    executiveDashboard(organizationId),
    operatingLoop(organizationId),
  ]);
  res.json({ success: true, data: { ...data, operatingLoop: loop } });
});

router.get('/connectors', async (req: Request, res: Response) => {
  const data = await listConnectors(req.user!.organizationId);
  res.json({ success: true, data });
});

router.get('/readiness', async (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  const [items, cashPosition] = await Promise.all([
    prisma.dataReadinessItem.findMany({
      where: { organizationId },
      orderBy: { priority: 'desc' },
    }),
    resolveCashPosition(organizationId),
  ]);
  res.json({
    success: true,
    data: {
      items,
      catalogue: EDUCATION_DATASETS,
      cashPosition,
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
    const { educationSubtype, educationSubtypeOther, cashBalanceCents } =
      req.body || {};
    try {
      const org = await completeOnboarding({
        organizationId: req.user!.organizationId,
        educationSubtype,
        educationSubtypeOther,
        cashBalanceCents,
      });
      res.json({ success: true, data: org });
    } catch (err) {
      if (err instanceof OnboardingError) {
        res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
        return;
      }
      throw err;
    }
  }
);

router.get('/cash-position', async (req: Request, res: Response) => {
  const data = await resolveCashPosition(req.user!.organizationId);
  res.json({ success: true, data });
});

router.post(
  '/cash-position',
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  async (req: Request, res: Response) => {
    try {
      const totalBusinessCashCents = parseOptionalCashBalanceCents(
        req.body?.totalBusinessCashCents
      );
      const committedCashCents = parseOptionalCashBalanceCents(
        req.body?.committedCashCents
      );
      const restrictedCashCents = parseOptionalCashBalanceCents(
        req.body?.restrictedCashCents
      );
      const data = await updateCashPosition({
        organizationId: req.user!.organizationId,
        totalBusinessCashCents,
        committedCashCents,
        restrictedCashCents,
      });
      res.json({ success: true, data });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'INVALID_CASH_BALANCE';
      const message =
        code === 'CURRENCY_MISMATCH'
          ? 'Cash amounts must use the organization\'s base currency.'
          : 'Enter whole-cent cash amounts, or leave a field blank to leave it unchanged.';
      res.status(400).json({
        success: false,
        error: { code, message },
      });
    }
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

const RECOMMENDATION_STATUSES = [
  'OPEN',
  'ACCEPTED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DISMISSED',
] as const;

/** Sanity ceiling for a single action's impact: $10M in cents. */
const MAX_IMPACT_CENTS = 1_000_000_000;

router.patch(
  '/actions/:id',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const { status, ownerUserId } = req.body || {};
    if (
      status !== undefined &&
      !RECOMMENDATION_STATUSES.includes(status)
    ) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Invalid status value' },
      });
      return;
    }

    const existing = await prisma.recommendation.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recommendation not found' },
      });
      return;
    }

    const data: Prisma.RecommendationUpdateInput = {};
    if (status !== undefined) data.status = status;
    if (ownerUserId !== undefined) {
      data.owner = ownerUserId
        ? { connect: { id: ownerUserId } }
        : { disconnect: true };
    }

    // Completion starts the verification clock and snapshots a measurement
    // baseline. Realized impact is never auto-copied from the estimate; it is
    // either measured from data later or confirmed by the user.
    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      const now = new Date();
      data.completedAt = now;
      data.verificationDueAt = new Date(
        now.getTime() + IMPACT_VERIFICATION_DELAY_DAYS * 24 * 60 * 60 * 1000
      );
      const baseline = await captureImpactBaseline(req.user!.organizationId);
      if (baseline) {
        data.baselineJson = baseline as unknown as Prisma.InputJsonValue;
      }
    }

    // Reopening a completed action stops any pending verification prompt.
    // Verified figures are kept but only count while status is COMPLETED.
    if (
      status !== undefined &&
      status !== 'COMPLETED' &&
      existing.status === 'COMPLETED'
    ) {
      data.completedAt = null;
      data.verificationDueAt = null;
    }

    const updated = await prisma.recommendation.update({
      where: { id: existing.id },
      data,
    });
    if (status !== undefined) {
      await syncDecisionFromRecommendationStatus({
        organizationId: req.user!.organizationId,
        recommendationId: existing.id,
        status,
      }).catch((err) =>
        console.error('syncDecisionFromRecommendationStatus failed', err)
      );
    }
    res.json({ success: true, data: updated });
  }
);

router.post(
  '/actions/:id/impact',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const { realizedImpactCents, impactType, note, lifecycleOutcome } = req.body || {};
    if (
      typeof realizedImpactCents !== 'number' ||
      !Number.isInteger(realizedImpactCents) ||
      realizedImpactCents < 0 ||
      realizedImpactCents > MAX_IMPACT_CENTS
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message:
            'realizedImpactCents must be a whole number of cents between 0 and 1,000,000,000',
        },
      });
      return;
    }
    if (impactType !== undefined && !['SAVINGS', 'REVENUE'].includes(impactType)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Invalid impactType' },
      });
      return;
    }
    const allowedOutcomes: LifecycleOutcome[] = [
      'HELPED',
      'NO_EFFECT',
      'HURT',
      'UNKNOWN',
    ];
    if (
      lifecycleOutcome !== undefined &&
      !allowedOutcomes.includes(lifecycleOutcome)
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'lifecycleOutcome must be HELPED, NO_EFFECT, HURT, or UNKNOWN',
        },
      });
      return;
    }

    const existing = await prisma.recommendation.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recommendation not found' },
      });
      return;
    }
    if (existing.status !== 'COMPLETED') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'Complete the action before recording its impact',
        },
      });
      return;
    }

    const updated = await prisma.recommendation.update({
      where: { id: existing.id },
      data: {
        realizedImpactCents,
        realizedNote:
          typeof note === 'string' && note.trim()
            ? note.trim().slice(0, 500)
            : realizedImpactCents === 0
              ? 'Owner recorded no measurable impact'
              : null,
        realizedSource: 'USER_CONFIRMED',
        realizedAt: new Date(),
        impactType: impactType ?? existing.impactType,
        verificationDueAt: null,
      },
    });
    await recordLifecycleOutcome({
      organizationId: req.user!.organizationId,
      recommendationId: existing.id,
      lifecycleOutcome: inferLifecycleFromRealizedImpact(
        realizedImpactCents,
        lifecycleOutcome ?? null
      ),
      outcomeVerificationType: 'USER_CONFIRMED',
      realizedImpactCents,
    }).catch((err) =>
      console.error('recordLifecycleOutcome after user confirm failed', err)
    );
    await writeAudit({
      organizationId: req.user!.organizationId,
      actorUserId: req.user!.id,
      action: 'action.impact_confirmed',
      resourceType: 'Recommendation',
      resourceId: existing.id,
      metadata: {
        realizedImpactCents,
        impactType: updated.impactType,
        lifecycleOutcome: lifecycleOutcome ?? null,
      },
    });
    res.json({ success: true, data: updated });
  }
);

router.get('/impact/summary', async (req: Request, res: Response) => {
  const data = await impactSummary(req.user!.organizationId);
  res.json({ success: true, data });
});

router.post('/forecasts/rebuild', async (req: Request, res: Response) => {
  const rows = await buildForecasts(req.user!.organizationId);
  res.json({ success: true, data: rows });
});

router.get('/pricing/guidance', async (req: Request, res: Response) => {
  const data = await pricingGuidance(req.user!.organizationId);
  res.json({
    success: true,
    data: sanitizePricingGuidanceForClient(data),
  });
});

router.get('/enrolment/guidance', async (req: Request, res: Response) => {
  const data = await enrolmentGuidance(req.user!.organizationId);
  res.json({ success: true, data });
});

router.get('/enrolment/tactics', async (req: Request, res: Response) => {
  const data = await listEnrolmentTactics(req.user!.organizationId);
  res.json({ success: true, data });
});

router.post(
  '/enrolment/tactics',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const {
      tacticKey,
      otherLabel,
      resultSummary,
      outcome,
      costBand,
      shareAnonymized,
    } = req.body || {};
    if (!tacticKey || !resultSummary || !outcome || !costBand) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message:
            'tacticKey, resultSummary (what result you got), outcome, and costBand are required',
        },
      });
      return;
    }
    try {
      const data = await recordEnrolmentTactic(req.user!.organizationId, {
        tacticKey,
        otherLabel,
        resultSummary: String(resultSummary),
        outcome,
        costBand,
        shareAnonymized: Boolean(shareAnonymized),
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VALIDATION';
      const message =
        code === 'RESULT_REQUIRED'
          ? 'Say what result you got. Advisor uses that, not a guess.'
          : code === 'RESULT_TOO_LONG'
            ? 'Keep the result under 2,000 characters. Do not include student or family names.'
            : 'Could not save that tactic.';
      res.status(400).json({ success: false, error: { code, message } });
    }
  }
);

router.delete(
  '/enrolment/tactics/:id',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const deleted = await deleteEnrolmentTactic(
      req.user!.organizationId,
      req.params.id
    );
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tactic record not found' },
      });
      return;
    }
    res.json({ success: true, data: { id: deleted.id } });
  }
);

router.post(
  '/sessions',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const { productServiceId, staffMemberId, startsAt, durationMinutes, title } =
      req.body || {};
    if (!productServiceId || !staffMemberId || !startsAt || !durationMinutes) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message:
            'productServiceId, staffMemberId, startsAt and durationMinutes are required',
        },
      });
      return;
    }
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'durationMinutes must be between 1 and 1440',
        },
      });
      return;
    }
    const starts = new Date(startsAt);
    if (Number.isNaN(starts.getTime())) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'startsAt must be a valid date' },
      });
      return;
    }
    const [programme, staff] = await Promise.all([
      prisma.productService.findFirst({
        where: { id: productServiceId, organizationId: req.user!.organizationId },
      }),
      prisma.staffMember.findFirst({
        where: { id: staffMemberId, organizationId: req.user!.organizationId },
      }),
    ]);
    if (!programme || !staff) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Programme or staff member not found' },
      });
      return;
    }
    const rosterCount = await prisma.engagement.count({
      where: {
        organizationId: req.user!.organizationId,
        productServiceId,
        status: { in: ['ACTIVE', 'PAUSED'] },
        isTrial: false,
      },
    });
    const row = await prisma.session.create({
      data: {
        organizationId: req.user!.organizationId,
        productServiceId,
        staffMemberId,
        title: title || `${programme.name} session`,
        startsAt: starts,
        endsAt: new Date(starts.getTime() + minutes * 60_000),
        rosterCount,
      },
    });
    res.status(201).json({ success: true, data: row });
  }
);

router.post('/advisor/ask', async (req: Request, res: Response) => {
  const { question, conversationId, idempotencyKey } = req.body || {};
  if (!question) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION', message: 'question required' },
    });
    return;
  }
  try {
    const result = await askAdvisor({
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      question,
      conversationId,
      idempotencyKey:
        typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? idempotencyKey.trim()
          : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AiGatewayError) {
      res.status(err.httpStatus).json({ success: false, error: err.toApiError() });
      return;
    }
    throw err;
  }
});

router.get(
  '/ai-usage',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const data = await getOrganizationAiUsageAnalytics(
      req.user!.organizationId
    );
    res.json({ success: true, data });
  }
);

router.patch(
  '/ai-usage/budget',
  requireRole(['OWNER']),
  async (req: Request, res: Response) => {
    const monthlyUsd = Number(req.body?.monthlyBudgetUsd);
    const dailyUsd = Number(req.body?.dailyBudgetUsd);
    if (
      !Number.isFinite(monthlyUsd) ||
      monthlyUsd < 0 ||
      !Number.isFinite(dailyUsd) ||
      dailyUsd < 0
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'Monthly and daily budgets must be non-negative USD amounts.',
        },
      });
      return;
    }
    const organizationId = req.user!.organizationId;
    const existing = await prisma.aiBudgetConfig.findFirst({
      where: { organizationId, scope: 'ORGANIZATION' },
    });
    const budgetData = {
      monthlyBudgetUsdMicros: BigInt(Math.round(monthlyUsd * 1_000_000)),
      dailyBudgetUsdMicros: BigInt(Math.round(dailyUsd * 1_000_000)),
      isActive: true,
    };
    const data = existing
      ? await prisma.aiBudgetConfig.update({
          where: { id: existing.id },
          data: budgetData,
        })
      : await prisma.aiBudgetConfig.create({
          data: {
            organizationId,
            scope: 'ORGANIZATION',
            ...budgetData,
          },
        });
    res.json({
      success: true,
      data: {
        ...data,
        monthlyBudgetUsdMicros:
          data.monthlyBudgetUsdMicros?.toString() ?? null,
        dailyBudgetUsdMicros: data.dailyBudgetUsdMicros?.toString() ?? null,
      },
    });
  }
);

router.post(
  '/advisor/track-action',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS', 'FINANCE']),
  async (req: Request, res: Response) => {
    const { conversationId, title, description, expectedImpactCents, impactType } =
      req.body || {};
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      typeof description !== 'string' ||
      !description.trim()
    ) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'title and description required' },
      });
      return;
    }
    if (
      expectedImpactCents !== undefined &&
      expectedImpactCents !== null &&
      (typeof expectedImpactCents !== 'number' ||
        !Number.isInteger(expectedImpactCents) ||
        expectedImpactCents < 0 ||
        expectedImpactCents > MAX_IMPACT_CENTS)
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'expectedImpactCents must be a whole number of cents',
        },
      });
      return;
    }
    if (impactType !== undefined && impactType !== null && !['SAVINGS', 'REVENUE'].includes(impactType)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Invalid impactType' },
      });
      return;
    }
    if (conversationId) {
      const convo = await prisma.aiConversation.findFirst({
        where: { id: conversationId, organizationId: req.user!.organizationId },
      });
      if (!convo) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found' },
        });
        return;
      }
    }
    const rec = await prisma.recommendation.create({
      data: {
        organizationId: req.user!.organizationId,
        conversationId: conversationId || undefined,
        source: 'ADVISOR_CHAT',
        ownerUserId: req.user!.id,
        title: title.trim().slice(0, 200),
        description: description.trim().slice(0, 2000),
        expectedImpactCents: expectedImpactCents ?? undefined,
        expectedImpactNote: expectedImpactCents
          ? 'Owner estimate from an Advisor conversation'
          : undefined,
        impactType: impactType ?? undefined,
        status: 'ACCEPTED',
      },
    });
    await attachDecisionOutcomeForRecommendation({
      organizationId: req.user!.organizationId,
      recommendationId: rec.id,
      title: rec.title,
      source: 'ADVISOR_CHAT',
      status: 'ACCEPTED',
      expectedImpactCents: expectedImpactCents ?? null,
      impactType: impactType ?? null,
      captureContext: true,
    }).catch((err) =>
      console.error('attachDecisionOutcomeForRecommendation failed', err)
    );
    await writeAudit({
      organizationId: req.user!.organizationId,
      actorUserId: req.user!.id,
      action: 'action.tracked_from_advisor',
      resourceType: 'Recommendation',
      resourceId: rec.id,
      metadata: { conversationId: conversationId || null },
    });
    res.status(201).json({ success: true, data: rec });
  }
);

router.post(
  '/jobs/verify-impact',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const result = await runImpactVerificationForOrg(req.user!.organizationId);
    res.json({ success: true, data: result });
  }
);

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

/** Single customer setting: Help Improve Advisor (grants V2 + benchmark internally). */
router.get('/learning/help-improve', async (req: Request, res: Response) => {
  const role = req.user!.role;
  const canManage = role === 'OWNER' || role === 'ADMIN';
  const data = await getHelpImproveAdvisorStatus(req.user!.organizationId, {
    canManage,
  });
  res.json({ success: true, data });
});

router.post(
  '/learning/help-improve/enable',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const data = await enableHelpImproveAdvisor({
      organizationId: req.user!.organizationId,
      grantedByUserId: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  }
);

router.post(
  '/learning/help-improve/disable',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const data = await disableHelpImproveAdvisor({
      organizationId: req.user!.organizationId,
      actorUserId: req.user!.id,
    });
    res.json({ success: true, data });
  }
);

router.post(
  '/learning/help-improve/dismiss-invite',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const data = await dismissHelpImproveInvite({
      organizationId: req.user!.organizationId,
      actorUserId: req.user!.id,
    });
    res.json({ success: true, data });
  }
);

/** Internal/purpose-list view (engineering). Customer UI uses /learning/help-improve. */
router.get('/learning/consents', async (req: Request, res: Response) => {
  const data = await listLearningConsents(req.user!.organizationId);
  res.json({ success: true, data });
});

/**
 * Legacy purpose grant: enabling any allowed purpose turns on Help Improve Advisor
 * (both internal purposes) so customers never end up with half-state.
 */
router.post(
  '/learning/consents',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const { purposeVersion } = req.body || {};
    const allowed = [
      OUTCOME_CORPUS_PURPOSE_VERSION_V2,
      BENCHMARK_SNAPSHOTS_PURPOSE_VERSION,
    ];
    if (purposeVersion && !allowed.includes(purposeVersion)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: `purposeVersion must be one of ${allowed.join(', ')}`,
        },
      });
      return;
    }
    const data = await enableHelpImproveAdvisor({
      organizationId: req.user!.organizationId,
      grantedByUserId: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  }
);

router.post(
  '/learning/consents/withdraw',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const data = await disableHelpImproveAdvisor({
      organizationId: req.user!.organizationId,
      actorUserId: req.user!.id,
    });
    res.json({ success: true, data });
  }
);

router.get('/actions/:id/decision-outcome', async (req: Request, res: Response) => {
  const data = await getDecisionOutcomeForOrg(
    req.user!.organizationId,
    req.params.id
  );
  if (!data) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Decision outcome not found' },
    });
    return;
  }
  res.json({ success: true, data });
});

router.post(
  '/mapping/propose',
  requireRole(['OWNER', 'ADMIN', 'OPERATIONS']),
  async (req: Request, res: Response) => {
    const { sourceSystemType, fields } = req.body || {};
    if (
      typeof sourceSystemType !== 'string' ||
      !Array.isArray(fields) ||
      fields.length === 0
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'sourceSystemType and fields[] required',
        },
      });
      return;
    }
    const data = await proposeMappings({
      sourceSystemType,
      fields: fields.map((f: { name?: string; dataType?: string }) => ({
        name: String(f.name || ''),
        dataType: f.dataType ?? null,
      })),
    });
    res.json({ success: true, data });
  }
);

router.get('/members', requireRole(['OWNER', 'ADMIN']), async (req: Request, res: Response) => {
  const data = await listMembers(req.user!.organizationId);
  res.json({ success: true, data });
});

router.get(
  '/invitations',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const data = await listInvitations(req.user!.organizationId);
    res.json({ success: true, data });
  }
);

router.post(
  '/invitations',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '');
      const role = req.body?.role as UserRole;
      if (!email || !role || !INVITABLE_ROLES.includes(role)) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'Email and role are required' },
        });
        return;
      }
      const data = await createInvitation({
        organizationId: req.user!.organizationId,
        invitedByUserId: req.user!.id,
        email,
        role,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      res.status(e.status || 500).json({
        success: false,
        error: {
          code: e.code || 'INVITE_FAILED',
          message: e.message || 'Could not send invitation',
        },
      });
    }
  }
);

router.delete(
  '/invitations/:id',
  requireRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    try {
      await revokeInvitation({
        organizationId: req.user!.organizationId,
        invitationId: req.params.id,
        actorUserId: req.user!.id,
      });
      res.json({ success: true });
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      res.status(e.status || 500).json({
        success: false,
        error: {
          code: e.code || 'INVITE_REVOKE_FAILED',
          message: e.message || 'Could not revoke invitation',
        },
      });
    }
  }
);

export default router;
