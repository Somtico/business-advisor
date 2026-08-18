import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { PasswordField } from '../components/PasswordField';
import { PublicShell } from '../components/PublicShell';
import { RequiredMark } from '../lib/forms';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
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
          <h1 className="font-display text-3xl font-bold">Reset Password</h1>
          {!token && (
            <p className="mt-4 text-base text-ba-warm">
              This reset link is missing. Request a new one from Sign In.
            </p>
          )}
          <label className="mt-6 block text-base font-semibold">
            New Password
            <RequiredMark />
            <PasswordField
              value={password}
              onChange={setPassword}
              required
              autoComplete="new-password"
              showPassword={show}
              onToggleShow={() => setShow((v) => !v)}
            />
          </label>
          <label className="mt-4 block text-base font-semibold">
            Confirm Password
            <RequiredMark />
            <PasswordField
              value={confirm}
              onChange={setConfirm}
              required
              autoComplete="new-password"
              showPassword={show}
              onToggleShow={() => setShow((v) => !v)}
            />
          </label>
          {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Save Password'}
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
