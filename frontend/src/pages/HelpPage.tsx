import type { ReactNode } from 'react';
import { Link } from 'react-router';

type Faq = { q: string; a: ReactNode };

const FAQ_SECTIONS: { title: string; items: Faq[] }[] = [
  {
    title: 'About Nonso',
    items: [
      {
        q: 'Who is Nonso?',
        a: 'Nonso is the AI business advisor inside Business Advisor. Nonso reads your own records — enrolments, sessions, wages, expenses, subscriptions, and targets — and turns them into plain-language advice: where money is leaking, what to charge, which actions to take next, and what those actions saved or earned once you complete them.',
      },
      {
        q: 'Where do Nonso\u2019s numbers come from?',
        a: 'Every figure comes from a fixed set of analytics tools reading your organization\u2019s data. Nonso has no free-form database access and cannot see other organizations\u2019 data. If a number is not in your records, Nonso does not have it.',
      },
      {
        q: 'Does Nonso ever guess?',
        a: 'No. Nonso operates under strict evidence rules: it only uses figures returned by its analytics tools, it never invents or extrapolates numbers, and when the data needed to answer is missing, the answer is a request for that data — not an estimate. The Pricing Advisor applies the same gate: no calculation runs until every required input is on record.',
      },
      {
        q: 'What happens when data is missing?',
        a: 'Nonso tells you exactly what is missing and where to add it. For example, if a programme has no scheduled sessions or an instructor has no wage profile, the Pricing Advisor lists those items with links or inline forms so you can fill the gap and recalculate immediately.',
      },
      {
        q: 'Is Nonso\u2019s advice professional advice?',
        a: (
          <>
            No. Nonso provides informational analysis based on the data you
            supply. It is not financial, legal, tax, accounting, or investment
            advice, and decisions remain yours. See the{' '}
            <Link className="text-ba-accent underline" to="/terms">
              Terms of Service
            </Link>{' '}
            for the full disclaimer.
          </>
        ),
      },
    ],
  },
  {
    title: 'Pricing Advisor',
    items: [
      {
        q: 'How does Nonso calculate the cheapest I can charge?',
        a: 'Nonso builds a cost floor per student per month: direct instructor labour for the programme\u2019s scheduled sessions (from recorded wage profiles), plus a share of your monthly overhead (recorded expenses and subscriptions) allocated across enrolled students. It shows two floors — one at your current enrolment and one at full capacity — so you can see how filling seats lowers the floor.',
      },
      {
        q: 'How is the recommended price set?',
        a: 'Recommended price = cost floor at current enrolment + your target profit margin. The default margin is configurable per organization in Settings. Every step of the calculation is shown in the "How This Was Calculated" breakdown on each programme card.',
      },
      {
        q: 'Why does a programme show "needs more data"?',
        a: 'The pricing gate found a required input missing — for example, no scheduled sessions this week, an instructor without a wage profile, or no recorded overhead. Nonso lists each missing item. Once you add it, guidance is calculated on the spot.',
      },
      {
        q: 'Can I change the target margin?',
        a: 'Yes. The target margin is an organization setting. Adjusting it recalculates the recommended price for every programme; the cost floors are unaffected because they reflect real costs.',
      },
    ],
  },
  {
    title: 'Impact Ledger',
    items: [
      {
        q: 'What is the impact ledger?',
        a: 'A running record of the money Nonso\u2019s advice saved or earned you. Every recommendation carries an expected impact. When you complete an action, its result moves through three buckets: pipeline (open actions), estimated pending (completed, awaiting verification), and verified (measured from your data or confirmed by you).',
      },
      {
        q: 'How is impact verified?',
        a: 'When you complete an action, Nonso snapshots a baseline of the relevant records. After the verification window (30 days), it measures what actually changed — for example, lower recorded wage costs or a cancelled subscription. If the change is measurable, the impact is marked "Verified from Your Data". If it is not measurable, Nonso asks you to confirm the result, and it is marked "Confirmed by You".',
      },
      {
        q: 'Can verified impact be overstated?',
        a: 'Measured impact is capped at the expected amount and only counted when the change in your records clears a minimum threshold. You can also record that an action had no impact — honesty keeps the ledger credible.',
      },
      {
        q: 'How do I track advice from a chat as an action?',
        a: 'After Nonso answers a question, use "Track This as an Action". It creates a recommendation in the Action Centre linked to the conversation, with your own estimate of the expected impact. It then flows through the same verification as any other action.',
      },
    ],
  },
  {
    title: 'Data & Privacy',
    items: [
      {
        q: 'Is my data private?',
        a: 'Yes. Your data is scoped to your organization. Nonso\u2019s tools only read your organization\u2019s records, and AI providers receive only the aggregated evidence needed to answer your question — never your raw database.',
      },
      {
        q: 'What data should I enter for the best advice?',
        a: 'Programmes with prices and capacity, student enrolments, weekly session schedules, staff wage profiles, expenses, subscriptions, and monthly targets. The more complete the records, the more of Nonso\u2019s analysis unlocks — and the app tells you exactly what is missing when something is blocked.',
      },
      {
        q: 'What are the weekly briefs?',
        a: 'A weekly email summarizing your key numbers, open actions, and Nonso\u2019s verified impact to date, with the same advice disclaimer that applies in the app.',
      },
      {
        q: 'Can Nonso change my data or act on my behalf?',
        a: 'No. Nonso reads and advises. All changes to your records — completing actions, confirming impact, adding sessions or wages — are done by you.',
      },
    ],
  },
  {
    title: 'Getting Started',
    items: [
      {
        q: 'What should I do first after signing up?',
        a: 'Add your programmes with list prices and capacity, enrol your current students, add staff with wage profiles, schedule this week\'s class sessions, and record expenses or subscriptions. Then open Pricing Advisor and Ask Nonso. The Data Readiness page lists every dataset and why it matters.',
      },
      {
        q: 'Do I have to enter everything by hand?',
        a: 'No. You can type records in, import students, expenses, subscriptions, and revenue by CSV, or connect an academy registration portal from Settings. Nonso uses whatever you have; missing datasets produce a request for data rather than a guessed number.',
      },
      {
        q: 'How do I ask Nonso a question?',
        a: (
          <>
            Open{' '}
            <Link className="text-ba-accent underline" to="/app/advisor">
              Ask Nonso
            </Link>
            , type a question in plain language (for example, "where can we save labour this week?"), and submit. While Nonso works you will see the analysis steps. The answer is grounded only in your records, and you can track it as an action.
          </>
        ),
      },
      {
        q: 'What is the difference between Run Insights and Ask Nonso?',
        a: 'Run Insights (Action Centre) generates a batch of structured recommendations from deterministic rules — staffing, pricing, cash, conversion. Ask Nonso answers a specific question in conversation. Both use the same analytics tools and the same no-guessing rules.',
      },
    ],
  },
  {
    title: 'Accounts, Billing & Access',
    items: [
      {
        q: 'Who can see our data?',
        a: 'Only users in your organization, scoped by role. Owners and admins can manage billing and connectors. Operations and finance can complete actions and record impact. Viewers can read dashboards. Nonso never sees another organization\'s records.',
      },
      {
        q: 'How does the pilot subscription work?',
        a: 'The pilot is $5 CAD per month, billed through Stripe. Cancel any time; access continues until the end of the current billing period. Fees are non-refundable except where required by law. Details are in Settings and the Terms of Service.',
      },
      {
        q: 'What currency and spelling does the app use?',
        a: 'Canadian dollars (CAD) and Canadian English throughout: colour, centre, enrolments, labour, cheque. Postal codes use the A1A 1A1 format.',
      },
      {
        q: 'I agreed to the Terms of Service — can I read them again?',
        a: (
          <>
            Yes. The{' '}
            <Link className="text-ba-accent underline" to="/terms">
              Terms of Service
            </Link>{' '}
            are public. Your acceptance (date and version) is stored on your account.
          </>
        ),
      },
    ],
  },
];

