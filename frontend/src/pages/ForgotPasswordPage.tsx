import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { PublicShell } from '../components/PublicShell';
import { RequiredMark } from '../lib/forms';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      navigate('/login?reset=sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell compact>
      <div className="flex items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4 py-12">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md border border-ba-line bg-white p-8"
        >
          <h1 className="font-display text-3xl font-bold">Forgot Password</h1>
          <p className="mt-2 text-base text-ba-ink/70">
            Enter your email and we will send a reset link if an account matches.
          </p>
          <label className="mt-6 block text-base font-semibold">
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
          {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
          <p className="mt-4 text-base">
            <Link className="text-ba-accent underline" to="/login">
              Back to Sign In
            </Link>
          </p>
        </form>
      </div>
    </PublicShell>
  );
}
