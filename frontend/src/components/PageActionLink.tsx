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

export function pageActionLabel(href: string): string {
  return ACTION_LABELS[href] || 'Open This Page';
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
