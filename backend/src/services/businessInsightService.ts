import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import {
  cashOutlook,
  enrolmentMetrics,
  expenseRollup,
  staffingVersusDemand,
  targetProgress,
} from './metrics/analyticsService';

export async function runBusinessInsights(organizationId: string) {
  const [enrolment, staffing, expenses, cash, targets, readiness] =
    await Promise.all([
      enrolmentMetrics(organizationId),
      staffingVersusDemand(organizationId),
      expenseRollup(organizationId),
      cashOutlook(organizationId),
      targetProgress(organizationId),
      prisma.dataReadinessItem.findMany({
        where: { organizationId, status: 'MISSING' },
        orderBy: { priority: 'desc' },
        take: 5,
      }),
    ]);

  const createdInsights: { id: string; title: string }[] = [];
  const createdRecs: { id: string; title: string }[] = [];

  async function addInsight(params: {
    severity:
      | 'POSITIVE'
      | 'WARNING'
      | 'OPPORTUNITY'
      | 'TARGET_RISK'
      | 'COST'
      | 'DATA_QUALITY';
    title: string;
    summary: string;
    evidence: Prisma.InputJsonValue;
    metricKeys?: string[];
    recommendation?: {
      title: string;
      description: string;
      expectedImpactCents?: number;
      expectedImpactNote?: string;
    };
  }) {
    const insight = await prisma.insight.create({
      data: {
        organizationId,
        severity: params.severity,
        title: params.title,
        summary: params.summary,
        evidence: params.evidence,
        metricKeys: params.metricKeys ?? [],
      },
    });
    createdInsights.push({ id: insight.id, title: insight.title });
    if (params.recommendation) {
      const rec = await prisma.recommendation.create({
        data: {
          organizationId,
          insightId: insight.id,
          title: params.recommendation.title,
          description: params.recommendation.description,
          expectedImpactCents: params.recommendation.expectedImpactCents,
          expectedImpactNote: params.recommendation.expectedImpactNote,
          status: 'OPEN',
        },
      });
      createdRecs.push({ id: rec.id, title: rec.title });
    }
  }

  if (staffing.estimatedSavingsCents >= 5000) {
    await addInsight({
      severity: 'COST',
      title: 'Staffing Likely Exceeds Near-Term Demand',
      summary: `About ${staffing.excessHours} excess instructor hours are scheduled this week (estimated labour opportunity $${(staffing.estimatedSavingsCents / 100).toFixed(0)}).`,
      evidence: staffing as unknown as Prisma.InputJsonValue,
      metricKeys: ['staffing_vs_demand'],
      recommendation: {
        title: 'Trim Underused Instructor Hours',
        description:
          'Review classes with low roster counts and consolidate or reduce overlapping instructor coverage before the next operating week.',
        expectedImpactCents: staffing.estimatedSavingsCents,
        expectedImpactNote: 'Estimated weekly labour savings if excess hours are removed',
      },
    });
  }

  for (const t of targets) {
    if (!t.onTrack) {
      await addInsight({
        severity: 'TARGET_RISK',
        title: `Target At Risk: ${t.label}`,
        summary: `Progress is ${(t.progress * 100).toFixed(0)}% of the target (${t.actualValue} vs ${t.targetValue} ${t.unit}).`,
        evidence: t,
        metricKeys: [t.metricKey],
        recommendation: {
          title: `Recover ${t.label}`,
          description:
            'Review enrolment velocity, trial conversion, and capacity for the programmes that feed this target.',
        },
      });
    }
  }

  if (enrolment.conversionRate > 0 && enrolment.conversionRate < 0.3) {
    await addInsight({
      severity: 'WARNING',
      title: 'Trial Conversion Is Soft',
      summary: `Current trial/lead conversion is ${(enrolment.conversionRate * 100).toFixed(0)}%. Follow-up timing and programme fit may be leaking paid enrolments.`,
      evidence: {
        conversionRate: enrolment.conversionRate,
        trialCount: enrolment.trialCount,
      },
      metricKeys: ['conversion_rate'],
      recommendation: {
        title: 'Tighten Trial Follow-Up',
        description:
          'Contact recent trial families within 48 hours with a clear next-class offer and address common objections.',
      },
    });
  }

  if (enrolment.activeStudents > enrolment.activeStudentsPriorMonth) {
    await addInsight({
      severity: 'POSITIVE',
      title: 'Active Student Count Is Up',
      summary: `Active paid students moved from ${enrolment.activeStudentsPriorMonth} to ${enrolment.activeStudents}.`,
      evidence: enrolment,
      metricKeys: ['active_students'],
    });
  }

  if (expenses.subscriptionCount > 0) {
    const high = expenses.subscriptions
      .slice()
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 3);
    await addInsight({
      severity: 'OPPORTUNITY',
      title: 'Review Top Recurring Subscriptions',
      summary: `You have ${expenses.subscriptionCount} active subscriptions (~$${(expenses.recurringSubscriptionMonthlyCents / 100).toFixed(0)}/month). Start with the highest-cost tools.`,
      evidence: { top: high },
      metricKeys: ['subscriptions'],
      recommendation: {
        title: 'Audit Highest-Cost Tools This Week',
        description: high.map((s) => s.name).join(', '),
        expectedImpactNote: 'Cancel or downgrade unused tools before renewal',
      },
    });
  }

  if (cash.netMonthlyCents < 0 && (cash.runwayWeeks ?? 99) < 8) {
    await addInsight({
      severity: 'WARNING',
      title: 'Cash Runway Is Tight',
      summary: `Net monthly outlook is $${(cash.netMonthlyCents / 100).toFixed(0)} with roughly ${cash.runwayWeeks} weeks of runway at current burn.`,
      evidence: cash,
      metricKeys: ['cash_outlook'],
      recommendation: {
        title: 'Protect Cash This Month',
        description:
          'Defer non-essential purchases, accelerate receivables/tuition follow-up, and revisit the largest recurring costs.',
      },
    });
  }

  for (const item of readiness.slice(0, 2)) {
    await addInsight({
      severity: 'DATA_QUALITY',
      title: `Missing Data: ${item.label}`,
      summary: item.whyItMatters,
      evidence: {
        datasetKey: item.datasetKey,
        exampleInsight: item.exampleInsight,
      },
      recommendation: {
        title: `Collect ${item.label}`,
        description:
          item.exampleInsight ||
          'Add this dataset via manual entry, CSV, or the academy portal connector.',
      },
    });
  }

  await prisma.metricSnapshot.create({
    data: {
      organizationId,
      metricKey: 'active_students',
      value: enrolment.activeStudents,
      unit: 'count',
      evidence: enrolment,
    },
  });

  return { insights: createdInsights, recommendations: createdRecs };
}
