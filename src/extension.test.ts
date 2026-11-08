import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { info, txt2img } from './testing/fixtures.js';

interface Tool {
  name: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  executionMode?: string;
  execute: (id: string, params: object) => Promise<unknown>;
}

// CONFIG_FILE and CACHE_FILE come from the home folder when the module loads.
const home = mkdtempSync(path.join(os.tmpdir(), 'pi-comfy-ext-'));
process.env.USERPROFILE = home;
process.env.HOME = home;
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  rmSync(home, { recursive: true, force: true });
});

let files = ['a.app.json'];
globalThis.fetch = ((url: string) => {
  const u = String(url);
  const body: unknown = u.endsWith('/object_info')
    ? info
    : u.includes('recurse=true')
      ? files.map((f) => ({ path: f, modified: 1 }))
      : txt2img();
  return Promise.resolve(new Response(JSON.stringify(body)));
}) as typeof fetch;

test('the tool description follows the workflow list, only when it changes', async () => {
  const { default: comfyImage } = await import('./extension.js');
  const registered: Tool[] = [];
  await comfyImage({
    registerTool: (t: Tool) => registered.push(t),
    registerCommand: () => undefined,
  } as never);
  const generate = (): Tool[] =>
    registered.filter((t) => t.name === 'comfy_generate');
  const inputs = registered.find((t) => t.name === 'comfy_workflow_inputs');
  assert.equal(generate().length, 1);

  await inputs?.execute('1', {});
  assert.equal(generate().length, 1, 'same list: nothing registered again');

  files = ['a.app.json', 'b.app.json'];
  await inputs?.execute('2', {});
  assert.equal(generate().length, 2);
  assert.match(generate().at(-1)?.description ?? '', /^b: /m);
});

test('simple mode gives the agent only generate_image', async () => {
  const { CONFIG_FILE } = await import('./config.js');
  mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify({ simple: { text: 'a' } }));
  const { default: comfyImage } = await import('./extension.js');
  const registered: Tool[] = [];
  await comfyImage({
    registerTool: (t: Tool) => registered.push(t),
    registerCommand: () => undefined,
  } as never);
  rmSync(CONFIG_FILE);
  assert.deepEqual(
    registered.map((t) => t.name),
    ['generate_image'],
  );
});

test('saving simple mode keeps the other settings, and off removes only it', async () => {
  const { loadConfig, saveSimple } = await import('./config.js');
  const file = path.join(home, 'simple.json');
  writeFileSync(file, JSON.stringify({ timeoutMs: 5 }));
  saveSimple({ text: 'a' }, file);
  assert.deepEqual(loadConfig(file).simple, { text: 'a' });
  assert.equal(loadConfig(file).timeoutMs, 5);
  saveSimple(undefined, file);
  assert.equal(loadConfig(file).simple, undefined);
  assert.equal(loadConfig(file).timeoutMs, 5);
});

test('both tools reach the system prompt and generation runs one at a time', async () => {
  const { default: comfyImage } = await import('./extension.js');
  const registered: Tool[] = [];
  await comfyImage({
    registerTool: (t: Tool) => registered.push(t),
    registerCommand: () => undefined,
  } as never);
  for (const tool of registered) assert.ok(tool.promptSnippet, tool.name);
  const generate = registered.find((t) => t.name === 'comfy_generate');
  assert.equal(generate?.executionMode, 'sequential');
  for (const rule of generate?.promptGuidelines ?? []) {
    assert.match(rule, /comfy_/, 'a guideline must name its tool');
  }
  assert.ok(generate?.promptGuidelines?.length);
});
