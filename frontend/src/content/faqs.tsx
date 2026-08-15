import type { ReactNode } from 'react';
import { Link } from 'react-router';

export type FaqItem = { q: string; a: ReactNode };
export type FaqSection = { title: string; items: FaqItem[] };

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'About Nonso',
    items: [
      {
        q: 'Who is Nonso?',
        a: 'Nonso is the advisor inside AI Business Advisor. Nonso reads your own records — enrolments, sessions, wages, expenses, subscriptions, and targets — and turns them into plain-language advice: where money is leaking, what to charge, which actions to take next, and what those actions saved or earned once you complete them.',
      },
      {
        q: "Where do Nonso's numbers come from?",
        a: "Every figure comes from a fixed set of analytics tools reading your organization's data. Nonso has no free-form database access and cannot see other organizations' data. If a number is not in your records, Nonso does not have it.",
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
        q: "Is Nonso's advice professional advice?",
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
        a: "Nonso builds a cost floor per student per month: direct instructor labour for the programme's scheduled sessions (from recorded wage profiles), plus a share of your monthly overhead (recorded expenses and subscriptions) allocated across enrolled students. It shows two floors — one at your current enrolment and one at full capacity — so you can see how filling seats lowers the floor.",
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
      {
        q: 'Will Nonso tell me I am charging too much?',
        a: 'Not from empty seats, and never from area household income. Cost-plus tells you the floor, not the market. If the price sits clearly above the recommended (cost + target margin) price, utilization has been low for at least four weeks, spare seats exist, and a recorded demand signal is weak (trial-to-paid conversion, enquiry-to-enrol, or enrolment velocity vs the prior period), Nonso offers an Above Target: Price Test. That is a time-boxed test at a price that still clears the cost floor, plus a window to watch enrolments and conversion. It is not a claim that price caused fewer sales, and it does not promise that a cut will fill the room.',
      },
      {
        q: 'Why does Nonso sometimes say filling seats beats a price change?',
        a: 'When the price already meets the target margin but the room is under 60% full, and the price-test gate does not fire, Nonso keeps the On Track verdict. Marketing, schedule, instructor, location, and reputation all produce the same empty room. A cut that does not fill seats is a permanent margin loss.',
      },
    ],
  },
  {
    title: 'Enrolment Advisor',
    items: [
      {
        q: 'Can Nonso tell me how to get more students?',
        a: 'Nonso names the leak from your records (full room, weak trial conversion, slipping starts, or churn), then suggests cheap next steps first: follow-up, referrals, waitlists, or a flyer where you already are. A small paid test appears only when conversion is healthy, seats are open, and cash can absorb it. Nonso will not invent a marketing plan or promised student counts.',
      },
      {
        q: 'Why does Nonso ask what I tried and what result I got?',
        a: 'Empty seats have many causes. What you already tried, and whether it helped, is evidence. Record both on Enrolment Advisor so Nonso can avoid repeating a paid channel that did nothing, and can lean on a cheap tactic that already produced starts.',
      },
      {
        q: 'Do you use my enrolment notes to train AI?',
        a: (
          <>
            Your notes stay on your organization and are never used to train
            OpenAI, Claude, Gemini, or any other third-party model. If you
            opt in on a record, we store only a de-identified row (tactic
            type, cost band, outcome, leak type, coarse education bucket),
            with no names or organization id. Those rows improve the playbook
            after at least eight similar reports, and Somtico may later use
            them to train its own industry models. See the{' '}
            <Link className="text-ba-accent underline" to="/privacy">
              Privacy Policy
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    title: 'Impact Ledger',
    items: [
      {
        q: 'What is the impact ledger?',
        a: "A running record of the money Nonso's advice saved or earned you. Every recommendation carries an expected impact. When you complete an action, its result moves through three buckets: pipeline (open actions), estimated pending (completed, awaiting verification), and verified (measured from your data or confirmed by you).",
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
        a: (
          <>
            Yes. Your data is scoped to your organization. Nonso's tools only
            read your organization's records, and AI providers receive only the
            aggregated evidence needed to answer your question, never your raw
            database. The{' '}
            <Link className="text-ba-accent underline" to="/privacy">
              Privacy Policy
            </Link>{' '}
            is a separate page from the Terms of Service.
          </>
        ),
      },
      {
        q: 'What data should I enter for the best advice?',
        a: "Programmes with prices and capacity, student enrolments, weekly session schedules, staff wage profiles, expenses, subscriptions, and monthly targets. The more complete the records, the more of Nonso's analysis unlocks — and the app tells you exactly what is missing when something is blocked.",
      },
      {
        q: 'What are the weekly briefs?',
        a: "A weekly email summarizing your key numbers, open actions, and Nonso's verified impact to date, with the same advice disclaimer that applies in the app.",
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
        a: "Add your programmes with list prices and capacity, enrol your current students, add staff with wage profiles, schedule this week's class sessions, and record expenses or subscriptions. Then open Pricing Advisor and Ask Nonso. The Data Readiness page lists every dataset and why it matters.",
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
        a: "Only users in your organization, scoped by role. Owners and admins can manage billing and connectors. Operations and finance can complete actions and record impact. Viewers can read dashboards. Nonso never sees another organization's records.",
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
            are public. Your acceptance (date and version) is stored on your
            account.
          </>
        ),
      },
    ],
  },
];

function itemsNamed(sectionTitle: string, questions: string[]): FaqItem[] {
  const section = FAQ_SECTIONS.find((s) => s.title === sectionTitle);
  if (!section) return [];
  return questions
    .map((q) => section.items.find((item) => item.q === q))
    .filter((item): item is FaqItem => item != null);
}

/** Visitor-facing subset used on the public landing page. */
export function landingFaqSections(): FaqSection[] {
  return [
    FAQ_SECTIONS[0],
    FAQ_SECTIONS[1],
    {
      title: 'Enrolment Advisor',
      items: itemsNamed('Enrolment Advisor', [
        'Can Nonso tell me how to get more students?',
        'Do you use my enrolment notes to train AI?',
      ]),
    },
    {
      title: 'Impact Ledger',
      items: itemsNamed('Impact Ledger', [
        'What is the impact ledger?',
        'How is impact verified?',
      ]),
    },
    {
      title: 'Data & Privacy',
      items: itemsNamed('Data & Privacy', [
        'Is my data private?',
        'Can Nonso change my data or act on my behalf?',
      ]),
    },
    {
      title: 'Getting Started',
      items: [
        ...itemsNamed('Getting Started', [
          'Do I have to enter everything by hand?',
        ]),
        {
          q: 'How do I ask Nonso a question?',
          a: 'After you sign in, open Ask Nonso, type a question in plain language (for example, "where can we save labour this week?"), and submit. The answer is grounded only in your records.',
        },
      ],
    },
    FAQ_SECTIONS.find((s) => s.title === 'Accounts, Billing & Access')!,
  ];
}
