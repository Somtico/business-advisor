import {
  EnrolmentTacticKey,
  TacticCostBand,
  TacticOutcome,
} from '@prisma/client';
import prisma from '../config/prisma';
import { ADVICE_DISCLAIMER, OUTCOME_CORPUS_PURPOSE_VERSION } from '../config/legal';
import {
  cashOutlook,
  cashSafeTestSize,
  enrolmentMetrics,
  programmePerformance,
} from './metrics/analyticsService';

const LOW_UTILIZATION = 0.6;
const FULL_ROOM = 0.95;
const WEAK_CONVERSION = 0.3;
const MIN_TRIALS = 3;
const MIN_PRIOR_STARTS = 2;
const VELOCITY_DECLINE = 0.8;
const HIGH_CHURN = 0.15;
const MIN_PEER_SAMPLE = 8;
const PAID_TEST_MONITOR_WEEKS = 6;
const MIN_RUNWAY_WEEKS_FOR_PAID = 8;
const PERSISTENCE_DAYS = 28;

export type EnrolmentLeak =
  | 'INSUFFICIENT_DATA'
  | 'FULL_ROOM'
  | 'CONVERSION_LEAK'
  | 'CHURN_LEAK'
  | 'VELOCITY_DOWN'
  | 'UNDERFILLED'
  | 'STABLE';

export const TACTIC_CATALOG: Array<{
  key: EnrolmentTacticKey;
  label: string;
  typicalCost: TacticCostBand;
}> = [
  { key: 'TRIAL_FOLLOWUP', label: 'Follow up with trial / enquiry families', typicalCost: 'FREE' },
  { key: 'FAMILY_REFERRAL', label: 'Ask current families for referrals', typicalCost: 'FREE' },
  { key: 'WAITLIST', label: 'Start or work a waitlist', typicalCost: 'FREE' },
  { key: 'SCHEDULE_CHANGE', label: 'Change class day, time, or instructor', typicalCost: 'FREE' },
  { key: 'SCHOOL_OUTREACH', label: 'School, library, or community notice (no ad spend)', typicalCost: 'LOW' },
  { key: 'OPEN_HOUSE', label: 'Open house or demo class in a room you already rent', typicalCost: 'LOW' },
  { key: 'SOCIAL_ORGANIC', label: 'Organic social posts (no paid boost)', typicalCost: 'FREE' },
  { key: 'PRICE_PROMO', label: 'Limited promo or scholarship seats', typicalCost: 'LOW' },
  { key: 'PAID_ADS', label: 'Paid ads or boosted posts', typicalCost: 'PAID' },
  { key: 'OTHER', label: 'Something else', typicalCost: 'LOW' },
];

const LEAK_LABELS: Record<EnrolmentLeak, string> = {
  INSUFFICIENT_DATA: 'Needs Data',
  FULL_ROOM: 'Full Room',
  CONVERSION_LEAK: 'Conversion Leak',
  CHURN_LEAK: 'Retention Leak',
  VELOCITY_DOWN: 'Enrolment Velocity Down',
  UNDERFILLED: 'Spare Seats',
  STABLE: 'On Track',
};

function educationBucket(subtype: string): string {
  if (subtype === 'STEM_ACADEMY') return 'STEM';
  if (subtype === 'TUTORING_CENTRE') return 'TUTORING';
  return 'OTHER_ENRICHMENT';
}

function cheapSteps(leak: EnrolmentLeak): Array<{ title: string; detail: string }> {
  switch (leak) {
    case 'CONVERSION_LEAK':
      return [
        {
          title: 'Call Recent Trial Families This Week',
          detail:
            'Contact every open trial or enquiry with a specific next-class date. Record what almost stopped them. This uses demand you already paid to attract.',
        },
        {
          title: 'Make the Next Step Obvious',
          detail:
            'Send one follow-up that names the programme, the time, and how to enrol. Vague "let us know if you have questions" messages leak paid seats.',
        },
      ];
    case 'VELOCITY_DOWN':
      return [
        {
          title: 'Ask Current Families for One Named Referral',
          detail:
            'A short note from you, forwarded by a family who already trusts the centre, costs nothing and uses reputation you already have.',
        },
        {
          title: 'Put a Flyer Where You Already Are',
          detail:
            'Schools, libraries, and community boards you already visit beat a new paid channel while starts are slipping.',
        },
      ];
    case 'CHURN_LEAK':
      return [
        {
          title: 'Call Families Who Ended in the Last 30 Days',
          detail:
            'Ask whether the issue was schedule, instructor, or fit. Offer a pause instead of a cancel where that matches what they said.',
        },
      ];
    case 'FULL_ROOM':
      return [
        {
          title: 'Run a Waitlist, Not More Ads',
          detail:
            'The room is full. Paid acquisition that cannot seat people wastes spend. Capture names and consider a second section only after labour still clears your cost floor (see Pricing Advisor).',
        },
      ];
    case 'UNDERFILLED':
      return [
        {
          title: 'Fill Seats With People Who Already Know You',
          detail:
            'Referrals, a short open house in a room you already rent, and trial follow-up use capacity you are already paying for.',
        },
      ];
    case 'STABLE':
      return [
        {
          title: 'Record What Is Working',
          detail:
            'Keep doing the cheap channels that already produce starts. Log the tactic and the result so Advisor can avoid suggesting a paid test you do not need.',
        },
      ];
    default:
      return [
        {
          title: 'Add Enrolment Records',
          detail:
            'Advisor needs programmes with capacity, paid enrolments, and (when you have them) trials or enquiries before it can name the leak.',
        },
      ];
  }
}

