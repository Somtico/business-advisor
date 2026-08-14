import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function OnboardingPage() {
  const { organization, setSession, accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [subtype, setSubtype] = useState(
    organization?.educationSubtype || 'STEM_CODING_ACADEMY'
  );
  const [cash, setCash] = useState('15000');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/app/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          educationSubtype: subtype,
          cashBalanceCents: Math.round(Number(cash) * 100),
        }),
      });
      if (accessToken && user && organization) {
        setSession({
          accessToken,
          user,
          organization: { ...organization, onboardingCompleted: true },
        });
      }
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding failed');
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Centre Setup</h1>
      <p className="mt-2 max-w-2xl text-base text-ba-ink/70">
        Your organization uses the After-School / Tutoring / Enrichment blueprint.
        There is no generic industry selector. Add data progressively — skip what
        you do not have yet.
      </p>
      <form onSubmit={onSubmit} className="mt-8 max-w-lg space-y-4">
        <label className="block text-base font-semibold">
          Education Subtype
          <select
            className="mt-1 w-full cursor-pointer rounded-md border-ba-line text-base"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
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
        <label className="block text-base font-semibold">
          Current Cash Balance (CAD)
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-md border-ba-line text-base"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
        {error && <p className="text-base text-ba-warm">{error}</p>}
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white"
        >
          Continue to Command Centre
        </button>
      </form>
    </div>
  );
}
