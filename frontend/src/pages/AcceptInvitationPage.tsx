import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { PasswordField } from '../components/PasswordField';
import { PublicShell } from '../components/PublicShell';
import { RequiredMark } from '../lib/forms';
import { ROLE_LABELS } from '../lib/workspace';
import { useAuth } from '../context/AuthContext';

type Peek = {
  email: string;
  role: string;
  organizationName: string;
  accountExists: boolean;
};

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This invitation link is missing a token.');
      return;
    }
    api<{ success: boolean; data: Peek }>(
      `/api/auth/invitations/peek?token=${encodeURIComponent(token)}`
    )
      .then((res) => setPeek(res.data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Invitation is invalid')
      );
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: peek?.accountExists && accessToken ? undefined : password,
          firstName: peek?.accountExists ? undefined : firstName,
          lastName: peek?.accountExists ? undefined : lastName,
        }),
      });
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invitation');
    } finally {
      setLoading(false);
    }
  }

  const signedInAsInvitee =
    Boolean(accessToken && user && peek && user.email === peek.email);

  return (
    <PublicShell compact>
      <div className="flex items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4 py-12">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md border border-ba-line bg-white p-8"
        >
          <h1 className="font-display text-3xl font-bold">Accept Invitation</h1>
          {peek && (
            <p className="mt-4 text-base text-ba-ink/80">
              Join <strong>{peek.organizationName}</strong> as{' '}
              {ROLE_LABELS[peek.role] || peek.role}.
            </p>
          )}
          {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
          {peek && !peek.accountExists && (
            <>
              <label className="mt-4 block text-base font-semibold">
                First Name
                <RequiredMark />
                <input
                  className="mt-1 w-full rounded-md border-ba-line text-base"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </label>
              <label className="mt-4 block text-base font-semibold">
                Last Name
                <RequiredMark />
                <input
                  className="mt-1 w-full rounded-md border-ba-line text-base"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </label>
              <label className="mt-4 block text-base font-semibold">
                Password
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
            </>
          )}
          {peek?.accountExists && !signedInAsInvitee && (
            <>
              <p className="mt-4 text-base text-ba-ink/80">
                An account already exists for {peek.email}. Enter your password
                to join this organization.
              </p>
              <label className="mt-4 block text-base font-semibold">
                Password
                <RequiredMark />
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  required
                  autoComplete="current-password"
                  showPassword={show}
                  onToggleShow={() => setShow((v) => !v)}
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={loading || !peek}
            className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Joining…' : 'Accept Invitation'}
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