export async function peerPatternsForLeak(leakType: string) {
  if (leakType === 'INSUFFICIENT_DATA' || leakType === 'STABLE') return [];
  const rows = await prisma.anonymizedTacticOutcome.groupBy({
    by: ['tacticKey', 'outcome'],
    where: {
      leakType,
      outcome: { in: ['HELPED', 'NO_EFFECT', 'HURT'] },
    },
    _count: { _all: true },
  });
  const byTactic = new Map<
    EnrolmentTacticKey,
    { helped: number; total: number }
  >();
  for (const row of rows) {
    const cur = byTactic.get(row.tacticKey) ?? { helped: 0, total: 0 };
    cur.total += row._count._all;
    if (row.outcome === 'HELPED') cur.helped += row._count._all;
    byTactic.set(row.tacticKey, cur);
  }
  const out = [];
  for (const tactic of TACTIC_CATALOG) {
    const stats = byTactic.get(tactic.key);
    if (!stats || stats.total < MIN_PEER_SAMPLE) continue;
    out.push({
      tacticKey: tactic.key,
      label: tactic.label,
      helped: stats.helped,
      total: stats.total,
      helpedShare: Number((stats.helped / stats.total).toFixed(2)),
    });
  }
  out.sort((a, b) => b.helpedShare - a.helpedShare || b.helped - a.helped);
  return out;
}

function rankTacticCatalog(
  peerPatterns: Array<{ tacticKey: EnrolmentTacticKey }>
) {
  const rank = new Map(peerPatterns.map((p, i) => [p.tacticKey, i]));
  return [...TACTIC_CATALOG].sort((a, b) => {
    const ra = rank.has(a.key) ? (rank.get(a.key) as number) : 999;
    const rb = rank.has(b.key) ? (rank.get(b.key) as number) : 999;
    return ra - rb;
  });
}

