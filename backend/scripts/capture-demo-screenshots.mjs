import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ADVISOR_URL || 'http://localhost:3007';
const OUT_DIR = join(__dirname, '..', '..', '.screenshots');
const PUBLIC_DIR = join(
  __dirname,
  '..',
  '..',
  'frontend',
  'public',
  'images',
  'screenshots'
);
const SOMTICO_TECH_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'somtico-tech',
  'public',
  'images',
  'products',
  'ai-business-advisor'
);
const EMAIL = 'demo@northlight.test';
const PASSWORD = 'DemoPass!234';

const PAGES = [
  {
    path: '/app',
    file: 'command-centre-v4',
    heading: 'Command Centre',
    ready: 'Active Students',
  },
  {
    path: '/app/pricing',
    file: 'pricing-advisor-v4',
    heading: 'Pricing Advisor',
    ready: 'Robotics Club',
  },
  {
    path: '/app/actions',
    file: 'action-centre-v4',
    heading: 'Action Centre',
    ready: 'Verified Saved',
  },
  { path: '/app/advisor', file: 'ask-advisor-v4', heading: 'Ask Advisor' },
  {
    path: '/app/help',
    file: 'help-faq-v4',
    heading: 'Help & FAQ',
    ready: 'Meet Your Advisor',
  },
];

/** 2× device pixels so marketing shots stay sharp on retina screens. */
const DEVICE_SCALE_FACTOR = 2;

/** Viewports match the live product breakpoints (Tailwind md=768, lg=1024). */
const DEVICES = [
  {
    name: 'desktop',
    suffix: '',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  {
    name: 'tablet',
    suffix: '-tablet',
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
  },
  {
    name: 'phone',
    suffix: '-phone',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
];

function filenameFor(shot, device) {
  return `${shot.file}${device.suffix}.png`;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/app', { timeout: 20_000 });
  await page.getByRole('heading', { name: 'Command Centre' }).waitFor({
    timeout: 20_000,
  });
}

async function capturePage(page, shot, dest) {
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: shot.heading }).first().waitFor({
    timeout: 30_000,
  });
  if (shot.ready) {
    await page.getByText(shot.ready).first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });
  }
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: dest,
    fullPage: false,
    type: 'png',
    animations: 'disabled',
    caret: 'hide',
    scale: 'device',
  });
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });
mkdirSync(SOMTICO_TECH_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  });
  const page = await context.newPage();
  await login(page);

  for (const shot of PAGES) {
    const file = filenameFor(shot, device);
    const dest = join(OUT_DIR, file);
    await capturePage(page, shot, dest);
    copyFileSync(dest, join(PUBLIC_DIR, file));
    copyFileSync(dest, join(SOMTICO_TECH_DIR, file));
    console.log(`Wrote ${file} (${device.name})`);
  }

  await context.close();
}

await browser.close();
console.log(`Copied into ${PUBLIC_DIR} and ${SOMTICO_TECH_DIR}`);
