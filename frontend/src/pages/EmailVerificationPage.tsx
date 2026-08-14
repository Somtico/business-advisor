import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, ApiError } from '../lib/api';

type Status = 'verifying' | 'success' | 'error';

/**
 * Verifies once per token per browser session (StrictMode / remount safe).
 */
export function EmailVerificationPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('Verifying your email…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    const ssKey = `ba_ev:${token}`;
    if (sessionStorage.getItem(ssKey) === 'done') {
      setStatus('success');
      setMessage('Your email has already been verified. You can now sign in.');
      return;
    }

    (async () => {
      try {
        const res = await api<{ success: boolean; message?: string }>(
          '/api/auth/verify-email',
          {
            method: 'POST',
            body: JSON.stringify({ token }),
          }
        );
        sessionStorage.setItem(ssKey, 'done');
        setStatus('success');
        setMessage(
          res.message ||
            'Your email has been verified. You can now sign in.'
        );
      } catch (err) {
        if (err instanceof ApiError && err.code === 'TOKEN_ALREADY_USED') {
          setStatus('error');
          setMessage(
            'This verification link has already been used. Request a new one from the sign-in page if needed.'
          );
          return;
        }
        const msg = err instanceof Error ? err.message : '';
        if (/already been verified|already verified/i.test(msg)) {
          sessionStorage.setItem(ssKey, 'done');
          setStatus('success');
          setMessage('Your email has already been verified. You can now sign in.');
          return;
        }
        setStatus('error');
        setMessage(msg || 'Email verification failed. Please try again.');
      }
    })();
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4">
      <div className="w-full max-w-md border border-ba-line bg-white p-8 text-center">
        <h1 className="font-display text-3xl font-bold">Email Verification</h1>
        <p
          className={`mt-4 text-base ${
            status === 'error' ? 'text-ba-warm' : 'text-ba-ink/80'
          }`}
        >
          {message}
        </p>
        {status !== 'verifying' && (
          <Link
            className="mt-6 inline-block cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white"
            to="/login"
          >
            Go to Sign In
          </Link>
        )}
      </div>
    </div>
  );
}