export function HelpPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Help & FAQ</h1>

      <section className="mt-6 border border-ba-line bg-white p-6">
        <h2 className="font-display text-2xl font-bold">Meet Nonso</h2>
        <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
          Nonso is your AI business advisor. It watches the numbers you record —
          enrolments, sessions, wages, expenses, and targets — and tells you
          what they mean: the cheapest you can afford to charge, what you
          should charge, where money is leaking, and which action to take next.
          When you act on the advice, Nonso measures what it saved or earned
          you and keeps the receipts in your impact ledger.
        </p>
        <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
          Nonso follows one rule above all: never guess. Every figure is
          calculated from your records, every calculation is shown step by
          step, and when data is missing, Nonso asks for it instead of
          estimating.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/app/advisor"
            className="cursor-pointer bg-ba-accent px-4 py-2 text-base font-semibold text-white"
          >
            Ask Nonso a Question
          </Link>
          <Link
            to="/app/pricing"
            className="cursor-pointer border border-ba-line px-4 py-2 text-base font-semibold"
          >
            Open the Pricing Advisor
          </Link>
        </div>
      </section>

      {FAQ_SECTIONS.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="font-display text-2xl font-bold">{section.title}</h2>
          <div className="mt-3 space-y-3">
            {section.items.map((item) => (
              <details
                key={item.q}
                className="group border border-ba-line bg-white"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 text-base font-semibold">
                  {item.q}
                  <span
                    className="text-ba-ink/50 transition-transform group-open:rotate-180"
                    aria-hidden
                  >
                    ▾
                  </span>
                </summary>
                <div className="border-t border-ba-line p-4 text-base text-ba-ink/80">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-8 text-sm text-ba-ink/60">
        Nonso provides information to support your decisions; it is not
        financial, legal, tax, accounting, or investment advice. See the{' '}
        <Link className="underline" to="/terms">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
