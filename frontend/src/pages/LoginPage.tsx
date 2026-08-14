import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, setTenantSlug } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [slug, setSlug] = useState(params.get('slug') || 'stem-lantern');
  const [email, setEmail] = useState('owner@stemlantern.local');
  const [password, setPassword] = useState('StemLantern123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
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
          <input
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-base font-semibold">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-base font-semibold">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
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
