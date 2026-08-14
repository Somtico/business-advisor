import { FormEvent, useState } from 'react';
import { api } from '../lib/api';

export function AdvisorPage() {
  const [question, setQuestion] = useState(
    'Are we on track for our student target, and where can we save labour this week?'
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{
        success: boolean;
        data: {
          answer: string;
          conversationId: string;
          toolsUsed: string[];
          provider: string;
          model: string;
        };
      }>('/api/app/advisor/ask', {
        method: 'POST',
        body: JSON.stringify({ question, conversationId }),
      });
      setAnswer(res.data.answer);
      setConversationId(res.data.conversationId);
      setMeta(
        `${res.data.provider}/${res.data.model} · tools: ${res.data.toolsUsed.join(', ')}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advisor failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">AI Advisor</h1>
      <p className="mt-2 max-w-2xl text-base text-ba-ink/70">
        Answers are grounded in trusted analytics tools — not free-form database
        access. Auto mode only in Phase 1.
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
          {loading ? 'Thinking…' : 'Ask Advisor'}
        </button>
      </form>
      {error && <p className="mt-4 text-base text-ba-warm">{error}</p>}
      {meta && <p className="mt-4 text-base text-ba-ink/60">{meta}</p>}
      {answer && (
        <div className="mt-4 whitespace-pre-wrap border border-ba-line bg-white p-5 text-base">
          {answer}
        </div>
      )}
    </div>
  );
}
