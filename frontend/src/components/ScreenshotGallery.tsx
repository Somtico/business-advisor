import { useCallback, useEffect, useId, useState } from 'react';
import {
  SCREENSHOT_DEVICE_LABELS,
  SCREENSHOT_DEVICES,
  SCREENSHOT_SIZES,
  screenshotDeviceFromWidth,
  screenshotFrameClass,
  type ScreenshotDevice,
  type ScreenshotItem,
} from '../lib/screenshotDevices';

export type { ScreenshotItem };

function DeviceTabs({
  device,
  onChange,
}: {
  device: ScreenshotDevice;
  onChange: (next: ScreenshotDevice) => void;
}) {
  return (
    <div
      className="mt-8 flex flex-wrap gap-2"
      role="tablist"
      aria-label="Screenshot device size"
    >
      {SCREENSHOT_DEVICES.map((item) => {
        const selected = item === device;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item)}
            className={`cursor-pointer rounded-md px-4 py-2 text-base font-semibold ${
              selected
                ? 'bg-ba-accent text-white'
                : 'border border-ba-line bg-white text-ba-ink hover:bg-ba-mist'
            }`}
          >
            {SCREENSHOT_DEVICE_LABELS[item]}
          </button>
        );
      })}
    </div>
  );
}

export function ScreenshotGallery({
  screenshots,
}: {
  screenshots: readonly ScreenshotItem[];
}) {
  const [device, setDevice] = useState<ScreenshotDevice | null>(null);
  const [override, setOverride] = useState<ScreenshotDevice | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const titleId = useId();
  const resolved = override ?? device;
  const active =
    activeIndex != null && resolved
      ? screenshots[activeIndex]
      : null;

  const close = useCallback(() => setActiveIndex(null), []);

  useEffect(() => {
    function sync() {
      setDevice(screenshotDeviceFromWidth(window.innerWidth));
    }
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

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

  if (!resolved) {
    return <div className="mt-10 min-h-[16rem]" aria-hidden="true" />;
  }

  const size = SCREENSHOT_SIZES[resolved];
  const spanFirst = resolved === 'desktop';
  const gridClass =
    resolved === 'phone'
      ? 'mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3'
      : resolved === 'tablet'
        ? 'mt-8 grid gap-8'
        : 'mt-8 grid gap-8 lg:grid-cols-2';

  return (
    <>
      <DeviceTabs
        device={resolved}
        onChange={(next) => setOverride(next)}
      />

      <div className={gridClass}>
        {screenshots.map((shot, index) => (
          <figure
            key={shot.caption}
            className={`overflow-hidden border border-ba-line bg-white shadow-sm ${
              spanFirst && index === 0 ? 'lg:col-span-2' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`group relative block cursor-pointer text-left ${screenshotFrameClass(resolved)}`}
              aria-label={`View full size: ${shot.caption}`}
            >
              <img
                src={shot.sources[resolved]}
                alt={shot.alt}
                width={size.width}
                height={size.height}
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
              src={active.sources[resolved]}
              alt={active.alt}
              width={size.width}
              height={size.height}
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
