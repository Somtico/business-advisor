import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { LegalAcceptScroll } from '../components/LegalAcceptScroll';
import { PasswordField } from '../components/PasswordField';
import { AuthSplitLayout } from '../components/AuthSplitLayout';
import {
  EDUCATION_SUBTYPE_OPTIONS,
  RequiredMark,
  slugifyOrganizationName,
} from '../lib/forms';

const ROOT_DOMAIN =
  import.meta.env.VITE_ROOT_DOMAIN || 'businessadvisor.app';

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organizationName: '',
    slug: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    educationSubtype: 'STEM_ACADEMY',
    educationSubtypeOther: '',
  });
  const [slugManual, setSlugManual] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateOrganizationName(value: string) {
    setForm((prev) => ({
      ...prev,
      organizationName: value,
      slug: slugManual ? prev.slug : slugifyOrganizationName(value),
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      setError(
        'You must scroll through and agree to the Terms of Service and Privacy Policy to continue.'
      );
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.educationSubtype === 'OTHER' && !form.educationSubtypeOther.trim()) {
      setError('Please describe your education subtype when selecting Other.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { confirmPassword: _confirm, ...payload } = form;
      void _confirm;
      const res = await api<{
        success: boolean;
        data: {
          organization: { slug: string };
          checkout: { url: string | null; simulated?: boolean };
          verification?: { autoVerified?: boolean; sent?: boolean; dryRun?: boolean };
        };
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...payload, termsAccepted, privacyAccepted: termsAccepted }),
      });
      if (res.data.checkout.url) {
        window.location.href = res.data.checkout.url;
        return;
      }
      const verifyNote = res.data.verification?.autoVerified
        ? ' You can sign in now.'
        : ' Check your email for a verification link before signing in.';
      setMessage(
        (res.data.checkout.simulated
          ? 'Organization created and pilot plan activated (Stripe not configured).'
          : 'Organization created.') + verifyNote
      );
      navigate(
        `/login?verify=${
          res.data.verification?.autoVerified ? 'done' : 'pending'
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout wide>
      <form onSubmit={onSubmit} className="w-full">
        <h1 className="font-display text-3xl font-bold">Create Organization</h1>
        <p className="mt-2 text-base text-ba-ink/70">
          After-school / tutoring / enrichment blueprint is applied automatically.
          Pilot plan: $5 CAD / month.
        </p>

        <label className="mt-4 block text-base font-semibold">
          Business / Organization Name
          <RequiredMark />
          <input
            type="text"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={form.organizationName}
            onChange={(e) => updateOrganizationName(e.target.value)}
            required
            autoComplete="organization"
          />
        </label>

        <label className="mt-4 block text-base font-semibold">
          Workspace Address
          <RequiredMark />
          <input
            type="text"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={form.slug}
            onChange={(e) => {
              setSlugManual(true);
              setForm({ ...form, slug: e.target.value.toLowerCase() });
            }}
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="Lowercase letters, numbers, and hyphens only"
            autoComplete="off"
          />
          <span className="mt-1 block text-base font-normal text-ba-ink/70">
            Your unique workspace address is{' '}
            <span className="font-semibold text-ba-ink">
              {form.slug || 'your-centre'}.{ROOT_DOMAIN}
            </span>
            . Filled from your business name; you can edit it before creating
            the account.
          </span>
        </label>

        <label className="mt-4 block text-base font-semibold">
          First Name
          <RequiredMark />
          <input
            type="text"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            required
            autoComplete="given-name"
          />
        </label>

        <label className="mt-4 block text-base font-semibold">
          Last Name
          <RequiredMark />
          <input
            type="text"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            required
            autoComplete="family-name"
          />
        </label>

        <label className="mt-4 block text-base font-semibold">
          Owner Email
          <RequiredMark />
          <input
            type="email"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            autoComplete="email"
          />
        </label>

        <label className="mt-4 block text-base font-semibold">
          Password
          <RequiredMark />
          <PasswordField
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            required
            autoComplete="new-password"
            showPassword={showPasswords}
            onToggleShow={() => setShowPasswords((v) => !v)}
          />
        </label>

        <label className="mt-4 block text-base font-semibold">
          Confirm Password
          <RequiredMark />
          <PasswordField
            value={form.confirmPassword}
            onChange={(confirmPassword) =>
              setForm({ ...form, confirmPassword })
            }
            required
            autoComplete="new-password"
            showPassword={showPasswords}
            onToggleShow={() => setShowPasswords((v) => !v)}
          />
        </label>

        <label className="mt-4 block text-base font-semibold">
          Education Subtype
          <RequiredMark />
          <select
            className="mt-1 w-full cursor-pointer rounded-md border-ba-line text-base"
            value={form.educationSubtype}
            onChange={(e) =>
              setForm({ ...form, educationSubtype: e.target.value })
            }
            required
          >
            {EDUCATION_SUBTYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {form.educationSubtype === 'OTHER' && (
          <label className="mt-4 block text-base font-semibold">
            Describe Your Subtype
            <RequiredMark />
            <input
              type="text"
              className="mt-1 w-full rounded-md border-ba-line text-base"
              value={form.educationSubtypeOther}
              onChange={(e) =>
                setForm({ ...form, educationSubtypeOther: e.target.value })
              }
              required
              placeholder="e.g. Chess academy, debate club"
              maxLength={120}
            />
          </label>
        )}

        <LegalAcceptScroll
          accepted={termsAccepted}
          onAcceptedChange={setTermsAccepted}
        />
        {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
        {message && <p className="mt-3 text-base text-ba-accent">{message}</p>}
        <button
          type="submit"
          disabled={loading || !termsAccepted}
          className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create and Start Pilot'}
        </button>
        <p className="mt-4 text-base">
          Already have an account?{' '}
          <Link className="text-ba-accent underline" to="/login">
            Sign In
          </Link>
          {' · '}
          <Link className="text-ba-accent underline" to="/">
            Back to Home
          </Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
