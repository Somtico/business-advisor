import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { parseDollarInputToCents } from '../lib/parseMoney';
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
  const [cash, setCash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const currency = organization?.currency || 'CAD';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subtype) {
      setError('Please choose what type of education business you run.');
      return;
    }
    if (subtype === 'OTHER' && !subtypeOther.trim()) {
      setError('Please describe your education subtype when selecting Other.');
      return;
    }
    let cashBalanceCents: number | undefined;
    try {
      const parsed = parseDollarInputToCents(cash);
      cashBalanceCents = parsed === null ? undefined : parsed;
    } catch {
      setError('Enter a cash amount such as 15000, or leave the field blank.');
      return;
    }
    try {
      const body: {
        educationSubtype: string;
        educationSubtypeOther: string | null;
        cashBalanceCents?: number;
      } = {
        educationSubtype: subtype,
        educationSubtypeOther: subtype === 'OTHER' ? subtypeOther.trim() : null,
      };
      if (cashBalanceCents !== undefined) {
        body.cashBalanceCents = cashBalanceCents;
      }
      await api('/api/app/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(body),
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
        Your workspace is tailored for after-school, tutoring, and enrichment
        businesses. Add what you know today—you can complete or update the rest
        later. Advisor will use this information to give you more relevant
        guidance.
      </p>
      <form onSubmit={onSubmit} className="mt-8 max-w-lg space-y-4">
        <label className="block text-base font-semibold">
          What Type of Education Business Do You Run?
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
        <div>
          <label className="block text-base font-semibold">
            Current Business Cash Balance ({currency}) — Optional
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="mt-1 w-full rounded-md border-ba-line text-base"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="e.g. 15000"
            />
          </label>
          <p className="mt-1 text-base text-ba-ink/70">
            Approximately how much cash does the business currently have
            across its bank accounts? Include funds already deposited, even if
            borrowed or set aside for a specific purpose. Do not include unused
            credit cards, lines of credit, overdraft limits, or other borrowing
            capacity.
          </p>
        </div>
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
