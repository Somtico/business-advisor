import prisma from '../config/prisma';
import { executiveDashboard } from './metrics/analyticsService';
import { runBusinessInsights } from './businessInsightService';
import { buildForecasts } from './metrics/analyticsService';
import { impactSummary } from './impactService';
import { runImpactVerificationForOrg } from './impactVerificationService';
import { ADVICE_DISCLAIMER } from '../config/legal';
import { operatingLoop } from './organizationMemoryService';
import { sendTransactionalEmail } from './emailService';
import {
  brandTextEmailSuffix,
  emailBodyParagraph,
  emailBulletList,
  emailFinePrint,
  emailHighlightBox,
  emailPrimaryButtonHtml,
  emailRichParagraph,
  emailSectionHeading,
  emailStatTable,
  escapeEmailHtml,
  publicEmailSiteBaseUrl,
  wrapBrandedEmailHtml,
} from '../lib/emailLayout';

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function dashboardStatValue(
  available: boolean,
  cents: number | null | undefined,
  missingLabel: string
): string {
  if (!available || cents == null) return missingLabel;
  return dollars(cents);
}

function buildWeeklyBriefContent(params: {
  orgName: string;
  firstName: string;
  impact: Awaited<ReturnType<typeof impactSummary>>;
  loop: Awaited<ReturnType<typeof operatingLoop>>;
  dash: Awaited<ReturnType<typeof executiveDashboard>>;
  openTitles: string[];
}): { htmlContent: string; textContent: string } {
  const { orgName, firstName, impact, loop, dash, openTitles } = params;
  const greeting = firstName.trim() || 'there';
  const appUrl = `${publicEmailSiteBaseUrl()}/app`;

  const impactBits: string[] = [];
  if (impact.verified.totalCents > 0) {
    impactBits.push(
      emailRichParagraph(
        `Advisor's verified impact to date: <strong>${escapeEmailHtml(
          `${dollars(impact.verified.savedCents)} saved · ${dollars(impact.verified.earnedCents)} earned`
        )}</strong> across ${impact.verified.actionCount} completed action${
          impact.verified.actionCount === 1 ? '' : 's'
        }.`
      )
    );
    if (impact.thisMonth.totalCents > 0) {
      impactBits.push(
        emailRichParagraph(
          `This month: <strong>${escapeEmailHtml(dollars(impact.thisMonth.totalCents))}</strong> in verified impact.`
        )
      );
    }
  } else {
    impactBits.push(
      emailBodyParagraph(
        'No verified impact from Advisor yet. Complete actions in the Action Centre and confirm their results to build your impact ledger.'
      )
    );
  }
  if (impact.awaitingConfirmationCount > 0) {
    impactBits.push(
      emailBodyParagraph(
        `${impact.awaitingConfirmationCount} completed action${
          impact.awaitingConfirmationCount === 1 ? ' is' : 's are'
        } awaiting your impact confirmation in the Action Centre.`
      )
    );
  }
  if (impact.pipelineExpectedCents > 0) {
    impactBits.push(
      emailRichParagraph(
        `Open action pipeline: <strong>${escapeEmailHtml(
          dollars(impact.pipelineExpectedCents)
        )}</strong> in estimated impact across ${impact.pipelineCount} action${
          impact.pipelineCount === 1 ? '' : 's'
        }.`
      )
    );
  }

  const loopLines: string[] = [
    emailRichParagraph(
      `Enrolment diagnosis: <strong>${escapeEmailHtml(loop.leakLabel)}</strong>`
    ),
    emailBodyParagraph(loop.focus),
  ];
  if (loop.cheapNextStep) {
    loopLines.push(
      emailRichParagraph(
        `Cheap next step: <strong>${escapeEmailHtml(loop.cheapNextStep.title)}</strong> — ${escapeEmailHtml(loop.cheapNextStep.detail)}`
      )
    );
  }
  if (loop.lastTactic) {
    loopLines.push(
      emailRichParagraph(
        `Last tactic you recorded: <strong>${escapeEmailHtml(loop.lastTactic.label)}</strong> (${escapeEmailHtml(String(loop.lastTactic.outcome))}).`
      )
    );
  } else {
    loopLines.push(
      emailBodyParagraph(
        'Record what you tried and the result you got on Enrolment Advisor so next week is not a guess.'
      )
    );
  }
  if (loop.peerPlaybook.length) {
    loopLines.push(
      emailBodyParagraph(
        `Playbook (8+ similar reports): ${loop.peerPlaybook
          .map((p) => `${p.label} helped in ${p.helped} of ${p.total}`)
          .join('; ')}.`
      )
    );
  }

  const htmlContent = wrapBrandedEmailHtml({
    preheader: `${orgName}: this week's numbers, operating loop, and open actions.`,
    cardTitle: 'Weekly Executive Brief',
    contentHtml: `
      ${emailBodyParagraph(`Hello ${greeting},`)}
      ${emailHighlightBox(
        `<strong>${escapeEmailHtml(orgName)}</strong>. Your weekly snapshot from Advisor.`
      )}
      ${emailSectionHeading("Advisor's Impact")}
      ${impactBits.join('\n')}
      ${emailSectionHeading("This Week's Operating Loop")}
      ${loopLines.join('\n')}
      ${emailSectionHeading("This Week's Numbers")}
      ${emailStatTable([
        {
          label: 'Active Students',
          value:
            dash.enrolment.activeStudentsAvailable &&
            dash.enrolment.activeStudents != null
              ? String(dash.enrolment.activeStudents)
              : 'Needs student data',
        },
        {
          label: 'Expenses This Month',
          value: dashboardStatValue(
            dash.expenses.monthExpensesAvailable,
            dash.expenses.monthExpenseCents,
            'Needs expense data'
          ),
        },
        {
          label: 'Projected Monthly Net',
          value:
            dash.cash.outlookStatus === 'READY' && dash.cash.netMonthlyCents != null
              ? dollars(dash.cash.netMonthlyCents)
              : 'Not enough data to forecast',
        },
        {
          label: 'Labour Opportunity',
          value: dashboardStatValue(
            dash.staffing.status === 'READY',
            dash.staffing.estimatedSavingsCents,
            'Needs staffing data'
          ),
        },
      ])}
      ${emailSectionHeading('Open Actions')}
      ${emailBulletList(openTitles)}
      ${emailPrimaryButtonHtml(appUrl, 'Open Command Centre')}
      ${emailFinePrint(
        'Generated by Somtico Business Advisor. Open the app for drill-down evidence.'
      )}
      ${emailFinePrint(ADVICE_DISCLAIMER)}
    `,
  });

  const impactText: string[] = [];
  if (impact.verified.totalCents > 0) {
    impactText.push(
      `Advisor's verified impact to date: ${dollars(impact.verified.savedCents)} saved · ${dollars(impact.verified.earnedCents)} earned across ${impact.verified.actionCount} completed action${impact.verified.actionCount === 1 ? '' : 's'}.`
    );
    if (impact.thisMonth.totalCents > 0) {
      impactText.push(
        `This month: ${dollars(impact.thisMonth.totalCents)} in verified impact.`
      );
    }
  } else {
    impactText.push(
      'No verified impact from Advisor yet. Complete actions in the Action Centre and confirm their results to build your impact ledger.'
    );
  }
  if (impact.awaitingConfirmationCount > 0) {
    impactText.push(
      `${impact.awaitingConfirmationCount} completed action${impact.awaitingConfirmationCount === 1 ? ' is' : 's are'} awaiting your impact confirmation in the Action Centre.`
    );
  }
  if (impact.pipelineExpectedCents > 0) {
    impactText.push(
      `Open action pipeline: ${dollars(impact.pipelineExpectedCents)} in estimated impact across ${impact.pipelineCount} action${impact.pipelineCount === 1 ? '' : 's'}.`
    );
  }

  const loopText = [
    `Enrolment diagnosis: ${loop.leakLabel}`,
    loop.focus,
    loop.cheapNextStep
      ? `Cheap next step: ${loop.cheapNextStep.title} — ${loop.cheapNextStep.detail}`
      : null,
    loop.lastTactic
      ? `Last tactic you recorded: ${loop.lastTactic.label} (${loop.lastTactic.outcome}).`
      : 'Record what you tried and the result you got on Enrolment Advisor so next week is not a guess.',
    loop.peerPlaybook.length
      ? `Playbook (8+ similar reports): ${loop.peerPlaybook
          .map((p) => `${p.label} helped in ${p.helped} of ${p.total}`)
          .join('; ')}.`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const textContent = `
Weekly Executive Brief — ${orgName}

Hello ${greeting},

Advisor's Impact
${impactText.join('\n')}

This Week's Operating Loop
${loopText}

This Week's Numbers
Active Students: ${
    dash.enrolment.activeStudentsAvailable && dash.enrolment.activeStudents != null
      ? dash.enrolment.activeStudents
      : 'Needs student data'
  }
Expenses This Month: ${dashboardStatValue(
    dash.expenses.monthExpensesAvailable,
    dash.expenses.monthExpenseCents,
    'Needs expense data'
  )}
Projected Monthly Net: ${
    dash.cash.outlookStatus === 'READY' && dash.cash.netMonthlyCents != null
      ? dollars(dash.cash.netMonthlyCents)
      : 'Not enough data to forecast'
  }
Labour Opportunity: ${dashboardStatValue(
    dash.staffing.status === 'READY',
    dash.staffing.estimatedSavingsCents,
    'Needs staffing data'
  )}

Open Actions
${openTitles.length ? openTitles.map((t) => `- ${t}`).join('\n') : '- None'}

Open Command Centre: ${appUrl}

Generated by Somtico Business Advisor. Open the app for drill-down evidence.

${ADVICE_DISCLAIMER}
${brandTextEmailSuffix()}
  `.trim();

  return { htmlContent, textContent };
}

export async function sendWeeklyExecutiveBrief(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      memberships: {
        where: { role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
        include: { user: true },
      },
    },
  });
  const dash = await executiveDashboard(organizationId);
  const impact = await impactSummary(organizationId);
  const loop = await operatingLoop(organizationId);
  const openRecs = await prisma.recommendation.findMany({
    where: { organizationId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const orgName = org.displayName || org.name;
  const subject = `Weekly Executive Brief — ${orgName}`;
  const openTitles = openRecs.map((r) => r.title);

  if (!process.env.BREVO_API_KEY) {
    console.log(
      `[brief:dry-run] ${subject} -> ${org.memberships
        .filter((m) => m.user.isActive && m.user.emailVerified)
        .map((m) => m.user.email)
        .join(', ')}`
    );
    return { sent: false, dryRun: true, subject };
  }

  let sentCount = 0;
  for (const membership of org.memberships) {
    const user = membership.user;
    if (!user.isActive || !user.emailVerified) continue;
    const { htmlContent, textContent } = buildWeeklyBriefContent({
      orgName,
      firstName: user.firstName,
      impact,
      loop,
      dash,
      openTitles,
    });
    const result = await sendTransactionalEmail({
      toEmail: user.email,
      toName: `${user.firstName} ${user.lastName}`.trim(),
      subject,
      htmlContent,
      textContent,
    });
    if (result.sent) sentCount += 1;
  }

  return {
    sent: sentCount > 0,
    dryRun: false,
    subject,
    recipients: org.memberships.filter((m) => m.user.isActive && m.user.emailVerified)
      .length,
  };
}

export async function runDailyAnalysisForOrg(organizationId: string) {
  await buildForecasts(organizationId);
  const insights = await runBusinessInsights(organizationId);
  const impactVerification = await runImpactVerificationForOrg(organizationId);
  return { ...insights, impactVerification };
}

export async function runDailyAnalysisAllOrgs() {
  const orgs = await prisma.organization.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true },
  });
  const results = [];
  for (const org of orgs) {
    try {
      // Deterministic only today (forecasts, insights, impact verification).
      // No external LLM calls — no AI spend. Keep idempotent per org/day if
      // generative analysis is added later (use aiLogicalRequest.idempotencyKey).
      const r = await runDailyAnalysisForOrg(org.id);
      results.push({ organizationId: org.id, slug: org.slug, ok: true, ...r });
    } catch (err) {
      console.error(`Daily analysis failed for ${org.slug}`, err);
      results.push({
        organizationId: org.id,
        slug: org.slug,
        ok: false,
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }
  return results;
}

export async function runWeeklyBriefsAllOrgs() {
  const orgs = await prisma.organization.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true },
  });
  const results = [];
  for (const org of orgs) {
    try {
      const r = await sendWeeklyExecutiveBrief(org.id);
      results.push({ organizationId: org.id, slug: org.slug, ok: true, ...r });
    } catch (err) {
      console.error(`Weekly brief failed for ${org.slug}`, err);
      results.push({
        organizationId: org.id,
        slug: org.slug,
        ok: false,
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }
  return results;
}
