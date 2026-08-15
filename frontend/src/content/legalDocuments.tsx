import type { ReactNode } from 'react';
import { Link } from 'react-router';

export const TERMS_VERSION = '2026-08-14.2';
export const PRIVACY_VERSION = '2026-08-14.3';

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-ba-ink/90">
        {children}
      </div>
    </section>
  );
}

export function TermsDocumentBody({ compact = false }: { compact?: boolean }) {
  const Section = LegalSection;
  return (
    <>
      <h1 className={`font-display font-bold ${compact ? 'text-2xl' : 'text-3xl'}`}>
        Terms of Service
      </h1>
      <p className="mt-2 text-base text-ba-ink/70">
        AI Business Advisor — operated by Somtico Technologies Inc.
      </p>
      <p className="mt-1 text-base text-ba-ink/70">
        Version {TERMS_VERSION} · Effective 14 August 2026 (updated same day to
        disclose Somtico-owned model improvement)
      </p>

      <Section title="1. Agreement to These Terms">
        <p>
          These Terms of Service (the "Terms") are a binding agreement between
          Somtico Technologies Inc. ("Somtico Tech", "we", "us", "our") and the
          organization on whose behalf you create an account (the "Customer",
          "you", "your") governing your access to and use of the AI Business
          Advisor software-as-a-service platform, including its web application,
          APIs, connectors, email reports, AI features, and related services
          (collectively, the "Service").
        </p>
        <p>
          By checking the acceptance box at signup, creating an account, or using
          the Service, you confirm that you have read, understood, and agree to
          these Terms, that you are at least the age of majority in your
          jurisdiction, and that you have authority to bind the Customer. If you
          do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. The Service Is Information, Not Professional Advice">
        <p>
          The Service produces analytics, metrics, forecasts, projections,
          pricing guidance, insights, recommendations, and AI-generated responses
          (collectively, "Outputs"). All Outputs are provided for general
          information purposes only.
        </p>
        <p>
          Outputs are not, and must not be relied upon as, financial, legal, tax,
          accounting, investment, insurance, employment, or other professional
          advice. Somtico Tech is not a fiduciary, financial adviser, accountant,
          or law firm, and no advisory, fiduciary, or professional relationship is
          created by your use of the Service. You should consult qualified
          professionals before making decisions that affect your business,
          finances, employees, or customers.
        </p>
        <p>
          You bear sole and exclusive responsibility for every decision you make
          and every action you take or do not take, whether or not it was
          informed, suggested, or supported by an Output, and for all outcomes and
          consequences of those decisions and actions.
        </p>
      </Section>

      <Section title="3. Outputs Depend on Your Data; AI Limitations">
        <p>
          Outputs are calculated from the data you (or systems you connect)
          provide. If your data is incomplete, inaccurate, stale, or
          miscategorized, Outputs will be wrong. You are solely responsible for
          the accuracy, completeness, and lawfulness of all data you submit and
          for reviewing and independently verifying every Output before acting on
          it.
        </p>
        <p>
          Parts of the Service use artificial-intelligence models. AI-generated
          content can be incomplete, out of date, or incorrect, and may not
          reflect your actual circumstances even when presented confidently. The
          Service is designed to decline to answer and request more data when
          inputs are missing, but no design eliminates all error. Somtico Tech
          does not warrant that any Output (including forecasts, projections, cost
          floors, and price recommendations) is accurate, complete, or fit for any
          particular decision.
        </p>
      </Section>

      <Section title="4. Assumption of Risk">
        <p>
          To the maximum extent permitted by law, you assume all risk arising from
          your use of the Service and reliance on any Output, including pricing
          changes, staffing changes, spending decisions, cancellation of vendors
          or subscriptions, hiring or scheduling decisions, cash management, and
          any other business decision. Somtico Tech is not responsible for lost
          revenue, lost profits, lost customers, missed targets, or any other
          business outcome.
        </p>
      </Section>

      <Section title="5. Accounts, Eligibility, and Security">
        <p>
          The Service is offered for business use only, not for consumers or
          household purposes. You must provide accurate registration information
          and keep it current. You are responsible for all activity under your
          organization's accounts, for maintaining the confidentiality of
          credentials, and for ensuring your users comply with these Terms.
          Notify us promptly of any suspected unauthorized access.
        </p>
      </Section>

      <Section title="6. Subscriptions, Fees, and Taxes">
        <p>
          Access to the Service requires a paid subscription billed through our
          payment processor (currently Stripe). Fees, billing cadence, and plan
          features are presented at checkout or in the app. Fees are in Canadian
          dollars unless stated otherwise and are exclusive of applicable taxes,
          which you are responsible for. Subscriptions renew automatically until
          cancelled. Except where required by law, fees are non-refundable,
          including for partial periods, unused features, or dissatisfaction with
          Outputs. We may change pricing with at least 30 days' notice; continued
          use after the change takes effect constitutes acceptance. We may
          suspend the Service for non-payment.
        </p>
      </Section>

      <Section title="7. Your Data and Our Licence">
        <p>
          As between you and Somtico Tech, you own the business data you submit to
          the Service ("Customer Data"). You grant Somtico Tech a worldwide,
          non-exclusive licence to host, process, transmit, display, and create
          derivative analytical results from Customer Data solely to provide,
          secure, support, and improve the Service. Identifiable Customer Data
          (including student, family, and staff records, chat notes, and free-text
          results) is not used to train third-party AI models.
        </p>
        <p>
          We may use aggregated or de-identified data that does not identify you
          or any person for analytics, benchmarking, and product improvement. If
          you opt in on a specific enrolment-tactic record, you also grant
          Somtico Tech a perpetual licence to use that de-identified row (tactic
          type, cost band, outcome, leak type, coarse education bucket, and
          purpose version only) to improve the Service, including training,
          evaluating, and operating models and ranking algorithms that Somtico
          owns. Somtico owns those models, playbooks, and the de-identified
          corpus. We will not send that corpus to a third-party model provider for
          their training. You represent that you have all rights and consents
          needed (including from parents, guardians, students, and staff, where
          applicable) to submit Customer Data.
        </p>
      </Section>

      <Section title="8. Acceptable Use">
        <p>You must not, and must not permit anyone to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>use the Service unlawfully or to infringe any rights;</li>
          <li>upload malicious code or data you lack the right to process;</li>
          <li>
            reverse engineer, decompile, scrape, or copy the Service or
            circumvent its security or usage limits;
          </li>
          <li>
            resell, sublicense, or provide the Service to third parties except
            your own authorized users;
          </li>
          <li>
            use the Service to build a competing product or to benchmark for a
            competitor;
          </li>
          <li>
            misrepresent Outputs as professional advice when sharing them with
            third parties.
          </li>
        </ul>
      </Section>

      <Section title="9. Intellectual Property">
        <p>
          Somtico Tech and its licensors own the Service, including all software,
          models (including any Somtico-owned models trained or evaluated on
          de-identified opted-in outcomes), playbooks, designs, blueprints,
          documentation, and trademarks. No rights are granted except the limited
          right to use the Service under these Terms. Feedback you provide may be
          used by Somtico Tech without restriction or obligation.
        </p>
      </Section>

      <Section title="10. Third-Party Services">
        <p>
          The Service depends on third-party providers, including payment
          processing, AI model providers, e-mail delivery, and hosting. Their
          availability and conduct are outside our control, and your use of
          third-party services may be subject to their own terms. Somtico Tech is
          not liable for third-party acts, omissions, or outages.
        </p>
      </Section>

      <Section title="11. Privacy">
        <p>
          How we collect, use, and share personal information is described in our
          Privacy Policy, which is incorporated into these Terms. We handle
          personal information in accordance with applicable Canadian privacy law,
          including the Personal Information Protection and Electronic Documents
          Act (PIPEDA) where it applies. We do not sell Customer Data. AI
          requests are configured to opt out of provider training where the
          provider offers that control. Optional de-identified enrolment-tactic
          outcomes (no names, notes, or organization id) are described in the
          Privacy Policy, are off unless you opt in, and may be used to improve
          Somtico-owned playbooks and models.
        </p>
      </Section>

      <Section title="12. Availability, Changes, and Beta Features">
        <p>
          We aim for high availability but do not guarantee uninterrupted or
          error-free operation. We may modify, add, or remove features, and may
          offer pilot or beta features "as is" with reduced or no support. We may
          perform maintenance with or without notice.
        </p>
      </Section>

      <Section title="13. Disclaimer of Warranties">
        <p>
          THE SERVICE AND ALL OUTPUTS ARE PROVIDED "AS IS" AND "AS AVAILABLE"
          WITHOUT WARRANTIES OF ANY KIND, EXPRESS, IMPLIED, STATUTORY, OR
          OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, AND
          UNINTERRUPTED OPERATION, ALL OF WHICH ARE DISCLAIMED TO THE MAXIMUM
          EXTENT PERMITTED BY LAW. NO ADVICE OR INFORMATION OBTAINED FROM THE
          SERVICE CREATES ANY WARRANTY NOT EXPRESSLY STATED IN THESE TERMS.
        </p>
      </Section>

      <Section title="14. Limitation of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW: (A) SOMTICO TECH WILL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY,
          OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, LOST SAVINGS,
          LOST DATA, BUSINESS INTERRUPTION, OR LOSS OF GOODWILL, EVEN IF ADVISED
          OF THE POSSIBILITY; AND (B) SOMTICO TECH'S TOTAL AGGREGATE LIABILITY
          FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS
          WILL NOT EXCEED THE FEES YOU ACTUALLY PAID TO SOMTICO TECH FOR THE
          SERVICE IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO THE
          CLAIM. THESE LIMITS APPLY TO ALL THEORIES OF LIABILITY AND SURVIVE
          FAILURE OF ESSENTIAL PURPOSE. WHERE A JURISDICTION DOES NOT ALLOW A
          PARTICULAR LIMITATION, IT APPLIES TO THE MAXIMUM EXTENT PERMITTED.
        </p>
      </Section>

      <Section title="15. Indemnification">
        <p>
          You will defend, indemnify, and hold harmless Somtico Tech, its
          directors, officers, employees, and agents from and against all claims,
          damages, liabilities, costs, and expenses (including reasonable legal
          fees) arising out of or related to: (a) Customer Data; (b) your use of
          the Service or reliance on Outputs, including decisions you make based
          on them; (c) your breach of these Terms or applicable law; or (d)
          disputes between you and your customers, staff, students, or their
          families.
        </p>
      </Section>

      <Section title="16. Term, Suspension, and Termination">
        <p>
          These Terms apply from your first acceptance and continue while you use
          the Service. You may cancel your subscription at any time, effective at
          the end of the current billing period. We may suspend or terminate
          access immediately for non-payment, breach, unlawful use, or risk to
          the Service or other customers. For 30 days after termination, you may
          request an export of your Customer Data, after which we may delete it in
          the ordinary course. Sections 2, 3, 4, 7, 9, 13, 14, 15, 17, and 18
          survive termination.
        </p>
      </Section>

      <Section title="17. Governing Law and Disputes">
        <p>
          These Terms are governed by the laws of the Province of Saskatchewan and
          the federal laws of Canada applicable there, without regard to
          conflict-of-law rules. The courts of Saskatchewan sitting in Saskatoon
          have exclusive jurisdiction over disputes arising from these Terms or
          the Service, and each party irrevocably attorns to that jurisdiction. To
          the extent permitted by law, each party waives any right to a jury trial
          and agrees claims must be brought individually and not as part of a
          class proceeding. Any claim must be brought within one (1) year of the
          events giving rise to it, where such limitation is permitted by law.
        </p>
      </Section>

      <Section title="18. General">
        <p>
          Force majeure: neither party is liable for delay or failure caused by
          events beyond its reasonable control. Assignment: you may not assign
          these Terms without our written consent; we may assign to an affiliate
          or in connection with a merger, acquisition, or sale of assets.
          Severability: if any provision is unenforceable, the rest remain in
          effect and the provision will be enforced to the maximum permitted
          extent. Waiver: failure to enforce a provision is not a waiver. Notices:
          we may notify you via the Service or the e-mail on your account. Entire
          agreement: these Terms, together with your subscription order and
          referenced policies, are the entire agreement and supersede prior
          discussions. Changes: we may update these Terms; material changes take
          effect no less than 30 days after notice, and continued use after the
          effective date constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="19. Contact">
        <p>
          Somtico Technologies Inc., Saskatoon, Saskatchewan, Canada. Questions
          about these Terms can be sent through your account's support channel or
          the contact address listed on our website.
        </p>
      </Section>

      <p className="mt-10 text-sm text-ba-ink/60">
        Summary for convenience (the sections above control): AI Business Advisor
        gives you information calculated from your own data. It is not
        professional advice, your decisions remain your own, and Somtico Tech's
        liability is limited to the fees you paid in the last 12 months.
      </p>
    </>
  );
}

