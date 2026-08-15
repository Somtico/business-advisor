import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { AnalysisProgress } from '../components/AnalysisProgress';

const CHUK_ANALYSIS_STEPS = [
  'Reading your question',
  'Selecting the right analytics tools',
  'Gathering evidence from your records',
  'Chuk is reasoning over the evidence',
  'Writing a grounded answer',
];

export function AdvisorPage() {
  const [question, setQuestion] = useState(
    'Are we on track for our student target, and where can we save labour this week?'
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [showTrack, setShowTrack] = useState(false);
  const [trackTitle, setTrackTitle] = useState('');
  const [trackDescription, setTrackDescription] = useState('');
  const [trackAmount, setTrackAmount] = useState('');
  const [trackType, setTrackType] = useState<'SAVINGS' | 'REVENUE'>('SAVINGS');
  const [trackSaving, setTrackSaving] = useState(false);
  const [trackMsg, setTrackMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowTrack(false);
    setTrackMsg(null);
    try {
      const res = await api<{
        success: boolean;
        data: {
          answer: string;
          conversationId: string;
          toolsUsed: string[];
          provider: string;
          model: string;
          disclaimer?: string;
        };
      }>('/api/app/advisor/ask', {
        method: 'POST',
        body: JSON.stringify({ question, conversationId }),
      });
      setAnswer(res.data.answer);
      setConversationId(res.data.conversationId);
      setDisclaimer(res.data.disclaimer || null);
      setMeta(
        `${res.data.provider}/${res.data.model} · tools: ${res.data.toolsUsed.join(', ')}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advisor failed');
    } finally {
      setLoading(false);
    }
  }

  function openTrackForm() {
    setTrackTitle(question.trim().slice(0, 200));
    setTrackDescription((answer || '').trim().slice(0, 2000));
    setTrackAmount('');
    setTrackType('SAVINGS');
    setShowTrack(true);
    setTrackMsg(null);
  }

  async function submitTrack(e: FormEvent) {
    e.preventDefault();
    const amount = trackAmount.trim();
    const cents = amount ? Math.round(Number(amount) * 100) : null;
    if (amount && (!Number.isFinite(cents) || (cents as number) < 0)) {
      setError('Enter a valid dollar amount or leave it blank');
      return;
    }
    setTrackSaving(true);
    setError(null);
    try {
      await api('/api/app/advisor/track-action', {
        method: 'POST',
        body: JSON.stringify({
          conversationId,
          title: trackTitle,
          description: trackDescription,
          expectedImpactCents: cents,
          impactType: amount ? trackType : undefined,
        }),
      });
      setShowTrack(false);
      setTrackMsg('Tracked. Follow it through in the Action Centre to build your verified impact.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not track action');
    } finally {
      setTrackSaving(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Ask Chuk</h1>
      <p className="mt-2 max-w-2xl text-base text-ba-ink/70">
        Every answer is grounded in trusted
        analytics tools reading your own records — never free-form database
        access, never guesses. When data is missing, Chuk asks for it.{' '}
        <Link className="text-ba-accent underline" to="/app/help">
          Meet Chuk
        </Link>
      </p>
      <form onSubmit={onSubmit} className="mt-8">
        <textarea
          className="w-full rounded-md border-ba-line text-base"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-3 cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Chuk Is Thinking…' : 'Ask Chuk'}
        </button>
      </form>
      {error && !loading && <p className="mt-4 text-base text-ba-warm">{error}</p>}
      {loading && (
        <div className="mt-4">
          <p className="mb-3 text-base font-semibold">Chuk is analysing your records…</p>
          <AnalysisProgress steps={CHUK_ANALYSIS_STEPS} stepMs={900} />
        </div>
      )}
      {meta && !loading && <p className="mt-4 text-base text-ba-ink/60">{meta}</p>}
      {answer && !loading && (
        <div className="mt-4 whitespace-pre-wrap border border-ba-line bg-white p-5 text-base">
          {answer}
        </div>
      )}
      {answer && disclaimer && !loading && (
        <p className="mt-2 max-w-3xl text-sm text-ba-ink/60">{disclaimer}</p>
      )}
      {answer && !showTrack && !loading && (
        <button
          type="button"
          onClick={openTrackForm}
          className="mt-4 cursor-pointer rounded-md border border-ba-line px-4 py-2 text-base font-semibold hover:bg-ba-mist"
        >
          Track This as an Action
        </button>
      )}
      {trackMsg && !loading && (
        <p className="mt-4 text-base text-ba-accent">
          {trackMsg}{' '}
          <Link className="underline" to="/app/actions">
            Open Action Centre
          </Link>
        </p>
      )}
      {showTrack && (
        <form
          onSubmit={submitTrack}
          className="mt-4 border border-ba-line bg-white p-5"
        >
          <h2 className="text-xl font-semibold">Track This as an Action</h2>
          <p className="mt-1 text-base text-ba-ink/70">
            Completed actions feed your verified impact ledger. Add an estimate if
            you have one; you'll confirm the real result after you act on it.
          </p>
          <label className="mt-4 block text-base">
            <span className="mb-1 block font-semibold">Title</span>
            <input
              type="text"
              value={trackTitle}
              onChange={(e) => setTrackTitle(e.target.value)}
              maxLength={200}
              required
              className="w-full rounded-md border-ba-line text-base"
            />
          </label>
          <label className="mt-3 block text-base">
            <span className="mb-1 block font-semibold">What You'll Do</span>
            <textarea
              value={trackDescription}
              onChange={(e) => setTrackDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              required
              className="w-full rounded-md border-ba-line text-base"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-base">
              <span className="mb-1 block font-semibold">
                Expected Impact (CAD, Optional)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={trackAmount}
                onChange={(e) => setTrackAmount(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-44 rounded-md border-ba-line text-base"
              />
            </label>
            <label className="text-base">
              <span className="mb-1 block font-semibold">Type</span>
              <select
                value={trackType}
                onChange={(e) =>
                  setTrackType(e.target.value as 'SAVINGS' | 'REVENUE')
                }
                className="rounded-md border-ba-line text-base"
              >
                <option value="SAVINGS">Money Saved</option>
                <option value="REVENUE">Money Earned</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={trackSaving}
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {trackSaving ? 'Saving…' : 'Track Action'}
            </button>
            <button
              type="button"
              disabled={trackSaving}
              onClick={() => setShowTrack(false)}
              className="cursor-pointer rounded-md px-4 py-2 text-base text-ba-ink/70 hover:bg-ba-mist disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
