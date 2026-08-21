export const SCREENSHOT_DEVICES = ['phone', 'tablet', 'desktop'] as const;
export type ScreenshotDevice = (typeof SCREENSHOT_DEVICES)[number];

/** CSS layout size. PNG files are captured at SCREENSHOT_DPR × these pixels. */
export const SCREENSHOT_SIZES: Record<
  ScreenshotDevice,
  { width: number; height: number }
> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

/** Retina capture scale used by `capture-demo-screenshots.mjs`. */
export const SCREENSHOT_DPR = 2;

export const SCREENSHOT_DEVICE_LABELS: Record<ScreenshotDevice, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  desktop: 'Desktop',
};

export type ScreenshotSources = Record<ScreenshotDevice, string>;

export type ScreenshotItem = {
  sources: ScreenshotSources;
  alt: string;
  caption: string;
};

export function screenshotDeviceFromWidth(width: number): ScreenshotDevice {
  if (width < 768) return 'phone';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function screenshotFrameClass(device: ScreenshotDevice): string {
  if (device === 'phone') return 'mx-auto w-full max-w-[390px]';
  if (device === 'tablet') return 'mx-auto w-full max-w-[768px]';
  return 'w-full';
}

/** Tell the browser the PNG is a 2× bitmap of the CSS layout size. */
export function screenshotSrcSet(src: string): string {
  return `${src} ${SCREENSHOT_DPR}x`;
}
