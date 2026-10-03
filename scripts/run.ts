// Runs one workflow through the same code path as the pi extension. Local only.
// Usage: tsx scripts/run.ts <model id> '<prompt>' ['<json params>']
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCatalog } from '../src/catalog.js';
import { ComfyClient } from '../src/comfy/client.js';
import { loadConfig } from '../src/config.js';
import { type InputBlock } from '../src/params.js';
import { runWorkflow } from '../src/runner.js';

const [id = '', prompt, json] = process.argv.slice(2);
const config = loadConfig();
const client = new ComfyClient(config.url);
const catalog = await buildCatalog(client, config);
console.log('models:', catalog.entries.map((e) => e.id).join(', '));
const entry = catalog.entries.find((e) => e.id === id);
if (!entry) throw new Error(`no model ${id}`);
const input: InputBlock[] = [];
if (prompt) input.push({ type: 'text', text: prompt });
if (json) input.push({ type: 'text', text: json });
const result = await runWorkflow(
  client,
  entry,
  catalog.workflows.get(id)!,
  catalog.info,
  input,
  {
    timeoutMs: config.timeoutMs,
  },
);
const out = path.resolve('test-results/runs');
mkdirSync(out, { recursive: true });
for (const [i, img] of result.images.entries()) {
  const file = path.join(
    out,
    `${id}-${result.promptId.slice(0, 8)}-${i}.${img.mimeType.split('/')[1]}`,
  );
  writeFileSync(file, Buffer.from(img.data, 'base64'));
  console.log('wrote', file, '| comfy:', img.file);
}
console.log('seeds', result.seeds, 'seconds', result.seconds);
