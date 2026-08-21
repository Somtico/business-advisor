import { Link } from 'react-router';
import type { ReactNode } from 'react';

const ACTION_LABELS: Record<string, string> = {
  '/app/programmes': 'Open Programmes & Students',
  '/app/enrolment': 'Open Enrolment Advisor',
  '/app/staffing': 'Open Staffing',
  '/app/expenses': 'Open Expenses & Subscriptions',
  '/app/targets': 'Open Targets & Forecasts',
  '/app/actions': 'Open Action Centre',
  '/app/pricing': 'Open Pricing Advisor',
  '/app/readiness': 'Open Data Readiness',
};

export function hrefForActionTitle(title: string): string {
  const t = title.toLowerCase();
  if (/\bstudent|\benrolment|\bprogramme|\btrial|\blead/.test(t)) {
    return '/app/programmes';
  }
  if (/\bpric/.test(t)) return '/app/pricing';
  if (/\bstaff|\bwage|\bshift|\binstructor/.test(t)) return '/app/staffing';
  if (/\bexpense|\bsubscription/.test(t)) return '/app/expenses';
  if (/\bcash|\bloan/.test(t)) return '/app/readiness';
  if (/\btarget|\bforecast/.test(t)) return '/app/targets';
  if (/\btactic/.test(t)) return '/app/enrolment';
  return '/app/actions';
}

export function pageActionLabel(href: string): string {
  return ACTION_LABELS[href] || 'Open This Page';
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export type NextStep = { title: string; detail: string; href?: string };

/** One card per destination so Add Students and Add Enrolments do not repeat the same button. */
export function collapseStepsByHref(steps: NextStep[]): NextStep[] {
  const withoutHref: NextStep[] = [];
  const grouped = new Map<string, NextStep[]>();
  for (const step of steps) {
    if (!step.href) {
      withoutHref.push(step);
      continue;
    }
    const current = grouped.get(step.href) ?? [];
    current.push(step);
    grouped.set(step.href, current);
  }
  const collapsed: NextStep[] = [];
  for (const [href, group] of grouped) {
    if (group.length === 1) {
      collapsed.push(group[0]);
      continue;
    }
    const nouns = group.map((step) => step.title.replace(/^Add /i, ''));
    collapsed.push({
      title: `Add ${joinList(nouns)}`,
      detail: group.map((step) => step.detail).join(' '),
      href,
    });
  }
  return [...collapsed, ...withoutHref];
}

export function actionsNotCoveredBySteps<
  T extends { title: string; description?: string; expectedImpactCents?: number | null },
>(actions: T[], steps: NextStep[]): T[] {
  const taken = new Set(
    steps.map((step) => step.href).filter((href): href is string => Boolean(href))
  );
  return actions.filter((action) => !taken.has(hrefForActionTitle(action.title)));
}

export function PageActionLink({
  to,
  children,
}: {
  to: string;
  children?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="mt-3 inline-flex cursor-pointer items-center rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white"
    >
      {children ?? pageActionLabel(to)}
    </Link>
  );
}

export function NextStepList({
  steps,
}: {
  steps: Array<{ title: string; detail: string; href?: string }>;
}) {
  if (steps.length === 0) return null;
  return (
    <ol className="mt-4 space-y-4">
      {steps.map((step, i) => (
        <li key={step.title} className="bg-ba-mist px-4 py-4">
          <p className="font-semibold text-ba-ink">
            {steps.length > 1 ? `${String(i + 1).padStart(2, '0')} · ` : null}
            {step.title}
          </p>
          <p className="mt-1 text-base text-ba-ink/80">{step.detail}</p>
          {step.href ? <PageActionLink to={step.href} /> : null}
        </li>
      ))}
    </ol>
  );
}
