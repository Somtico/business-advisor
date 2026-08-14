import { useEffect, useState } from 'react';

/**
 * Staged progress list shown while an analysis request is in flight.
 * Steps advance on a timer for pacing; the caller unmounts this component
 * the moment real results arrive, so it never outlives the actual work.
 */
export function AnalysisProgress({
  steps,
  stepMs = 700,
}: {
  steps: string[];
  stepMs?: number;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setCurrent(0);
    const timer = setInterval(() => {
      setCurrent((i) => (i < steps.length - 1 ? i + 1 : i));
    }, stepMs);
    return () => clearInterval(timer);
  }, [steps, stepMs]);

  return (
    <div className="border border-ba-line bg-white p-5" role="status" aria-live="polite">
      <ul className="space-y-2">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className="flex items-center gap-3 text-base">
              {done && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ba-accent text-white" aria-hidden>
                  ✓
                </span>
              )}
              {active && (
                <span
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ba-accent border-t-transparent"
                  aria-hidden
                />
              )}
              {!done && !active && (
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-ba-line" aria-hidden />
              )}
              <span className={done ? 'text-ba-ink/60' : active ? 'font-semibold' : 'text-ba-ink/40'}>
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Pulsing placeholder card matching the result card layout. */
export function SkeletonCard() {
  return (
    <div className="animate-pulse border border-ba-line bg-white p-5">
      <div className="h-6 w-1/3 rounded bg-ba-mist" />
      <div className="mt-3 h-4 w-2/3 rounded bg-ba-mist" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded border border-ba-line bg-ba-mist/50" />
        ))}
      </div>
    </div>
  );
}
