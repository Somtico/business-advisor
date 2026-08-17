import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Keep in sync with backend/src/config/legal.ts */
export const TERMS_VERSION = '2026-08-16.2';
export const PRIVACY_VERSION = '2026-08-16.2';
export const LEGAL_NOTICE_PUBLISHED_AT = '2026-08-16';
export const LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT = '2026-09-15';

export const PRIVACY_OFFICER_NAME = 'Somto Ufondu';
export const PRIVACY_OFFICER_TITLE = 'Privacy Officer';
export const PRIVACY_OFFICER_EMAIL = 'somto@somticoweb.com';
export const COMPANY_MAILING_ADDRESS =
  '202B Meadows Blvd., Saskatoon, SK S7V 0E4, Canada';

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
        Somtico Business Advisor — operated by Somtico Technologies Inc.
      </p>
      <p className="mt-1 text-base text-ba-ink/70">
        Version {TERMS_VERSION} · Effective 16 August 2026 for new accounts ·
        Material updates for existing accounts take effect {LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT}{' '}
        (notice published {LEGAL_NOTICE_PUBLISHED_AT})
      </p>

      <Section title="1. Agreement to These Terms">
        <p>
          These Terms of Service (the "Terms") are a binding agreement between
          Somtico Technologies Inc. ("Somtico Tech", "we", "us", "our") and the
          organization on whose behalf you create an account (the "Customer",
          "you", "your") governing your access to and use of the Somtico Business
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
          Parts of the Service use artificial-intelligence models, including an
          AI advisor feature referred to as Advisor ("Advisor"). Advisor is software, not a person.
          AI-generated content can be incomplete, out of date, or incorrect, and
          may not reflect your actual circumstances even when presented
          confidently. The Service is designed to decline to answer and request
          more data when inputs are missing, but no design eliminates all error.
          Somtico Tech does not warrant that any Output (including forecasts,
          projections, cost floors, and price recommendations) is accurate,
          complete, or fit for any particular decision.
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

      <Section title="7. Customer Data, Telemetry, and Optional Learning">
        <p>
          <strong>A. Customer Data used to provide the Service.</strong> As
          between you and Somtico Tech, you own the business data you submit to
          the Service ("Customer Data"). You grant Somtico Tech a worldwide,
          non-exclusive licence to host, process, transmit, display, secure,
          support, calculate analytics from, and otherwise use Customer Data as
          reasonably necessary to provide the Service. Somtico Tech does not claim
          ownership of Customer Data. Identifiable Customer Data is not used to
          train third-party AI models (for example Anthropic or OpenAI).
        </p>
        <p>
          <strong>B. Ordinary internal service telemetry.</strong> Somtico Tech
          may use privacy-safe aggregate operational and technical telemetry for
          security, reliability, product operation, debugging, measuring product
          usage, and improving the Service. That telemetry is not a substitute for
          the optional cross-customer learning described below and is not used as
          a back door for cross-tenant model training without the applicable
          opt-in.
        </p>
        <p>
          <strong>C. Optional Help Improve Advisor.</strong> Cross-customer
          learning is optional and off by default. An authorized organization
          administrator may turn on a single organization setting called Help
          Improve Advisor (Settings → Privacy & Data Learning). While that setting
          is on, Somtico may use privacy-safe information derived from eligible
          future use of the Service — including structured signals from Advisor
          activity, business metrics, recommendations, actions, and results — to
          improve and evaluate Advisor, analytics, recommendations, playbooks,
          Somtico-owned models, and aggregated industry intelligence. Direct
          identifiers are excluded from the cross-customer learning corpus. Somtico
          will not provide that corpus to a third-party model provider for that
          provider's training. Accepting these Terms or the Privacy Policy does
          not turn Help Improve Advisor on. Turning the setting off stops future
          optional cross-customer contributions immediately; normal Service use
          continues. A Somtico fine-tuned industry model is not claimed as
          currently shipped.
        </p>
        <p>
          In Enrolment Advisor, a "leak" is the Service's diagnosis of an
          enrolment problem from your records (for example weak trial conversion
          or spare seats), not a security incident. "Playbooks" means operational
          guidance the Service surfaces from your records and from privacy-safe
          outcome counts. You represent that you have all rights and consents
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
          privacy-safe opted-in outcomes), playbooks, designs, blueprints,
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
          Privacy Policy, which is incorporated into these Terms. The Privacy
          Policy covers AI provider processing, the optional Help Improve Advisor
          setting, consent withdrawal, cross-border processing, and access and
          correction requests. We handle personal information in accordance with
          applicable Canadian privacy law, including the Personal Information
          Protection and Electronic Documents Act (PIPEDA) where it applies. We do
          not sell Customer Data. Help Improve Advisor remains separate from
          acceptance of these Terms.
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
          effective date constitutes acceptance of the updated Terms unless the
          Service requires an explicit re-acceptance for your account.
        </p>
      </Section>

      <Section title="19. Contact">
        <p>
          Somtico Technologies Inc.
          <br />
          {COMPANY_MAILING_ADDRESS}
          <br />
          Privacy and legal questions:{' '}
          <a className="text-ba-accent underline" href={`mailto:${PRIVACY_OFFICER_EMAIL}`}>
            {PRIVACY_OFFICER_EMAIL}
          </a>{' '}
          ({PRIVACY_OFFICER_TITLE}: {PRIVACY_OFFICER_NAME}).
        </p>
      </Section>

      <p className="mt-10 text-sm text-ba-ink/60">
        Summary for convenience (the sections above control): Somtico Business Advisor
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
        Somtico Business Advisor, operated by Somtico Technologies Inc. (Somtico
        Tech)
      </p>
      <p className="mt-1 text-base text-ba-ink/70">
        Version {PRIVACY_VERSION} · Effective 16 August 2026 for new accounts ·
        Material updates for existing accounts take effect{' '}
        {LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT} (notice published{' '}
        {LEGAL_NOTICE_PUBLISHED_AT})
      </p>
      <p className="mt-4 text-base text-ba-ink/80">
        This policy explains how we handle personal information. It is separate
        from the Terms of Service, which cover the contract for using the
        product. Optional Help Improve Advisor is not part of mandatory signup
        acceptance.
      </p>

      <Section title="1. Who We Are and Privacy Officer">
        <p>
          Somtico Technologies Inc. provides Somtico Business Advisor. The Privacy
          Officer is {PRIVACY_OFFICER_NAME} ({PRIVACY_OFFICER_TITLE}).
        </p>
        <p>
          Mailing address: {COMPANY_MAILING_ADDRESS}
          <br />
          Privacy inquiries, access, correction, deletion, and complaint requests:{' '}
          <a className="text-ba-accent underline" href={`mailto:${PRIVACY_OFFICER_EMAIL}`}>
            {PRIVACY_OFFICER_EMAIL}
          </a>
        </p>
        <p>
          We will receive and investigate privacy complaints and respond
          appropriately. Where applicable, you may also contact the Office of the
          Privacy Commissioner of Canada.
        </p>
      </Section>

      <Section title="2. What We Collect">
        <p>
          Account data: name, email, password hash, organization name and slug,
          role, and your acceptance of the Terms and this policy (including
          version stamps).
        </p>
        <p>
          Customer Data you enter or connect: students, families, enrolments,
          sessions, staff wages, expenses, subscriptions, targets, Advisor chat
          questions and answers, enrolment tactics you log (including the result
          you describe), recommendations and outcomes, and similar operating
          records. That data stays scoped to your organization unless an
          authorized administrator turns on Help Improve Advisor, described below.
        </p>
        <p>
          Technical data needed to run the service: login times, tenant slug, and
          AI usage metering (provider, token counts, cost estimate). We do not
          sell personal information.
        </p>
      </Section>

      <Section title="3. How We Use It and AI Providers">
        <p>
          We use personal information to provide the Service: sign-in, analytics,
          pricing and enrolment guidance, Action Centre, email verification,
          billing, weekly briefs, support, security, and legal obligations.
        </p>
        <p>
          Advisor (the AI advisor feature in the Service; software, not a person)
          prefers Anthropic (Claude) and falls back to OpenAI when Claude is
          unavailable. Advisor does not have unrestricted database access. It is
          designed to send the minimum information reasonably needed for the
          request, generally structured or derived business evidence produced by
          approved analytics tools. Depending on the question, that evidence may
          include business-specific labels already in your records (for example
          programme names, instructor names used in scheduling evidence, or
          tactic notes you logged). We do not use your student, family, or staff
          records, chat content, or other identifiable Customer Data to train
          third-party AI models.
        </p>
        <p>
          <strong>Model training.</strong> Customer API content is not
          intentionally opted in for Anthropic or OpenAI model training. The
          Service uses commercial/API arrangements under which provider
          inputs/outputs are not used for provider model training by default.
        </p>
        <p>
          <strong>Temporary provider retention.</strong> AI providers may retain
          API inputs and outputs for a limited period under their applicable
          commercial or API terms for matters such as abuse prevention, security,
          or legal compliance, unless a stronger approved zero-retention
          configuration applies to our account. We do not promise zero retention
          at the provider solely by using the Service.
        </p>
      </Section>

      <Section title="4. Optional Help Improve Advisor">
        <p>
          Help Improve Advisor is a single optional organization setting (Settings
          → Privacy & Data Learning). It is off by default. Only an organization
          owner or administrator can turn it on, and they must take an explicit
          Turn On action. Accepting the Terms of Service or this Privacy Policy
          does not enable it.
        </p>
        <p>
          While Help Improve Advisor is on, Somtico may use privacy-safe
          information derived from eligible future use of Business Advisor —
          including structured signals from Advisor activity, business metrics,
          programme context, recommendations, owner decisions, actions, measured
          results, and privacy-safe industry intelligence snapshots — to improve
          and evaluate Advisor, analytics, recommendations, playbooks,
          Somtico-owned models, and aggregated industry intelligence. The setting
          applies prospectively while it remains on; Somtico does not ask again
          merely because another privacy-safe signal is later derived for the same
          disclosed purpose.
        </p>
        <p>
          Cross-customer learning is not a dump of your raw tenant database. We
          use privacy-safe extraction and normalization. We do not intentionally
          place into the cross-customer learning corpus: student names; parent or
          guardian names; staff identities where identity is unnecessary; email
          addresses; telephone numbers; street addresses; authentication
          credentials; payment-card information; or unrestricted raw
          source-system records. Where chat activity informs learning, we prefer
          structured privacy-safe signals rather than copying raw conversations
          wholesale. Conversations and records kept for normal product
          functionality inside your organization remain separate from the
          cross-customer learning corpus.
        </p>
        <p>
          We will not provide the improvement corpus to Anthropic, OpenAI, or any
          other third-party AI provider for their own model training. A Somtico
          fine-tuned industry model is not claimed as currently shipped. If a
          contribution has already been incorporated into training of a
          Somtico-owned model in the future, turning the setting off cannot
          retroactively remove that contribution's influence from an
          already-trained model.
        </p>
        <p>
          Turning Help Improve Advisor off takes effect immediately for future
          optional cross-customer contributions. Normal Service operation
          continues. Organizations that remain off may occasionally receive a
          non-blocking invitation to reconsider (at most once every 30 days).
          Choosing "Not now" leaves the setting off and does not grant consent.
          Organizations with the setting on do not receive these invitations.
        </p>
      </Section>

      <Section title="5. Historical Legacy Enrolment Contributions">
        <p>
          An earlier Enrolment Advisor mechanism allowed record-by-record sharing
          into a de-identified table without an organization identifier or
          withdrawal key. Those historical rows retain their original semantics:
          Somtico generally cannot locate and delete them by organization. New
          contributions under Help Improve Advisor use privacy-safe observations
          with purpose-specific withdrawal links and do not extend that legacy
          limitation to new data.
        </p>
      </Section>

      <Section title="6. Sharing and Cross-Border Processing">
        <p>
          We share personal information with processors who help us run the
          Service, including hosting and infrastructure, email delivery, payment
          processing, and AI inference, under contracts that limit their use. We
          may disclose information if required by law or to protect the Service,
          our users, or the public.
        </p>
        <p>
          Some service providers may process or store personal information outside
          Canada. Information processed outside Canada may be subject to the laws
          and lawful access requirements of the jurisdiction where it is
          processed. Somtico remains responsible for personal information under
          its control and uses contractual, technical, and organizational
          safeguards appropriate to the service and information involved.
        </p>
      </Section>

      <Section title="7. Retention, Withdrawal, Access, and Correction">
        <p>
          We keep Customer Data while your organization has an account, and for a
          limited period after termination so you can request an export (see the
          Terms).
        </p>
        <p>
          Turning Help Improve Advisor off stops future optional cross-customer
          contributions. Privacy-safe contributions stored under the current
          architecture that retain a purpose-specific contributor key are deleted
          for those purposes when the setting is turned off. Historical legacy
          Enrolment Advisor rows without a withdrawal key generally cannot be
          deleted by organization, as described above.
        </p>
        <p>
          Subject to applicable law, an individual may request information about
          the personal information Somtico holds about them, access to that
          information, correction of inaccurate information, deletion where
          applicable, and information about relevant uses or disclosures where
          required. Send requests to the Privacy Officer contact above. We may
          decline or limit a request where a legal or technical exception applies,
          and we will explain when we do.
        </p>
      </Section>

      <Section title="8. Children and Student Records">
        <p>
          The Service is for businesses. Children do not create Somtico Business
          Advisor accounts. If your organization stores information about students
          who are minors, you are responsible for ensuring you have lawful
          authority to upload and process that data, including appropriate
          parent or guardian authority where required, and for the accuracy of
          that data.
        </p>
      </Section>

      <Section title="9. Canadian Privacy Law">
        <p>
          We handle personal information in accordance with applicable Canadian
          privacy law, including the Personal Information Protection and
          Electronic Documents Act (PIPEDA) where it applies. Saskatchewan law
          and the courts in Saskatoon govern disputes, as set out in the Terms.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update this policy. Material changes take effect no less than 30
          days after notice. The version identifiers above identify the text
          accepted at signup or through an explicit in-app re-acceptance. Existing
          acceptance records are not rewritten when a new version is published.
          Updating this policy does not by itself turn Help Improve Advisor on.
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