export async function enrolmentGuidance(organizationId: string) {
  const now = new Date();
  const [org, enrolment, programmes, cash, cashSafe, tactics] =
    await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { educationSubtype: true },
      }),
      enrolmentMetrics(organizationId),
      programmePerformance(organizationId),
      cashOutlook(organizationId),
      cashSafeTestSize(organizationId),
      prisma.enrolmentTacticTried.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

  const withCapacity = programmes.filter(
    (p) => p.capacity != null && p.capacity > 0
  );
  const totalCapacity = withCapacity.reduce((s, p) => s + (p.capacity ?? 0), 0);
  const totalActive = programmes.reduce((s, p) => s + p.activeEnrolments, 0);
  const utilization =
    totalCapacity > 0 ? Math.min(1, totalActive / totalCapacity) : null;
  const spareSeats =
    totalCapacity > 0 ? Math.max(0, totalCapacity - totalActive) : 0;

  const recentFrom = new Date(now.getTime() - PERSISTENCE_DAYS * 86_400_000);
  const priorFrom = new Date(now.getTime() - 2 * PERSISTENCE_DAYS * 86_400_000);
  const [recentStarts, priorStarts] = await Promise.all([
    prisma.engagement.count({
      where: {
        organizationId,
        isTrial: false,
        OR: [
          { startDate: { gte: recentFrom, lt: now } },
          { startDate: null, createdAt: { gte: recentFrom, lt: now } },
        ],
      },
    }),
    prisma.engagement.count({
      where: {
        organizationId,
        isTrial: false,
        OR: [
          { startDate: { gte: priorFrom, lt: recentFrom } },
          { startDate: null, createdAt: { gte: priorFrom, lt: recentFrom } },
        ],
      },
    }),
  ]);

  const conversionKnown = enrolment.trialCount >= MIN_TRIALS;
  const conversionWeak =
    conversionKnown && enrolment.conversionRate < WEAK_CONVERSION;
  const conversionHealthy =
    conversionKnown && enrolment.conversionRate >= WEAK_CONVERSION;

  const velocityWeak =
    priorStarts >= MIN_PRIOR_STARTS &&
    recentStarts < priorStarts * VELOCITY_DECLINE;
  const churnWeak =
    enrolment.churnRate >= HIGH_CHURN && enrolment.endedThisMonth >= 2;

  let leak: EnrolmentLeak;
  const missing: string[] = [];
  if (programmes.length === 0) {
    leak = 'INSUFFICIENT_DATA';
    missing.push('Add at least one active programme with a capacity.');
  } else if (totalActive === 0) {
    leak = 'INSUFFICIENT_DATA';
    missing.push('Record paid enrolments so Advisor can see fill and velocity.');
  } else if (utilization != null && utilization >= FULL_ROOM) {
    leak = 'FULL_ROOM';
  } else if (conversionWeak) {
    leak = 'CONVERSION_LEAK';
  } else if (churnWeak) {
    leak = 'CHURN_LEAK';
  } else if (velocityWeak) {
    leak = 'VELOCITY_DOWN';
  } else if (utilization != null && utilization < LOW_UTILIZATION && spareSeats > 0) {
    leak = 'UNDERFILLED';
  } else {
    leak = 'STABLE';
  }

  if (tactics.length === 0 && leak !== 'INSUFFICIENT_DATA') {
    missing.push(
      'Record what you have already tried to grow enrolments, and what result you got. Empty seats have many causes; Advisor will not invent a marketing plan.'
    );
  }
  if (
    leak !== 'INSUFFICIENT_DATA' &&
    leak !== 'FULL_ROOM' &&
    !conversionKnown &&
    enrolment.trialCount < MIN_TRIALS
  ) {
    missing.push(
      'Record trials or enquiries so conversion can be measured. Without that, Advisor cannot tell a follow-up leak from a demand leak.'
    );
  }

  const cashAllowsPaid =
    cash.netMonthlyCents >= 0 ||
    (cash.runwayWeeks != null && cash.runwayWeeks >= MIN_RUNWAY_WEEKS_FOR_PAID);
  const paidTestEligible =
    leak === 'UNDERFILLED' &&
    conversionHealthy &&
    spareSeats > 0 &&
    cashAllowsPaid &&
    cashSafe.eligible;
  const triedPaid = tactics.some((t) => t.tacticKey === 'PAID_ADS');

  const diagnosisNote = (() => {
    switch (leak) {
      case 'INSUFFICIENT_DATA':
        return 'Advisor cannot name an enrolment leak until the missing records are on file. That ask is the advice.';
      case 'FULL_ROOM':
        return `Seats are ${utilization != null ? `${(utilization * 100).toFixed(0)}%` : ''} full. The constraint is capacity, not marketing. A waitlist beats paid ads until you can seat the next student.`;
      case 'CONVERSION_LEAK':
        return `Trial/lead conversion is ${(enrolment.conversionRate * 100).toFixed(0)}% on ${enrolment.trialCount} trial record(s). People are already finding you; the leak is the step to paid. Cheap follow-up comes before more spend.`;
      case 'CHURN_LEAK':
        return `Churn is about ${(enrolment.churnRate * 100).toFixed(0)}% with ${enrolment.endedThisMonth} paid enrolment(s) ending this month. Winning new students while the back door is open is the expensive path.`;
      case 'VELOCITY_DOWN':
        return `Paid starts were ${recentStarts} in the last ${PERSISTENCE_DAYS} days vs ${priorStarts} in the ${PERSISTENCE_DAYS} days before that. Referrals and places you already visit come before a new paid channel.`;
      case 'UNDERFILLED':
        return paidTestEligible
          ? `The room is ${utilization != null ? `${(utilization * 100).toFixed(0)}%` : ''} full with ${spareSeats} open seat(s), and conversion is already healthy. Cheap fills first; a small time-boxed paid test is on the table only after those, and only if cash can absorb it.`
          : `The room is ${utilization != null ? `${(utilization * 100).toFixed(0)}%` : ''} full with ${spareSeats} open seat(s). Filling seats you already pay for beats buying traffic until conversion is measured as healthy and cash can take a test.`;
      default:
        return 'Enrolment looks stable at the current fill. Record what is working so Advisor does not suggest a paid test you do not need.';
    }
  })();

  const peerPatterns = await peerPatternsForLeak(leak);
  const { contextualPeerPatterns } = await import(
    './moat/contextualPlaybookService'
  );
  const contextualPeers = await contextualPeerPatterns({
    diagnosedLeak: leak === 'INSUFFICIENT_DATA' ? 'GENERAL' : leak,
    educationSubtype: org.educationSubtype,
  }).catch(() => null);

  return {
    leak,
    leakLabel: LEAK_LABELS[leak],
    note: diagnosisNote,
    missingData: missing,
    utilization,
    spareSeats,
    totalActive,
    totalCapacity: totalCapacity > 0 ? totalCapacity : null,
    conversionRate: enrolment.conversionRate,
    trialCount: enrolment.trialCount,
    recentStarts,
    priorStarts,
    churnRate: enrolment.churnRate,
    endedThisMonth: enrolment.endedThisMonth,
    cash: {
      netMonthlyCents: cash.netMonthlyCents,
      runwayWeeks: cash.runwayWeeks,
    },
    cheapNextSteps: cheapSteps(leak),
    paidTest: paidTestEligible
      ? {
          eligible: true,
          monitorWeeks: PAID_TEST_MONITOR_WEEKS,
          weeklySpendCapCents: cashSafe.weeklyCapCents,
          note: `Consider a ${PAID_TEST_MONITOR_WEEKS}-week paid test capped at $${(cashSafe.weeklyCapCents / 100).toFixed(0)}/week (cash-safe from your recorded surplus), then watch enquiries, trials, and paid starts. Do not treat spend as proof it will fill seats.${triedPaid ? ' You already logged paid ads; read that result before repeating the same spend.' : ''} Cheap referral and follow-up still come first.`,
        }
      : {
          eligible: false,
          monitorWeeks: null,
          weeklySpendCapCents: null,
          note:
            leak === 'FULL_ROOM'
              ? 'Paid acquisition is not suggested while the room cannot seat new students.'
              : cashAllowsPaid && !cashSafe.eligible
                ? cashSafe.note
                : 'Paid spend is not the first move. Conversion, retention, or unused capacity still look cheaper to fix.',
        },
    tacticsTried: tactics,
    askTriedAndResults: tactics.length === 0,
    peerPatterns,
    contextualPeers,
    tacticCatalog: rankTacticCatalog(peerPatterns),
    programmes: programmes.map((p) => ({
      id: p.id,
      name: p.name,
      activeEnrolments: p.activeEnrolments,
      capacity: p.capacity,
      utilization: p.utilization,
      trials: p.trials,
    })),
    disclaimer: ADVICE_DISCLAIMER,
    generatedAt: now.toISOString(),
    privacy: {
      anonymizedSharing:
        'Optional. Shown only when a leak is named and you pick a clear outcome. If you opt in, we store only the tactic type, cost band, outcome, leak type, and a coarse education bucket. Your notes, names, and organization id are not copied. Aggregates appear only after 8 similar reports. Somtico may later use those de-identified rows to improve its own playbook and models. They are never sent to train Anthropic, OpenAI, or any other third-party model.',
      minPeerSample: MIN_PEER_SAMPLE,
    },
    canShareAnonymized: leak !== 'INSUFFICIENT_DATA',
    educationBucket: educationBucket(org.educationSubtype),
  };
}

