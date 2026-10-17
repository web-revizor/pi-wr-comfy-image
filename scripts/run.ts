// Runs one workflow through the same code path as the pi extension. Local only.
// Usage: tsx scripts/run.ts [--repeat=N] [--free] <workflow> '<prompt>' ['<json params>'] [image files…]
// Images go to test-results/runs/. --free unloads ComfyUI's models first, so
// the first run loads them (cold) and later runs are warm; each later run adds
// its index to the seeds given in the params, so ComfyUI cannot answer it from
// its cache. Peak GPU memory (nvidia-smi, whole card) is measured over all
// runs; a stats line is printed and written to
// test-results/runs/<workflow>-stats.json.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCatalog } from '../src/catalog.js';
import { ComfyClient } from '../src/comfy/client.js';
import { loadConfig } from '../src/config.js';
import { type InputBlock } from '../src/params.js';
import { runWorkflow } from '../src/runner.js';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const repeat = Number(
  flags.find((f) => f.startsWith('--repeat='))?.split('=')[1] ?? 1,
);
const [id = '', prompt, json, ...images] = args;
const config = loadConfig();
const client = new ComfyClient(config.url);
const catalog = await buildCatalog(client, config);
const entry = catalog.entries.find((e) => e.id === id);
if (!entry) throw new Error(`no workflow ${id}`);
const input: InputBlock[] = [];
if (prompt) input.push({ type: 'text', text: prompt });
for (const file of images) {
  const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
  input.push({
    type: 'image',
    data: readFileSync(file).toString('base64'),
    mimeType: `image/${ext}`,
  });
}

/** Samples used GPU memory (MiB) every 200 ms until stopped. */
function vramSampler(): { stop: () => number; now: () => number } {
  let peak = 0;
  let last = 0;
  const smi = spawn('nvidia-smi', [
    '--query-gpu=memory.used',
    '--format=csv,noheader,nounits',
    '-lms',
    '200',
  ]);
  smi.stdout.on('data', (d: Buffer) => {
    for (const line of d.toString().split('\n')) {
      const mib = Number(line.trim());
      if (!line.trim() || Number.isNaN(mib)) continue;
      last = mib;
      peak = Math.max(peak, mib);
    }
  });
  smi.on('error', () => undefined);
  return {
    now: () => last,
    stop: () => {
      smi.kill();
      return peak;
    },
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

if (flags.includes('--free')) {
  await fetch(`${config.url}/free`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  });
  await sleep(3000); // /free is applied by the prompt worker, not at once
}

const out = path.resolve('test-results/runs');
mkdirSync(out, { recursive: true });
const base = id.replaceAll('/', '__');
const sampler = vramSampler();
await sleep(600);
const idleVramMiB = sampler.now();
const seconds: number[] = [];
const files: string[] = [];
const params = (json ? JSON.parse(json) : {}) as Record<string, unknown>;
for (let run = 0; run < repeat; run++) {
  const runParams = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      /seed/i.test(k) && typeof v === 'number' ? v + run : v,
    ]),
  );
  const result = await runWorkflow(
    client,
    entry,
    catalog.workflows.get(id)!,
    catalog.info,
    [...input, { type: 'text', text: JSON.stringify(runParams) }],
    { timeoutMs: config.timeoutMs },
  );
  seconds.push(result.seconds);
  for (const [i, img] of result.images.entries()) {
    const file = path.join(
      out,
      `${base}-${result.promptId.slice(0, 8)}-${i}.${img.mimeType.split('/')[1]}`,
    );
    writeFileSync(file, Buffer.from(img.data, 'base64'));
    files.push(file);
    console.log('wrote', file, '| comfy:', img.file);
  }
  console.log('seeds', result.seeds, 'seconds', result.seconds);
}
const stats = {
  workflow: id,
  seconds,
  idleVramMiB,
  peakVramMiB: sampler.stop(),
  files,
};
writeFileSync(
  path.join(out, `${base}-stats.json`),
  `${JSON.stringify(stats, null, 2)}\n`,
);
console.log('stats', JSON.stringify(stats));
