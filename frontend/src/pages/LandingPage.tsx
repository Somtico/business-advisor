import { useEffect } from 'react';
import { Link, Navigate } from 'react-router';
import { FaqAccordion } from '../components/FaqAccordion';
import { PublicShell } from '../components/PublicShell';
import { ScreenshotGallery } from '../components/ScreenshotGallery';
import { landingFaqSections } from '../content/faqs';
import {
  advisorCapabilities,
  advisorHowItWorks,
  advisorScreenshots,
  advisorTrustPoints,
  PILOT_PRICE,
  PRODUCT_NAME,
} from '../content/product';
import { useAuth } from '../context/AuthContext';

export function LandingPage() {
  const { accessToken, organization } = useAuth();

  useEffect(() => {
    document.title = `${PRODUCT_NAME} | After-School and Tutoring Centres`;
    return () => {
      document.title = PRODUCT_NAME;
    };
  }, []);

  if (accessToken) {
    return (
      <Navigate
        to={organization?.onboardingCompleted ? '/app' : '/app/onboarding'}
        replace
      />
    );
  }

  return (
    <PublicShell>
      <section className="border-b border-ba-line bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:px-8 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-base font-semibold uppercase tracking-wide text-ba-accent">
              From Somtico Technologies Inc.
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight md:text-5xl">
              {PRODUCT_NAME}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ba-ink/80">
              Run your after-school, tutoring, or enrichment centre on real
              numbers. Nonso, the AI advisor inside, tells you the cheapest you
              can afford to charge, what you should charge, where money is
              leaking, and then proves what its advice saved you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="cursor-pointer rounded-md bg-ba-accent px-5 py-3 text-base font-semibold text-white"
              >
                Start Pilot · {PILOT_PRICE}
              </Link>
              <Link
                to="/login"
                className="cursor-pointer rounded-md border border-ba-line bg-white px-5 py-3 text-base font-semibold"
              >
                Sign In
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              document.getElementById('screenshots')?.scrollIntoView({
                behavior: 'smooth',
              })
            }
            className="cursor-pointer overflow-hidden border border-ba-line bg-white shadow-sm"
            aria-label="View product screenshots"
          >
            <img
              src="/images/screenshots/command-centre.png"
              alt="AI Business Advisor command centre with verified impact, students, expenses, and cash outlook"
              width={1440}
              height={900}
              className="h-auto w-full object-cover object-left-top"
            />
          </button>
        </div>
      </section>

      <section id="meet" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-base font-semibold uppercase tracking-wide text-ba-accent">
              Meet Nonso, the AI Advisor
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold">
              An Advisor That Never Guesses
            </h2>
            <p className="mt-3 text-base text-ba-ink/80">
              Nonso is the AI advisor at the heart of the AI Business Advisor
              platform. It is software, not a person. It reads the numbers you
              record (enrolments, sessions, wages, expenses, and targets) and
              turns them into plain-language advice you can act on.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {advisorTrustPoints.map((point) => (
              <div key={point.title} className="border border-ba-line bg-white p-5">
                <h3 className="text-lg font-semibold">{point.title}</h3>
                <p className="mt-2 text-base text-ba-ink/70">{point.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-ba-line bg-ba-mist/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <p className="text-base font-semibold uppercase tracking-wide text-ba-accent">
            How It Works
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">
            From Your Records to Verified Results
          </h2>
          <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
            Four steps, and every dollar figure along the way comes from your
            own data.
          </p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {advisorHowItWorks.map((step, index) => (
              <li key={step.title} className="border border-ba-line bg-white p-5">
                <span className="font-display text-base font-bold text-ba-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-base text-ba-ink/70">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <p className="text-base font-semibold uppercase tracking-wide text-ba-accent">
          What You Get
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold">
          Everything a Centre Owner Needs to Decide With Confidence
        </h2>
        <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
          Pricing, staffing, cash, and growth, analyzed continuously, explained
          clearly, and tracked to verified dollars.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {advisorCapabilities.map((item) => (
            <li key={item} className="border border-ba-line bg-white p-5 text-base">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="screenshots" className="border-y border-ba-line bg-ba-mist/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <p className="text-base font-semibold uppercase tracking-wide text-ba-accent">
            See It in Action
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">
            Real Screens From the Product
          </h2>
          <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
            These are actual screenshots from AI Business Advisor, not mockups.
            Click any image to view it full size.
          </p>
          <ScreenshotGallery screenshots={advisorScreenshots} />
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <p className="text-base font-semibold uppercase tracking-wide text-ba-accent">
          FAQ
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold">
          Frequently Asked Questions
        </h2>
        <p className="mt-3 max-w-3xl text-base text-ba-ink/80">
          The same answers you will find inside the product, covering Nonso,
          pricing, privacy, and the pilot plan.
        </p>
        <div className="mt-10">
          <FaqAccordion sections={landingFaqSections()} heading="h3" />
        </div>
      </section>

      <section className="border-t border-ba-line bg-ba-deep text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <h2 className="font-display text-3xl font-bold">Start Your Pilot</h2>
          <p className="mt-3 max-w-2xl text-base text-white/80">
            Create an organization, connect your numbers, and let Nonso work
            from your records. Pilot plan {PILOT_PRICE}, billed through Stripe.
            Cancel any time.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="cursor-pointer rounded-md bg-ba-accent px-5 py-3 text-base font-semibold text-white"
            >
              Create Organization
            </Link>
            <Link
              to="/login"
              className="cursor-pointer rounded-md border border-white/30 px-5 py-3 text-base font-semibold text-white"
            >
              Sign In
            </Link>
          </div>
          <p className="mt-6 max-w-2xl text-sm text-white/60">
            AI Business Advisor provides informational analysis to support your
            decisions; it is not financial, legal, tax, or accounting advice.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
