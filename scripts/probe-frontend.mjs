import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8188/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app && window.app.graph, null, {
  timeout: 60000,
});
const info = await page.evaluate(() => ({
  hasApp: !!window.app,
  graphToPrompt: typeof window.app.graphToPrompt,
  loadGraphData: typeof window.app.loadGraphData,
  keys: Object.keys(window)
    .filter((k) => /comfy|app/i.test(k))
    .slice(0, 20),
}));
console.log(info);
await browser.close();
