import { Link } from 'react-router';
import { FaqAccordion } from '../components/FaqAccordion';
import { FAQ_SECTIONS } from '../content/faqs';

export function HelpPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Help & FAQ</h1>

      <section className="mt-6 border border-ba-line bg-white p-6">
        <h2 className="font-display text-2xl font-bold">Meet Your Advisor</h2>
        <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
          Advisor watches the numbers you record —
          enrolments, sessions, wages, expenses, and targets — and tells you
          what they mean: the cheapest you can afford to charge, what you
          should charge, where money is leaking, and which action to take next.
          When you act on the advice, Advisor measures what it saved or earned
          you and keeps the receipts in your impact ledger.
        </p>
        <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
          Advisor follows one rule above all: never guess. Every figure is
          calculated from your records, every calculation is shown step by
          step, and when data is missing, Advisor asks for it instead of
          estimating.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/app/advisor"
            className="cursor-pointer bg-ba-accent px-4 py-2 text-base font-semibold text-white"
          >
            Ask Advisor a Question
          </Link>
          <Link
            to="/app/pricing"
            className="cursor-pointer border border-ba-line px-4 py-2 text-base font-semibold"
          >
            Open the Pricing Advisor
          </Link>
        </div>
      </section>

      <div className="mt-8">
        <FaqAccordion sections={FAQ_SECTIONS} />
      </div>

      <p className="mt-8 text-sm text-ba-ink/60">
        Advisor provides information to support your decisions; it is not
        financial, legal, tax, accounting, or investment advice. See the{' '}
        <Link className="underline" to="/terms">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link className="underline" to="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
