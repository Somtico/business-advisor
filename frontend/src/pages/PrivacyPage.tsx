import { Link } from 'react-router';
import { PublicShell } from '../components/PublicShell';

export const PRIVACY_VERSION = '2026-08-14';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
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

export function PrivacyPage() {
  return (
    <PublicShell compact>
      <div className="bg-ba-surface px-4 py-10">
        <div className="mx-auto max-w-3xl border border-ba-line bg-white p-8 md:p-10">
          <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-2 text-base text-ba-ink/70">
            Business Advisor, operated by Somtico Technologies Inc. (Somtico
            Tech)
          </p>
          <p className="mt-1 text-base text-ba-ink/70">
            Version {PRIVACY_VERSION} · Effective 14 August 2026
          </p>
          <p className="mt-4 text-base text-ba-ink/80">
            This policy explains how we handle personal information. It is
            separate from the{' '}
            <Link className="text-ba-accent underline" to="/terms">
              Terms of Service
            </Link>
            , which cover the contract for using the product. This text is a
            template pending lawyer review; it is not legal advice.
          </p>

          <Section title="1. Who We Are">
            <p>
              Somtico Technologies Inc., Saskatoon, Saskatchewan, Canada,
              provides Business Advisor. Questions about privacy can be sent
              through your account support channel or the contact address on{' '}
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
              Account data: name, email, password hash, organization name and
              slug, role, and your acceptance of the Terms and this policy.
            </p>
            <p>
              Customer Data you enter or connect: students, families, enrolments,
              sessions, staff wages, expenses, subscriptions, targets, chat
              questions, enrolment tactics you log (including the result you
              describe), and similar operating records. That data stays scoped
              to your organization.
            </p>
            <p>
              Technical data needed to run the service: login times, tenant
              slug, and AI usage metering (provider, token counts, cost
              estimate). We do not sell personal information.
            </p>
          </Section>

          <Section title="3. How We Use It">
            <p>
              We use personal information to provide the Service: sign-in,
              analytics, pricing and enrolment guidance, Action Centre,
              email verification, billing, weekly briefs, and support. We use
              it to keep the product secure and to meet legal obligations.
            </p>
            <p>
              We do not use your student, family, or staff records to train
              third-party AI models. When Nonso calls an AI provider, it sends
              aggregated evidence from our analytics tools for that question,
              with provider training and storage opted out where the provider
              offers that control.
            </p>
          </Section>

          <Section title="4. Optional De-Identified Tactic Outcomes">
            <p>
              On Enrolment Advisor you may opt in, record by record, to share a
              de-identified copy of a tactic outcome. If you opt in, we store
              only: tactic type (for example, family referral), cost band (free /
              low / paid), outcome (helped / no effect / hurt), the leak type
              at that moment (for example, conversion leak), and a coarse
              education bucket (STEM, tutoring, or other enrichment).
            </p>
            <p>
              We do not copy your notes, student or family names, organization
              id, location, or email into that table. Those rows are not tied
              back to your account. We use them only as counts in the playbook
              (shown only after at least eight similar reports) so Nonso can
              see which cheap tactics other centres marked as helpful for the
              same leak. That is a deterministic aggregate, not training data
              for OpenAI, Anthropic, Gemini, or any other model provider.
            </p>
            <p>
              Opt-in is off by default. Removing a tactic from your
              organization log does not delete a de-identified row already
              contributed, because it no longer identifies you. Do not put
              names in the result field.
            </p>
          </Section>

          <Section title="5. Sharing">
            <p>
              We share personal information with processors who help us run the
              Service (hosting, email, payments, AI inference), under contracts
              that limit their use. We may disclose information if required by
              law or to protect the Service, our users, or the public.
            </p>
          </Section>

          <Section title="6. Retention and Your Choices">
            <p>
              We keep Customer Data while your organization has an account, and
              for a limited period after termination so you can request an
              export (see the Terms). You may correct account details in the
              app, delete tactic notes you logged, and ask us to export or
              delete personal information we hold, subject to legal holds.
            </p>
          </Section>

          <Section title="7. Children">
            <p>
              The Service is for businesses, not for children to use directly.
              If you store information about students who are minors, you are
              responsible for having the authority to do so and for the
              accuracy of that data.
            </p>
          </Section>

          <Section title="8. Canadian Privacy Law">
            <p>
              We handle personal information in accordance with applicable
              Canadian privacy law, including the Personal Information
              Protection and Electronic Documents Act (PIPEDA) where it
              applies. Saskatchewan law and the courts in Saskatoon govern
              disputes, as set out in the Terms.
            </p>
          </Section>

          <Section title="9. Changes">
            <p>
              We may update this policy. Material changes take effect no less
              than 30 days after notice. The version date above identifies the
              text you accepted at signup.
            </p>
          </Section>

          <p className="mt-10 text-base">
            <Link className="text-ba-accent underline" to="/">
              Home
            </Link>{' '}
            ·{' '}
            <Link className="text-ba-accent underline" to="/terms">
              Terms of Service
            </Link>{' '}
            ·{' '}
            <Link className="text-ba-accent underline" to="/signup">
              Signup
            </Link>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
