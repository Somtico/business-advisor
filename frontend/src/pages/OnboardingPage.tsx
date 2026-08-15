import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  EDUCATION_SUBTYPE_OPTIONS,
  RequiredMark,
} from '../lib/forms';

export function OnboardingPage() {
  const { organization, setSession, accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [subtype, setSubtype] = useState(
    organization?.educationSubtype || 'STEM_ACADEMY'
  );
  const [subtypeOther, setSubtypeOther] = useState('');
  const [cash, setCash] = useState('15000');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (subtype === 'OTHER' && !subtypeOther.trim()) {
      setError('Please describe your education subtype when selecting Other.');
      return;
    }
    try {
      await api('/api/app/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          educationSubtype: subtype,
          educationSubtypeOther:
            subtype === 'OTHER' ? subtypeOther.trim() : null,
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
        you do not have yet. Chuk, the AI advisor in this product, will use
        these records. It is software, not a person.
      </p>
      <form onSubmit={onSubmit} className="mt-8 max-w-lg space-y-4">
        <label className="block text-base font-semibold">
          Education Subtype
          <RequiredMark />
          <select
            className="mt-1 w-full cursor-pointer rounded-md border-ba-line text-base"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
            required
          >
            {EDUCATION_SUBTYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {subtype === 'OTHER' && (
          <label className="block text-base font-semibold">
            Describe Your Subtype
            <RequiredMark />
            <input
              type="text"
              className="mt-1 w-full rounded-md border-ba-line text-base"
              value={subtypeOther}
              onChange={(e) => setSubtypeOther(e.target.value)}
              required
              placeholder="e.g. Chess academy, debate club"
              maxLength={120}
            />
          </label>
        )}
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
