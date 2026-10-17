import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { type ComfyClient } from './comfy/client.js';
import { type ObjectInfo } from './comfy/types.js';
import { BUNDLED_DIR, INSTALL_DIR, installWorkflows } from './install.js';

const loaders: ObjectInfo = {
  UNETLoader: {
    input: { required: { unet_name: [['flux-2-klein-4b.safetensors']] } },
    output: ['MODEL'],
    output_node: false,
  },
  CLIPLoader: {
    input: {
      required: {
        clip_name: ['COMBO', { options: ['qwen_3_4b.safetensors'] }],
      },
    },
    output: ['CLIP'],
    output_node: false,
  },
  VAELoader: {
    input: { required: { vae_name: [['flux2-vae.safetensors']] } },
    output: ['VAE'],
    output_node: false,
  },
};

/** A server with `existing` files already saved; records what was written. */
function fakeClient(existing: string[]): {
  client: ComfyClient;
  written: string[];
} {
  const written: string[] = [];
  const stub = {
    saveWorkflow(relPath: string): Promise<boolean> {
      if (existing.includes(relPath)) return Promise.resolve(false);
      written.push(relPath);
      return Promise.resolve(true);
    },
  };
  // Only saveWorkflow is used by installWorkflows.
  return { client: stub as unknown as ComfyClient, written };
}

test('bundled workflows go into their own folder, existing files are kept', async () => {
  const bundled = readdirSync(BUNDLED_DIR).filter((f) =>
    f.endsWith('.app.json'),
  );
  assert.deepEqual(bundled.sort(), [
    'flux2_klein_edit.app.json',
    'flux2_klein_t2i.app.json',
    'qwen21_edit.app.json',
    'qwen21_t2i.app.json',
  ]);
  const kept = `${INSTALL_DIR}/qwen21_t2i.app.json`;
  const { client, written } = fakeClient([kept]);
  const result = await installWorkflows(client, loaders);
  assert.deepEqual(result.kept, [kept]);
  assert.equal(result.installed.length, 3);
  assert.deepEqual(written, result.installed);
  assert.ok(written.every((p) => p.startsWith(`${INSTALL_DIR}/`)));
});

test('model files the server lacks are listed once, with where to put them', async () => {
  const { client } = fakeClient([]);
  const { missing } = await installWorkflows(client, loaders);
  assert.deepEqual(missing.map((m) => `${m.directory}/${m.name}`).sort(), [
    'diffusion_models/qwen_image_2.1_int8_convrot.safetensors',
    'text_encoders/qwen3vl_8b_int8_convrot.safetensors',
    'vae/qwen_image_2.1_vae_bf16.safetensors',
  ]);
  assert.ok(missing.every((m) => m.url.startsWith('https://huggingface.co/')));
});
