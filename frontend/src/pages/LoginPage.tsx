import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError, setTenantSlug } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { RequiredMark } from '../lib/forms';

export function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [slug, setSlug] = useState(params.get('slug') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(() => {
    if (params.get('verify') === 'pending') {
      return 'Check your email for a verification link before signing in.';
    }
    if (params.get('billing') === 'success') {
      return 'Payment received. Verify your email if you have not already, then sign in.';
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsVerification(false);
    try {
      setTenantSlug(slug);
      const res = await api<{
        success: boolean;
        data: {
          accessToken: string;
          user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            organizationId: string;
          };
          organization: {
            id: string;
            name: string;
            slug: string;
            status: string;
            onboardingCompleted?: boolean;
          };
        };
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, slug }),
      });
      setSession({
        accessToken: res.data.accessToken,
        user: res.data.user,
        organization: res.data.organization,
      });
      navigate(
        res.data.organization.onboardingCompleted ? '/app' : '/app/onboarding'
      );
    } catch (err) {
      if (err instanceof ApiError && err.requiresVerification) {
        setNeedsVerification(true);
        if (err.email) setEmail(err.email);
      }
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onResendVerification() {
    if (!email || !slug) {
      setError('Enter your organization slug and email to resend verification.');
      return;
    }
    setResending(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; message?: string }>(
        '/api/auth/resend-verification',
        {
          method: 'POST',
          body: JSON.stringify({ email, slug }),
        }
      );
      setInfo(res.message || 'Verification email sent if an account matches.');
      setNeedsVerification(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend email');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md border border-ba-line bg-white p-8"
      >
        <h1 className="font-display text-3xl font-bold">Business Advisor</h1>
        <p className="mt-2 text-base text-ba-ink/70">
          Sign in to your after-school command centre.
        </p>
        <label className="mt-6 block text-base font-semibold">
          Organization Slug
          <RequiredMark />
          <input
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            autoComplete="organization"
          />
        </label>
        <label className="mt-4 block text-base font-semibold">
          Email
          <RequiredMark />
          <input
            type="email"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className="mt-4 block text-base font-semibold">
          Password
          <RequiredMark />
          <PasswordField
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            showPassword={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
          />
        </label>
        {info && <p className="mt-3 text-base text-ba-accent">{info}</p>}
        {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
        {needsVerification && (
          <button
            type="button"
            onClick={onResendVerification}
            disabled={resending}
            className="mt-3 w-full cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base font-semibold text-ba-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? 'Sending…' : 'Resend Verification Email'}
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing In…' : 'Sign In'}
        </button>
        <p className="mt-4 text-base">
          New centre?{' '}
          <Link className="text-ba-accent underline" to="/signup">
            Create Organization
          </Link>
        </p>
      </form>
    </div>
  );
}
