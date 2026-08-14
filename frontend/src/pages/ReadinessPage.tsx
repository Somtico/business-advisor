import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Item {
  id: string;
  datasetKey: string;
  label: string;
  status: string;
  whyItMatters: string;
  exampleInsight: string | null;
  priority: number;
}

export function ReadinessPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api<{ success: boolean; data: { items: Item[] } }>(
      '/api/app/readiness'
    );
    setItems(res.data.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function mark(datasetKey: string, status: string) {
    await api(`/api/app/readiness/${datasetKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (error) return <p className="text-base text-ba-warm">{error}</p>;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Data Readiness Centre</h1>
      <p className="mt-2 max-w-2xl text-base text-ba-ink/70">
        Shows what the system knows, what is missing, and why each dataset
        matters. Skip what you do not collect yet.
      </p>
      <div className="mt-8 space-y-4">
        {items.map((item) => (
          <article key={item.id} className="border border-ba-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{item.label}</h2>
                <p className="mt-1 text-base text-ba-ink/70">{item.whyItMatters}</p>
                {item.exampleInsight && (
                  <p className="mt-2 text-base italic text-ba-ink/60">
                    Example: {item.exampleInsight}
                  </p>
                )}
              </div>
              <span className="rounded bg-ba-mist px-3 py-1 text-base font-semibold">
                {item.status.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['NOT_APPLICABLE', 'MISSING', 'MANUAL'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => mark(item.datasetKey, s)}
                  className="cursor-pointer rounded border border-ba-line px-3 py-2 text-base hover:bg-ba-mist"
                >
                  Mark {s.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
