// Runs the test apps of scripts/custom-apps/workflows through the code the pi
// extension uses. Local only. Needs a running ComfyUI, no models.
// Copies the apps to workflows/pi-custom-test/ for the run and removes them after
// it, so they never show up in ComfyUI or pi otherwise. Results go to
// ComfyUI's output/pi-custom-test/. Usage: tsx scripts/check-custom-apps.ts
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildCatalog, type Catalog } from '../src/catalog.js';
import { ComfyClient } from '../src/comfy/client.js';
import { type ApiPrompt } from '../src/comfy/types.js';
import { loadConfig } from '../src/config.js';
import { toApiPrompt } from '../src/convert/toApiPrompt.js';
import { type InputBlock } from '../src/params.js';
import { runWorkflow } from '../src/runner.js';

const FOLDER = 'pi-custom-test';
const dir = path.resolve('scripts/custom-apps/workflows');
const photo = readFileSync(path.resolve('scripts/custom-apps/input.png'));
const config = loadConfig();
const client = new ComfyClient(config.url);
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.app.json'))
  .map((f) => f.replace('.app.json', ''));

const userdata = (name: string): string =>
  `${config.url}/api/userdata/${encodeURIComponent(`workflows/${FOLDER}/${name}.app.json`)}`;

async function remove(): Promise<void> {
  for (const name of names) {
    await fetch(userdata(name), { method: 'DELETE' }).catch(() => undefined);
  }
}

async function install(): Promise<void> {
  for (const name of names) {
    const res = await fetch(`${userdata(name)}?overwrite=true`, {
      method: 'POST',
      body: readFileSync(path.join(dir, `${name}.app.json`)),
    });
    if (!res.ok) throw new Error(`install ${name}: HTTP ${res.status}`);
  }
}

const image: InputBlock = {
  type: 'image',
  data: photo.toString('base64'),
  mimeType: 'image/png',
};

interface Size {
  width: number;
  height: number;
}

function pngSize(base64: string): Size {
  const png = Buffer.from(base64, 'base64');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function run(
  catalog: Catalog,
  name: string,
  params: Record<string, unknown>,
  images = 1,
): Promise<Size[]> {
  const id = `${FOLDER}/${name}`;
  const entry = catalog.entries.find((e) => e.id === id);
  assert.ok(entry, `${id} is not in the catalog`);
  const input: InputBlock[] = [
    ...Array<InputBlock>(images).fill(image),
    { type: 'text', text: JSON.stringify(params) },
  ];
  const result = await runWorkflow(
    client,
    entry,
    catalog.workflows.get(id)!,
    catalog.info,
    input,
    { timeoutMs: 120_000 },
  );
  return result.images.map((i) => pngSize(i.data));
}

function parity(catalog: Catalog, name: string): void {
  const workflow = catalog.workflows.get(`${FOLDER}/${name}`);
  assert.ok(workflow, name);
  const ours = toApiPrompt(workflow, catalog.info);
  const ref = JSON.parse(
    readFileSync(path.join(dir, `${name}.api.json`), 'utf8'),
  ) as ApiPrompt;
  for (const id of Object.keys(ref)) {
    assert.ok(
      isDeepStrictEqual(ref[id]?.inputs, ours[id]?.inputs),
      `#${id}: frontend ${JSON.stringify(ref[id]?.inputs)} ours ${JSON.stringify(ours[id]?.inputs)}`,
    );
  }
  assert.equal(Object.keys(ours).length, Object.keys(ref).length);
}

const paramNames = (catalog: Catalog, name: string): string[] =>
  catalog.entries
    .find((e) => e.id === `${FOLDER}/${name}`)
    ?.inputs.map((i) => i.name) ?? [];

type Check = [string, (c: Catalog) => Promise<void> | void];

const checks: Check[] = [
  ...names.map((name): Check => [`parity ${name}`, (c) => parity(c, name)]),
  [
    'core dynamic combo: saved option',
    async (c) => {
      assert.deepEqual(
        await run(c, 'dynamic_core', { width: 128, height: 96 }),
        [{ width: 128, height: 96 }],
      );
    },
  ],
  [
    'core dynamic combo: another option',
    async (c) => {
      assert.deepEqual(
        await run(c, 'dynamic_core', {
          resize_type: 'scale by multiplier',
          multiplier: 0.5,
        }),
        [{ width: 128, height: 128 }],
      );
    },
  ],
  [
    'dynamic combo on the output node',
    async (c) => {
      assert.equal((await run(c, 'save_advanced', {})).length, 1);
    },
  ],
  [
    'third-party dynamic combo',
    async (c) => {
      if (!names.includes('third_party')) throw new Error('SKIP');
      assert.equal((await run(c, 'third_party', {})).length, 1);
    },
  ],
  [
    'two input images',
    async (c) => {
      const [size] = await run(c, 'two_images', {}, 2);
      assert.equal(size?.width, 512);
    },
  ],
  [
    'two outputs',
    async (c) => {
      assert.equal((await run(c, 'two_outputs', {})).length, 2);
    },
  ],
  [
    'same titles get distinct names',
    (c) => {
      const list = paramNames(c, 'same_titles');
      assert.equal(new Set(list).size, list.length, list.join());
    },
  ],
  [
    'an input that no longer exists is reported, the app still runs',
    async (c) => {
      const entry = c.entries.find((e) => e.id === `${FOLDER}/unusable_input`);
      assert.deepEqual(entry?.unresolved, ['1.no_such_widget']);
      assert.equal((await run(c, 'unusable_input', {})).length, 1);
    },
  ],
  [
    'a prompt for an app without one is not silently accepted',
    async (c) => {
      const id = `${FOLDER}/two_outputs`;
      const entry = c.entries.find((e) => e.id === id);
      assert.ok(entry);
      await assert.rejects(
        runWorkflow(
          client,
          entry,
          c.workflows.get(id)!,
          c.info,
          [image, { type: 'text', text: 'a cat' }],
          { timeoutMs: 120_000 },
        ),
      );
    },
  ],
];

let failed = 0;
try {
  await remove();
  await install();
  const catalog = await buildCatalog(client, config);
  for (const [title, check] of checks) {
    try {
      await check(catalog);
      console.log(`ok   ${title}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${title}: ${String(err).slice(0, 400)}`);
    }
  }
} finally {
  await remove();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
