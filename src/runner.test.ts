import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CatalogEntry } from './catalog.js';
import { type ComfyClient, type HistoryEntry } from './comfy/client.js';
import { runWorkflow } from './runner.js';
import { info, txt2img } from './testing/fixtures.js';

const finished: HistoryEntry = {
  status: { completed: true },
  outputs: {
    '5': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] },
  },
};

function fakeClient(polls: number): {
  client: ComfyClient;
  uploads: string[];
} {
  const uploads: string[] = [];
  let left = polls;
  const client = {
    uploadImage: (_d: Buffer, name: string) => {
      uploads.push(name);
      return Promise.resolve(name);
    },
    queuePrompt: () => Promise.resolve(),
    history: () => Promise.resolve(left-- > 0 ? undefined : finished),
    view: () => Promise.resolve(Buffer.from('png')),
    cancel: () => Promise.resolve(),
  } as unknown as ComfyClient;
  return { client, uploads };
}

const entry: CatalogEntry = {
  id: 'a',
  file: 'a.app.json',
  modified: 0,
  inputs: [
    { key: '40.image', name: 'image', label: 'P', kind: 'image', default: '' },
  ],
};
const workflow = (): ReturnType<typeof txt2img> => {
  const wf = txt2img();
  wf.nodes.push({ id: 40, type: 'LoadImage', widgets_values: ['in.png'] });
  return wf;
};
const image = (data: string) => ({
  type: 'image' as const,
  data,
  mimeType: 'image/png',
});

test('a workflow whose model is not installed never reaches the queue', async () => {
  let queued = 0;
  const { client } = fakeClient(0);
  client.queuePrompt = () => {
    queued++;
    return Promise.resolve();
  };
  const wf = workflow();
  const loader = wf.nodes[0];
  if (loader) loader.widgets_values = ['gone.safetensors'];
  await assert.rejects(
    runWorkflow(client, entry, wf, info, [], { timeoutMs: 5000, pollMs: 1 }),
    /Not installed in ComfyUI: gone\.safetensors/,
  );
  assert.equal(queued, 0);
});

test('progress is reported on every poll while the run is going', async () => {
  const seen: number[] = [];
  await runWorkflow(fakeClient(2).client, entry, workflow(), info, [], {
    timeoutMs: 5000,
    pollMs: 1,
    onProgress: (s) => seen.push(s),
  });
  assert.equal(seen.length, 2);
});

test('waiting leaves no abort listeners behind', async () => {
  const { signal } = new AbortController();
  let live = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = ((...a: Parameters<typeof add>) => {
    live++;
    add(...a);
  }) as typeof signal.addEventListener;
  signal.removeEventListener = ((...a: Parameters<typeof remove>) => {
    live--;
    remove(...a);
  }) as typeof signal.removeEventListener;
  await runWorkflow(fakeClient(3).client, entry, workflow(), info, [], {
    timeoutMs: 5000,
    pollMs: 1,
    signal,
  });
  assert.equal(live, 0);
});

test('the same image is uploaded under the same name, another under another', async () => {
  const { client, uploads } = fakeClient(0);
  const run = (data: string) =>
    runWorkflow(client, entry, workflow(), info, [image(data)], {
      timeoutMs: 5000,
      pollMs: 1,
    });
  await run('AAAA');
  await run('AAAA');
  await run('BBBB');
  assert.equal(uploads[0], uploads[1]);
  assert.notEqual(uploads[0], uploads[2]);
});
