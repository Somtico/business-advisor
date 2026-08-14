import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organizationName: '',
    slug: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    educationSubtype: 'STEM_CODING_ACADEMY',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{
        success: boolean;
        data: {
          organization: { slug: string };
          checkout: { url: string | null; simulated?: boolean };
        };
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (res.data.checkout.url) {
        window.location.href = res.data.checkout.url;
        return;
      }
      setMessage(
        res.data.checkout.simulated
          ? 'Organization created and pilot plan activated (Stripe not configured).'
          : 'Organization created.'
      );
      navigate(`/login?slug=${res.data.organization.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl border border-ba-line bg-white p-8"
      >
        <h1 className="font-display text-3xl font-bold">Create Organization</h1>
        <p className="mt-2 text-base text-ba-ink/70">
          After-school / tutoring / enrichment blueprint is applied automatically.
          Pilot plan: $5 CAD / month.
        </p>
        {(
          [
            ['organizationName', 'Organization Name'],
            ['slug', 'Slug'],
            ['firstName', 'First Name'],
            ['lastName', 'Last Name'],
            ['email', 'Owner Email'],
            ['password', 'Password'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="mt-4 block text-base font-semibold">
            {label}
            <input
              type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
              className="mt-1 w-full rounded-md border-ba-line text-base"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required
            />
          </label>
        ))}
        <label className="mt-4 block text-base font-semibold">
          Education Subtype
          <select
            className="mt-1 w-full cursor-pointer rounded-md border-ba-line text-base"
            value={form.educationSubtype}
            onChange={(e) =>
              setForm({ ...form, educationSubtype: e.target.value })
            }
          >
            <option value="STEM_CODING_ACADEMY">STEM / Coding Academy</option>
            <option value="TUTORING_CENTRE">Tutoring Centre</option>
            <option value="MUSIC_ART_SCHOOL">Music / Art School</option>
            <option value="LANGUAGE_SCHOOL">Language School</option>
            <option value="SPORTS_SKILLS_ACADEMY">Sports / Skills Academy</option>
            <option value="CAMP_ENRICHMENT">Camp / Enrichment Provider</option>
            <option value="MIXED_PROGRAMME_CENTRE">Mixed Programme Centre</option>
          </select>
        </label>
        {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
        {message && <p className="mt-3 text-base text-ba-accent">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create and Start Pilot'}
        </button>
        <p className="mt-4 text-base">
          Already have an account?{' '}
          <Link className="text-ba-accent underline" to="/login">
            Sign In
          </Link>
        </p>
      </form>
    </div>
  );
}
