import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
await mkdir('artifacts', { recursive: true });
for (const [name, url] of [['cockpit','http://127.0.0.1:3000'],['constitution','http://127.0.0.1:3000/autonomy'],['integrations','http://127.0.0.1:3000/integrations'],['finance','http://127.0.0.1:3000/finance'],['storefront','http://127.0.0.1:3001']]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `artifacts/${name}-desktop.png`, fullPage: true });
  console.log(JSON.stringify({ app: name, title: await page.title(), text: (await page.locator('body').innerText()).slice(0,1800), errors }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `artifacts/${name}-mobile.png`, fullPage: true });
  console.log(JSON.stringify({ app: name, mobileOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await page.close();
}
await browser.close();
