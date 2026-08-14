import { useCallback, useEffect, useId, useState } from 'react';

export type ScreenshotItem = {
  src: string;
  alt: string;
  caption: string;
};

export function ScreenshotGallery({
  screenshots,
}: {
  screenshots: readonly ScreenshotItem[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const titleId = useId();
  const active = activeIndex != null ? screenshots[activeIndex] : null;

  const close = useCallback(() => setActiveIndex(null), []);

  useEffect(() => {
    if (activeIndex == null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((i) => (i == null ? i : (i + 1) % screenshots.length));
      }
      if (event.key === 'ArrowLeft') {
        setActiveIndex((i) =>
          i == null ? i : (i - 1 + screenshots.length) % screenshots.length
        );
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, close, screenshots.length]);

  return (
    <>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {screenshots.map((shot, index) => (
          <figure
            key={shot.src}
            className={`overflow-hidden border border-ba-line bg-white shadow-sm ${
              index === 0 ? 'lg:col-span-2' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveIndex(index)}
              className="group relative block w-full cursor-pointer text-left"
              aria-label={`View full size: ${shot.caption}`}
            >
              <img
                src={shot.src}
                alt={shot.alt}
                width={1440}
                height={900}
                className="h-auto w-full transition-opacity group-hover:opacity-95"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 py-3 text-base font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                Click to Expand
              </span>
            </button>
            <figcaption className="border-t border-ba-line px-5 py-4 text-base text-ba-ink/70">
              {shot.caption}
            </figcaption>
          </figure>
        ))}
      </div>

      {active && activeIndex != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 z-[101] inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-ba-ink shadow-lg hover:bg-ba-mist sm:right-6 sm:top-6"
            aria-label="Close full-size screenshot"
          >
            ×
          </button>
          <div
            className="relative flex max-h-full max-w-6xl flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <p id={titleId} className="sr-only">
              {active.caption}
            </p>
            <img
              src={active.src}
              alt={active.alt}
              width={1440}
              height={900}
              className="h-auto max-h-[calc(100vh-7rem)] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
            <p className="mt-3 text-center text-base text-white">
              {active.caption}
            </p>
            {screenshots.length > 1 && (
              <p className="mt-1 text-center text-sm text-white/70">
                {activeIndex + 1} of {screenshots.length} · Use arrow keys to
                browse
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
