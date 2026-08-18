import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ADVISOR_URL || 'http://localhost:3007';
const OUT_DIR = join(__dirname, '..', '..', '.screenshots');
const SLUG = 'northlight-demo-screenshots';
const EMAIL = 'demo@northlight.test';
const PASSWORD = 'DemoPass!234';

const PAGES = [
  { path: '/app', file: 'command-centre-v2.png', ready: 'Active Students' },
  { path: '/app/pricing', file: 'pricing-advisor-v2.png', ready: 'Robotics Club' },
  { path: '/app/actions', file: 'action-centre-v2.png', ready: 'Verified Saved' },
  { path: '/app/advisor', file: 'ask-advisor-v2.png', ready: 'Ask Advisor' },
  { path: '/app/help', file: 'help-faq-v2.png', ready: 'Meet Your Advisor' },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

mkdirSync(OUT_DIR, { recursive: true });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
await page.getByRole('button', { name: 'Sign In' }).click();
await page.waitForURL('**/app', { timeout: 20_000 });
await page.getByText('John Smith').waitFor({ timeout: 15_000 });

for (const shot of PAGES) {
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  await page.getByText(shot.ready).first().waitFor({ timeout: 30_000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const dest = join(OUT_DIR, shot.file);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`Wrote ${dest}`);
}

await browser.close();