export function PrivacyDocumentBody({ compact = false }: { compact?: boolean }) {
  const Section = LegalSection;
  return (
    <>
      <h1 className={`font-display font-bold ${compact ? 'text-2xl' : 'text-3xl'}`}>
        Privacy Policy
      </h1>
      <p className="mt-2 text-base text-ba-ink/70">
        AI Business Advisor, operated by Somtico Technologies Inc. (Somtico Tech)
      </p>
      <p className="mt-1 text-base text-ba-ink/70">
        Version {PRIVACY_VERSION} · Effective 14 August 2026
      </p>
      <p className="mt-4 text-base text-ba-ink/80">
        This policy explains how we handle personal information. It is separate
        from the Terms of Service, which cover the contract for using the
        product. This text is a template pending lawyer review; it is not legal
        advice.
      </p>

      <Section title="1. Who We Are">
        <p>
          Somtico Technologies Inc., Saskatoon, Saskatchewan, Canada, provides AI
          Business Advisor. Questions about privacy can be sent through your
          account support channel or the contact address on{' '}
          <a
            className="text-ba-accent underline"
            href="https://somticoweb.com"
            target="_blank"
            rel="noreferrer"
          >
            somticoweb.com
          </a>
          .
        </p>
      </Section>

      <Section title="2. What We Collect">
        <p>
          Account data: name, email, password hash, organization name and slug,
          role, and your acceptance of the Terms and this policy.
        </p>
        <p>
          Customer Data you enter or connect: students, families, enrolments,
          sessions, staff wages, expenses, subscriptions, targets, chat
          questions, enrolment tactics you log (including the result you
          describe), and similar operating records. That data stays scoped to
          your organization.
        </p>
        <p>
          Technical data needed to run the service: login times, tenant slug, and
          AI usage metering (provider, token counts, cost estimate). We do not
          sell personal information.
        </p>
      </Section>

      <Section title="3. How We Use It">
        <p>
          We use personal information to provide the Service: sign-in, analytics,
          pricing and enrolment guidance, Action Centre, email verification,
          billing, weekly briefs, and support. We use it to keep the product
          secure and to meet legal obligations.
        </p>
        <p>
          We do not use your student, family, or staff records, chat notes, or
          other identifiable Customer Data to train third-party AI models
          (OpenAI, Anthropic, Google, or others). When Chuk, the AI advisor,
          calls an AI provider, it sends aggregated evidence from our analytics
          tools for that question, with provider training and storage opted out
          where the provider offers that control.
        </p>
      </Section>

      <Section title="4. Optional De-Identified Tactic Outcomes">
        <p>
          On Enrolment Advisor you may opt in, record by record, when you log a
          tactic with a clear outcome (helped, no effect, or hurt) and Chuk has
          already named a leak. The opt-in is shown only then. If you opt in, we
          store only: tactic type (for example, family referral), cost band (free
          / low / paid), outcome, the leak type at that moment, and a coarse
          education bucket (STEM, tutoring, or other enrichment).
        </p>
        <p>
          We do not copy your notes, student or family names, organization id,
          location, or email. Those rows are not tied back to your account. Do
          not put names in the result field.
        </p>
        <p>
          If you opt in, Somtico Technologies Inc. may use that de-identified row
          to show playbook counts after at least eight similar reports, and to
          train, evaluate, and operate models and ranking algorithms that Somtico
          owns, so Chuk can get better at this industry from real results. Those
          Somtico-owned models and the de-identified corpus are Somtico
          intellectual property. We will not send that corpus to OpenAI,
          Anthropic, Google, or any other provider for their training. Opt-in is
          off by default. A contributed row cannot be pulled out of a trained
          model.
        </p>
      </Section>

      <Section title="5. Sharing">
        <p>
          We share personal information with processors who help us run the
          Service (hosting, email, payments, AI inference), under contracts that
          limit their use. We may disclose information if required by law or to
          protect the Service, our users, or the public.
        </p>
      </Section>

      <Section title="6. Retention and Your Choices">
        <p>
          We keep Customer Data while your organization has an account, and for a
          limited period after termination so you can request an export (see the
          Terms). You may correct account details in the app, delete tactic notes
          you logged, and ask us to export or delete personal information we hold,
          subject to legal holds.
        </p>
      </Section>

      <Section title="7. Children">
        <p>
          The Service is for businesses, not for children to use directly. If you
          store information about students who are minors, you are responsible for
          having the authority to do so and for the accuracy of that data.
        </p>
      </Section>

      <Section title="8. Canadian Privacy Law">
        <p>
          We handle personal information in accordance with applicable Canadian
          privacy law, including the Personal Information Protection and
          Electronic Documents Act (PIPEDA) where it applies. Saskatchewan law
          and the courts in Saskatoon govern disputes, as set out in the Terms.
        </p>
      </Section>

      <Section title="9. Changes">
        <p>
          We may update this policy. Material changes take effect no less than 30
          days after notice. The version date above identifies the text you
          accepted at signup.
        </p>
      </Section>
    </>
  );
}

/** Footer links used on the standalone legal pages. */
export function LegalPageFooter({ active }: { active: 'terms' | 'privacy' }) {
  return (
    <p className="mt-10 text-base">
      <Link className="text-ba-accent underline" to="/">
        Home
      </Link>{' '}
      ·{' '}
      {active === 'terms' ? (
        <Link className="text-ba-accent underline" to="/privacy">
          Privacy Policy
        </Link>
      ) : (
        <Link className="text-ba-accent underline" to="/terms">
          Terms of Service
        </Link>
      )}{' '}
      ·{' '}
      <Link className="text-ba-accent underline" to="/signup">
        {active === 'terms' ? 'Back to Signup' : 'Signup'}
      </Link>
      {active === 'terms' ? (
        <>
          {' '}
          ·{' '}
          <Link className="text-ba-accent underline" to="/login">
            Sign In
          </Link>
        </>
      ) : null}
    </p>
  );
}
