// Converts the local ComfyUI's App Mode workflows with the frontend itself
// (graphToPrompt) and writes the API prompts to test-results/reference/.
// Local only: the workflows and their output are never committed.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const outDir = path.resolve('test-results/reference');
mkdirSync(outDir, { recursive: true });

const list = await (
  await fetch(`${base}/api/userdata?dir=workflows&recurse=true`)
).json();
const files = list.filter((f) => f.endsWith('.app.json'));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app && window.app.graph, null, {
  timeout: 60000,
});

for (const file of files) {
  const wf = await (
    await fetch(
      `${base}/api/userdata/${encodeURIComponent('workflows/' + file)}`,
    )
  ).json();
  const result = await page.evaluate(async (workflow) => {
    try {
      await window.app.loadGraphData(workflow, true, false);
      const { output } = await window.app.graphToPrompt();
      return { output };
    } catch (e) {
      return { error: String(e) };
    }
  }, wf);
  const name = file.replace(/\.app\.json$/, '').replace(/[\/]/g, '__');
  writeFileSync(
    path.join(outDir, `${name}.workflow.json`),
    JSON.stringify(wf, null, 2),
  );
  writeFileSync(
    path.join(outDir, `${name}.api.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(
    file,
    result.error
      ? `ERROR ${result.error}`
      : `${Object.keys(result.output).length} nodes`,
  );
}
await browser.close();
