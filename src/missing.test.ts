import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeInputs, summaryLine } from './appInputs.js';
import { catalogEntry, missingFiles } from './catalog.js';
import { type Config } from './config.js';
import { info, txt2img } from './testing/fixtures.js';

const config: Config = {
  url: 'http://127.0.0.1:8188',
  exclude: [],
  timeoutMs: 1000,
  promptInput: {},
};

function withCheckpoint(name: string): ReturnType<typeof txt2img> {
  const wf = txt2img();
  const loader = wf.nodes[0];
  if (loader) loader.widgets_values = [name];
  return wf;
}

test('a model file the server does not list is reported', () => {
  assert.deepEqual(missingFiles(withCheckpoint('gone.safetensors'), info), [
    'gone.safetensors',
  ]);
});

test('a missing default replaced by the call is not reported', () => {
  const installed = (
    info.CheckpointLoaderSimple?.input.required?.ckpt_name?.[0] as string[]
  )[0];
  assert.deepEqual(
    missingFiles(
      withCheckpoint('gone.safetensors'),
      info,
      new Map([['1.ckpt_name', installed]]),
    ),
    [],
  );
});

test('an installed model is not reported', () => {
  assert.deepEqual(missingFiles(txt2img(), info), []);
});

test('an input image the server does not list is not a missing model', () => {
  const wf = txt2img();
  wf.nodes.push({ id: 40, type: 'LoadImage', widgets_values: ['x.png'] });
  assert.deepEqual(missingFiles(wf, info), []);
});

test('a node type ComfyUI lacks is reported instead of breaking the catalog', () => {
  const wf = txt2img();
  wf.nodes.push({ id: 41, type: 'NoSuchNode', title: 'Custom' });
  const entry = catalogEntry('a.app.json', 0, wf, info, config);
  assert.match(entry.missing?.[0] ?? '', /NoSuchNode/);
});

test('both listings name what is missing', () => {
  const missing = ['gone.safetensors'];
  assert.equal(
    summaryLine('a', [], undefined, missing),
    'a [missing: gone.safetensors]: no inputs',
  );
  assert.match(
    describeInputs('a', [], undefined, false, { missing }),
    /missing: gone\.safetensors/,
  );
});
