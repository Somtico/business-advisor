import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import {
  cashOutlook,
  enrolmentMetrics,
  expenseRollup,
  staffingVersusDemand,
  targetProgress,
} from './metrics/analyticsService';
import { pricingGuidance } from './pricingService';
import { enrolmentGuidance } from './enrolmentService';

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
      impactType?: 'SAVINGS' | 'REVENUE';
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
      // Repeated insight runs must not duplicate an action the owner is
      // already working on — duplicates would inflate the impact pipeline.
      const existingOpen = await prisma.recommendation.findFirst({
        where: {
          organizationId,
          title: params.recommendation.title,
          status: { in: ['OPEN', 'ACCEPTED', 'IN_PROGRESS'] },
        },
      });
      if (existingOpen) return;
      const rec = await prisma.recommendation.create({
        data: {
          organizationId,
          insightId: insight.id,
          source: 'INSIGHT',
          title: params.recommendation.title,
          description: params.recommendation.description,
          expectedImpactCents: params.recommendation.expectedImpactCents,
          expectedImpactNote: params.recommendation.expectedImpactNote,
          impactType: params.recommendation.impactType,
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
        impactType: 'SAVINGS',
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
          impactType: 'REVENUE',
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
          'Contact recent trial families within 48 hours with a clear next-class offer. Open Enrolment Advisor to record what you have already tried and the result you got before spending on ads.',
        impactType: 'REVENUE',
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
        impactType: 'SAVINGS',
      },
    });
  }

  const pricing = await pricingGuidance(organizationId);
  for (const prog of pricing.programmes) {
    if (prog.status !== 'READY' || prog.verdict == null) continue;
    const gapCents =
      (prog.recommendedPriceCents ?? 0) - (prog.priceCents ?? 0);
    const monthlyUpsideCents = Math.max(0, gapCents * prog.activeEnrolments);
    if (prog.verdict === 'BELOW_COST') {
      await addInsight({
        severity: 'WARNING',
        title: `Priced Below Cost: ${prog.name}`,
        summary: prog.note || 'This programme is priced below its measured cost floor.',
        evidence: prog.evidence as Prisma.InputJsonValue,
        metricKeys: ['pricing_guidance'],
        recommendation: {
          title: `Fix ${prog.name} Pricing (Below Cost Floor)`,
          description: `Current price $${((prog.priceCents ?? 0) / 100).toFixed(2)}/month is below the measured cost floor of $${((prog.floorAtCurrentFillCents ?? 0) / 100).toFixed(2)} at the current fill. Raise the price toward $${((prog.recommendedPriceCents ?? 0) / 100).toFixed(2)} or fill more seats to bring the per-student floor down.`,
          expectedImpactCents: monthlyUpsideCents > 0 ? monthlyUpsideCents : undefined,
          expectedImpactNote:
            monthlyUpsideCents > 0
              ? 'Additional monthly revenue if the price moves to the recommended level at the current enrolment count'
              : undefined,
          impactType: 'REVENUE',
        },
      });
    } else if (prog.verdict === 'BELOW_TARGET') {
      await addInsight({
        severity: 'OPPORTUNITY',
        title: `Price Below Target Margin: ${prog.name}`,
        summary: prog.note || 'This programme covers cost but misses the target margin.',
        evidence: prog.evidence as Prisma.InputJsonValue,
        metricKeys: ['pricing_guidance'],
        recommendation: {
          title: `Review ${prog.name} Price Against Target Margin`,
          description: `Price covers the cost floor but sits below the ${pricing.targetMarginPercent}% target margin. Recommended price: $${((prog.recommendedPriceCents ?? 0) / 100).toFixed(2)}/month.`,
          expectedImpactCents: monthlyUpsideCents > 0 ? monthlyUpsideCents : undefined,
          expectedImpactNote:
            monthlyUpsideCents > 0
              ? 'Additional monthly revenue if the price moves to the recommended level at the current enrolment count'
              : undefined,
          impactType: 'REVENUE',
        },
      });
    } else if (prog.verdict === 'ABOVE_TARGET') {
      await addInsight({
        severity: 'OPPORTUNITY',
        title: `Consider a Price Test: ${prog.name}`,
        summary:
          prog.note ||
          'Price sits above the cost-plus target while fill and demand look weak. A time-boxed test is on the table; empty seats alone are not treated as proof that price is too high.',
        evidence: prog.evidence as Prisma.InputJsonValue,
        metricKeys: ['pricing_guidance'],
        recommendation: {
          title: `Run a ${prog.priceTestMonitorWeeks ?? 6}-Week Price Test on ${prog.name}`,
          description: `Consider a time-boxed test at $${((prog.testPriceCents ?? prog.recommendedPriceCents ?? 0) / 100).toFixed(2)}/month, which still clears the $${((prog.floorAtCurrentFillCents ?? 0) / 100).toFixed(2)} cost floor, or a limited number of promo/scholarship seats at that rate. Then watch enrolments and conversion. Do not treat this as proof that price caused empty seats, and do not assume a cut will fill the room.`,
          expectedImpactNote: `Watch enrolments and conversion for ${prog.priceTestMonitorWeeks ?? 6} weeks; a cut that does not fill seats is a permanent margin loss`,
        },
      });
    }
  }
  const pricingBlocked = pricing.programmes.filter(
    (prog) => prog.status === 'INSUFFICIENT_DATA'
  );
  if (pricingBlocked.length > 0) {
    await addInsight({
      severity: 'DATA_QUALITY',
      title: 'Pricing Guidance Needs More Data',
      summary: `${pricingBlocked.length} programme(s) cannot get pricing guidance yet: ${pricingBlocked
        .map((prog) => prog.name)
        .join(', ')}. Nonso never guesses; it needs the missing records first.`,
      evidence: {
        programmes: pricingBlocked.map((prog) => ({
          name: prog.name,
          missing: prog.missingData.map((m) => m.label),
        })),
      } as Prisma.InputJsonValue,
      metricKeys: ['pricing_guidance'],
      recommendation: {
        title: 'Complete Pricing Data',
        description:
          'Open the Pricing Advisor page and add the missing records it lists per programme (prices, enrolments, sessions with instructors, wage profiles, expenses).',
      },
    });
  }

  const enrolGuide = await enrolmentGuidance(organizationId);
  if (enrolGuide.leak !== 'INSUFFICIENT_DATA' && enrolGuide.leak !== 'STABLE') {
    await addInsight({
      severity: enrolGuide.leak === 'FULL_ROOM' ? 'OPPORTUNITY' : 'WARNING',
      title: `Enrolment: ${enrolGuide.leakLabel}`,
      summary: enrolGuide.note,
      evidence: {
        leak: enrolGuide.leak,
        utilization: enrolGuide.utilization,
        conversionRate: enrolGuide.conversionRate,
        spareSeats: enrolGuide.spareSeats,
        askTriedAndResults: enrolGuide.askTriedAndResults,
      } as Prisma.InputJsonValue,
      metricKeys: ['enrolment_guidance'],
      recommendation: {
        title:
          enrolGuide.cheapNextSteps[0]?.title || 'Open Enrolment Advisor',
        description: `${enrolGuide.cheapNextSteps.map((s) => s.detail).join(' ')} Record what you have tried and the result you got on the Enrolment Advisor page. Paid ads are suggested only when conversion is healthy, seats are open, and cash can absorb a small test.`,
        impactType: 'REVENUE',
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
        impactType: 'SAVINGS',
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
