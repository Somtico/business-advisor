export const PRODUCT_NAME = 'Business Advisor';
export const AI_NAME = 'Nonso';
export const COMPANY_NAME = 'Somtico Technologies Inc.';
export const COMPANY_SHORT = 'Somtico Tech';
export const COMPANY_SITE = 'https://somticoweb.com';
export const PILOT_PRICE = '$5 CAD / month';
export const LOGO_SRC = '/images/logo/nonso-ai-mark.png';
export const LOGO_FULL_SRC = '/images/logo/nonso-ai-logo.png';

export const advisorTrustPoints = [
  {
    title: 'Never Guesses',
    description:
      'Nonso only uses figures calculated from your records. When data is missing, it asks for exactly what it needs instead of estimating.',
  },
  {
    title: 'Shows Its Work',
    description:
      'Every price recommendation comes with a step-by-step calculation breakdown: direct labour, overhead allocation, cost floors, and the margin applied.',
  },
  {
    title: 'Proves Its Value',
    description:
      'When you act on advice, the impact is measured from your data or confirmed by you, never assumed, and tallied in a verified impact ledger.',
  },
  {
    title: 'Keeps Your Data Yours',
    description:
      'Your records stay scoped to your organization. The AI reads aggregated evidence through fixed analytics tools, never your raw database.',
  },
] as const;

export const advisorHowItWorks = [
  {
    title: 'Connect Your Numbers',
    description:
      'Add programmes, enrolments, wages, sessions, and expenses by hand, CSV import, or a portal connector.',
  },
  {
    title: 'Nonso Analyzes',
    description:
      'Deterministic analytics read your records and surface pricing gaps, staffing waste, and cash risks.',
  },
  {
    title: 'Act on Advice',
    description:
      'Each insight becomes a tracked action with an expected dollar impact and a clear next step.',
  },
  {
    title: 'See Verified Results',
    description:
      'After you act, the result is measured from your data or confirmed by you, and added to your impact ledger.',
  },
] as const;

export const advisorCapabilities = [
  'Pricing guidance: your true cost floor and what you should charge',
  "Verified impact ledger: proof of what the advice saved or earned",
  'Executive command centre with enrolment, labour, and cash KPIs',
  'Action Centre that turns insights into tracked, measurable steps',
  'Ask Nonso anything about your numbers in plain language',
  'Enrolment Advisor: name the leak, cheap next steps, then a paid test only when the data supports it',
  'Targets and forecasts across conservative to growth scenarios',
  'Staffing versus demand analysis to catch overscheduled weeks',
  'Subscription and expense audits that find quiet money leaks',
  'Weekly executive brief delivered to your inbox',
] as const;

export const advisorScreenshots = [
  {
    src: '/images/screenshots/command-centre.png',
    alt: "Business Advisor command centre showing Nonso's verified impact, active students, expenses, and cash outlook",
    caption: "Command Centre: your key numbers and Nonso's verified impact at a glance",
  },
  {
    src: '/images/screenshots/pricing-advisor.png',
    alt: 'Pricing Advisor page showing cost floors, recommended prices, and verdicts per programme',
    caption: 'Pricing Advisor: the cheapest you can afford to charge, and what you should charge',
  },
  {
    src: '/images/screenshots/action-centre.png',
    alt: 'Action Centre showing verified savings and open recommendations with expected impact',
    caption: 'Action Centre: advice becomes tracked actions with verified dollar impact',
  },
  {
    src: '/images/screenshots/ask-nonso.png',
    alt: 'Ask Nonso chat page where owners ask questions about their business data',
    caption: 'Ask Nonso: plain-language answers grounded in your own records',
  },
  {
    src: '/images/screenshots/help-faq.png',
    alt: 'Help and FAQ page introducing Nonso and its no-guessing rules',
    caption: 'Meet Nonso: the rules it follows, in plain language',
  },
] as const;