export async function recordEnrolmentTactic(
  organizationId: string,
  input: {
    tacticKey: EnrolmentTacticKey;
    otherLabel?: string | null;
    resultSummary: string;
    outcome: TacticOutcome;
    costBand: TacticCostBand;
    shareAnonymized?: boolean;
  }
) {
  const resultSummary = input.resultSummary.trim();
  if (!resultSummary) {
    throw new Error('RESULT_REQUIRED');
  }
  if (resultSummary.length > 2000) {
    throw new Error('RESULT_TOO_LONG');
  }
  const otherLabel =
    input.tacticKey === 'OTHER'
      ? (input.otherLabel || '').trim().slice(0, 80) || null
      : null;

  const guidance = await enrolmentGuidance(organizationId);
  const leakTypeAtReport =
    guidance.leak === 'INSUFFICIENT_DATA' ? null : guidance.leak;
  const share =
    Boolean(input.shareAnonymized) &&
    input.outcome !== 'UNKNOWN' &&
    leakTypeAtReport != null;

  const row = await prisma.enrolmentTacticTried.create({
    data: {
      organizationId,
      tacticKey: input.tacticKey,
      otherLabel,
      resultSummary,
      outcome: input.outcome,
      costBand: input.costBand,
      shareAnonymized: share,
      leakTypeAtReport,
    },
  });

  if (share && leakTypeAtReport) {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { educationSubtype: true },
    });
    await prisma.anonymizedTacticOutcome.create({
      data: {
        tacticKey: input.tacticKey,
        outcome: input.outcome,
        costBand: input.costBand,
        leakType: leakTypeAtReport,
        educationBucket: educationBucket(org.educationSubtype),
        purposeVersion: OUTCOME_CORPUS_PURPOSE_VERSION,
      },
    });
  }

  return row;
}

export async function listEnrolmentTactics(organizationId: string) {
  return prisma.enrolmentTacticTried.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteEnrolmentTactic(
  organizationId: string,
  id: string
) {
  const existing = await prisma.enrolmentTacticTried.findFirst({
    where: { id, organizationId },
  });
  if (!existing) return null;
  await prisma.enrolmentTacticTried.delete({ where: { id } });
  return existing;
}
