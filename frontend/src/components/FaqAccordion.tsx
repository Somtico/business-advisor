import type { FaqSection } from '../content/faqs';

export function FaqAccordion({
  sections,
  heading = 'h2',
}: {
  sections: FaqSection[];
  heading?: 'h2' | 'h3';
}) {
  const Heading = heading;
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.title}>
          <Heading className="font-display text-2xl font-bold">
            {section.title}
          </Heading>
          <div className="mt-3 space-y-3">
            {section.items.map((item) => (
              <details
                key={item.q}
                className="group border border-ba-line bg-white"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 text-base font-semibold">
                  {item.q}
                  <span
                    className="text-ba-ink/50 transition-transform group-open:rotate-180"
                    aria-hidden
                  >
                    ▾
                  </span>
                </summary>
                <div className="border-t border-ba-line p-4 text-base text-ba-ink/80">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
