// Builds the bundled minimal workflows (workflows/*.app.json) with the ComfyUI
// frontend itself, so the files are exactly what ComfyUI saves. Local only:
// needs a running ComfyUI and an installed Chrome (playwright-core).
// Usage: node scripts/build-workflows.mjs [name]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const outDir = path.resolve('workflows');

const HF = 'https://huggingface.co';
const QWEN21 = {
  unet: {
    name: 'qwen_image_2.1_int8_convrot.safetensors',
    directory: 'diffusion_models',
    url: `${HF}/Comfy-Org/Qwen-Image-2.1/resolve/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors`,
  },
  clip: {
    name: 'qwen3vl_8b_int8_convrot.safetensors',
    directory: 'text_encoders',
    url: `${HF}/Comfy-Org/Qwen-Image-2.1/resolve/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors`,
  },
  vae: {
    name: 'qwen_image_2.1_vae_bf16.safetensors',
    directory: 'vae',
    url: `${HF}/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors`,
  },
};
const KLEIN4B = {
  unet: {
    name: 'flux-2-klein-4b.safetensors',
    directory: 'diffusion_models',
    url: `${HF}/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors`,
  },
  clip: {
    name: 'qwen_3_4b.safetensors',
    directory: 'text_encoders',
    url: `${HF}/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors`,
  },
  vae: {
    name: 'flux2-vae.safetensors',
    directory: 'vae',
    url: `${HF}/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors`,
  },
};

/**
 * One workflow: nodes `{ id, type, title, widgets, model, col, row }`, links
 * `[fromId, outputName, toId, inputName]`, App Mode inputs `[id, widget]` and
 * outputs (node ids).
 */
const loaders = (m, clipType) => [
  {
    id: 1,
    type: 'UNETLoader',
    title: 'Model',
    widgets: { unet_name: m.unet.name },
    model: m.unet,
    col: 0,
    row: 0,
  },
  {
    id: 2,
    type: 'CLIPLoader',
    title: 'Text encoder',
    widgets: { clip_name: m.clip.name, type: clipType },
    model: m.clip,
    col: 0,
    row: 1,
  },
  {
    id: 3,
    type: 'VAELoader',
    title: 'VAE',
    widgets: { vae_name: m.vae.name },
    model: m.vae,
    col: 0,
    row: 2,
  },
];

const qwenTail = (latentFrom) => [
  {
    id: 8,
    type: 'KSampler',
    title: 'Sampler',
    widgets: {
      seed: 0,
      'seed:control': 'randomize',
      steps: 25,
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    },
    col: 3,
    row: 0,
  },
  { id: 9, type: 'VAEDecode', col: 4, row: 0 },
  {
    id: 10,
    type: 'SaveImage',
    title: 'Result',
    widgets: { filename_prefix: 'pi/qwen21' },
    col: 5,
    row: 0,
  },
  [1, 'MODEL', 8, 'model'],
  [5, 'positive', 8, 'positive'],
  [5, 'negative', 8, 'negative'],
  latentFrom,
  [8, 'LATENT', 9, 'samples'],
  [3, 'VAE', 9, 'vae'],
  [9, 'IMAGE', 10, 'images'],
];

const fluxTail = [
  {
    id: 20,
    type: 'ConditioningZeroOut',
    title: 'Empty negative',
    col: 2,
    row: 2,
  },
  {
    id: 21,
    type: 'KSamplerSelect',
    widgets: { sampler_name: 'euler' },
    col: 3,
    row: 1,
  },
  // A titled primitive makes the param `seed`, as in the Qwen workflows.
  {
    id: 28,
    type: 'PrimitiveInt',
    title: 'Seed',
    widgets: { value: 0, 'value:control': 'randomize' },
    col: 2,
    row: 5,
  },
  { id: 22, type: 'RandomNoise', col: 3, row: 2 },
  [28, 'INT', 22, 'noise_seed'],
  { id: 24, type: 'CFGGuider', widgets: { cfg: 1 }, col: 3, row: 0 },
  { id: 25, type: 'SamplerCustomAdvanced', col: 4, row: 0 },
  { id: 26, type: 'VAEDecode', col: 5, row: 0 },
  {
    id: 27,
    type: 'SaveImage',
    title: 'Result',
    widgets: { filename_prefix: 'pi/flux2_klein' },
    col: 6,
    row: 0,
  },
  [1, 'MODEL', 24, 'model'],
  [2, 'CLIP', 5, 'clip'],
  [24, 'GUIDER', 25, 'guider'],
  [21, 'SAMPLER', 25, 'sampler'],
  [22, 'NOISE', 25, 'noise'],
  [23, 'SIGMAS', 25, 'sigmas'],
  [25, 'output', 26, 'samples'],
  [3, 'VAE', 26, 'vae'],
  [26, 'IMAGE', 27, 'images'],
];

const split = (items) => ({
  nodes: items.filter((i) => !Array.isArray(i)),
  links: items.filter((i) => Array.isArray(i)),
});

const WORKFLOWS = {
  qwen21_t2i: {
    ...split([
      ...loaders(QWEN21, 'qwen_image'),
      {
        id: 5,
        type: 'TextEncodeQwenImage21',
        title: 'Prompt',
        widgets: { prompt: '', negative_prompt: '', resolution: 1024 },
        col: 1,
        row: 0,
      },
      {
        id: 6,
        type: 'ResolutionSelector',
        title: 'Size',
        widgets: { aspect_ratio: '1:1 (Square)', megapixels: 1, multiple: 16 },
        col: 1,
        row: 1,
      },
      {
        id: 7,
        type: 'EmptyLatentImage',
        widgets: { batch_size: 1 },
        col: 2,
        row: 1,
      },
      [2, 'CLIP', 5, 'clip'],
      [6, 'width', 7, 'width'],
      [6, 'height', 7, 'height'],
      ...qwenTail([7, 'LATENT', 8, 'latent_image']),
    ]),
    inputs: [
      [5, 'prompt'],
      [8, 'seed'],
      [8, 'steps'],
      [6, 'aspect_ratio'],
      [6, 'megapixels'],
      [1, 'unet_name'],
      [2, 'clip_name'],
    ],
    outputs: [10],
  },
  qwen21_edit: {
    ...split([
      ...loaders(QWEN21, 'qwen_image'),
      {
        id: 4,
        type: 'LoadImage',
        title: 'Input image',
        widgets: { image: 'example.png' },
        col: 0,
        row: 3,
      },
      {
        id: 5,
        type: 'TextEncodeQwenImage21',
        title: 'Prompt',
        widgets: { prompt: '', negative_prompt: '', resolution: 1024 },
        col: 1,
        row: 0,
      },
      [2, 'CLIP', 5, 'clip'],
      [3, 'VAE', 5, 'vae'],
      [4, 'IMAGE', 5, 'images.image_1'],
      ...qwenTail([5, 'latent', 8, 'latent_image']),
    ]),
    inputs: [
      [5, 'prompt'],
      [4, 'image'],
      [8, 'seed'],
      [8, 'steps'],
      [5, 'resolution'],
      [1, 'unet_name'],
      [2, 'clip_name'],
    ],
    outputs: [10],
  },
  flux2_klein_t2i: {
    ...split([
      ...loaders(KLEIN4B, 'flux2'),
      {
        id: 5,
        type: 'CLIPTextEncode',
        title: 'Prompt',
        widgets: { text: '' },
        col: 1,
        row: 0,
      },
      {
        id: 6,
        type: 'ResolutionSelector',
        title: 'Size',
        widgets: { aspect_ratio: '1:1 (Square)', megapixels: 1, multiple: 16 },
        col: 1,
        row: 1,
      },
      {
        id: 7,
        type: 'EmptyFlux2LatentImage',
        widgets: { batch_size: 1 },
        col: 2,
        row: 1,
      },
      {
        id: 23,
        type: 'Flux2Scheduler',
        title: 'Steps',
        widgets: { steps: 4 },
        col: 2,
        row: 3,
      },
      [5, 'CONDITIONING', 24, 'positive'],
      [5, 'CONDITIONING', 20, 'conditioning'],
      [20, 'CONDITIONING', 24, 'negative'],
      [6, 'width', 7, 'width'],
      [6, 'height', 7, 'height'],
      [6, 'width', 23, 'width'],
      [6, 'height', 23, 'height'],
      [7, 'LATENT', 25, 'latent_image'],
      ...fluxTail,
    ]),
    inputs: [
      [5, 'text'],
      [28, 'value'],
      [23, 'steps'],
      [6, 'aspect_ratio'],
      [6, 'megapixels'],
      [1, 'unet_name'],
      [2, 'clip_name'],
    ],
    outputs: [27],
  },
  flux2_klein_edit: {
    ...split([
      ...loaders(KLEIN4B, 'flux2'),
      {
        id: 4,
        type: 'LoadImage',
        title: 'Input image',
        widgets: { image: 'example.png' },
        col: 0,
        row: 3,
      },
      {
        id: 5,
        type: 'CLIPTextEncode',
        title: 'Prompt',
        widgets: { text: '' },
        col: 1,
        row: 0,
      },
      {
        id: 6,
        type: 'ImageScaleToTotalPixels',
        title: 'Size',
        widgets: {
          upscale_method: 'lanczos',
          megapixels: 1,
          resolution_steps: 16,
        },
        col: 1,
        row: 3,
      },
      {
        id: 7,
        type: 'EmptyFlux2LatentImage',
        widgets: { batch_size: 1 },
        col: 2,
        row: 4,
      },
      { id: 11, type: 'GetImageSize', col: 1, row: 4 },
      { id: 12, type: 'VAEEncode', col: 1, row: 2 },
      {
        id: 13,
        type: 'ReferenceLatent',
        title: 'Reference (positive)',
        col: 2,
        row: 0,
      },
      {
        id: 14,
        type: 'ReferenceLatent',
        title: 'Reference (negative)',
        col: 2,
        row: 1,
      },
      {
        id: 23,
        type: 'Flux2Scheduler',
        title: 'Steps',
        widgets: { steps: 4 },
        col: 2,
        row: 3,
      },
      [4, 'IMAGE', 6, 'image'],
      [6, 'IMAGE', 11, 'image'],
      [6, 'IMAGE', 12, 'pixels'],
      [3, 'VAE', 12, 'vae'],
      [5, 'CONDITIONING', 13, 'conditioning'],
      [12, 'LATENT', 13, 'latent'],
      [5, 'CONDITIONING', 20, 'conditioning'],
      [20, 'CONDITIONING', 14, 'conditioning'],
      [12, 'LATENT', 14, 'latent'],
      [13, 'CONDITIONING', 24, 'positive'],
      [14, 'CONDITIONING', 24, 'negative'],
      [11, 'width', 7, 'width'],
      [11, 'height', 7, 'height'],
      [11, 'width', 23, 'width'],
      [11, 'height', 23, 'height'],
      [7, 'LATENT', 25, 'latent_image'],
      ...fluxTail,
    ]),
    inputs: [
      [5, 'text'],
      [4, 'image'],
      [28, 'value'],
      [23, 'steps'],
      [6, 'megapixels'],
      [1, 'unet_name'],
      [2, 'clip_name'],
    ],
    outputs: [27],
  },
};

const only = process.argv[2];
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app && window.app.graph, null, {
  timeout: 60000,
});

for (const [name, spec] of Object.entries(WORKFLOWS)) {
  if (only && name !== only) continue;
  const result = await page.evaluate(
    ({ name, spec }) => {
      const { app, LiteGraph } = window;
      app.graph.clear();
      const byId = new Map();
      for (const n of spec.nodes) {
        const node = LiteGraph.createNode(n.type);
        if (!node) return { error: `node type ${n.type} is not installed` };
        node.id = n.id;
        if (n.title) node.title = n.title;
        node.pos = [40 + n.col * 380, 40 + n.row * 260];
        app.graph.add(node);
        byId.set(n.id, node);
        for (const [key, value] of Object.entries(n.widgets ?? {})) {
          const [widget, control] = key.split(':');
          const w = node.widgets?.find((x) => x.name === widget);
          if (!w) return { error: `${n.type} has no widget ${widget}` };
          if (control) {
            // The control combo is linked to its value widget; its name varies
            // ("control_after_generate", or its default such as "fixed").
            const c =
              w.linkedWidgets?.find((x) => x.type === 'combo') ??
              node.widgets.find((x) => x.name === 'control_after_generate');
            if (!c)
              return { error: `${n.type}.${widget} has no control widget` };
            c.value = value;
          } else {
            w.value = value;
          }
        }
        if (n.model) node.properties.models = [n.model];
      }
      for (const [from, out, to, input] of spec.links) {
        const a = byId.get(from);
        const b = byId.get(to);
        const o = a.outputs.findIndex((s) => s.name === out);
        let i = b.inputs.findIndex((s) => s.name === input);
        if (i < 0 && b.widgets?.some((w) => w.name === input)) {
          b.convertWidgetToInput?.(b.widgets.find((w) => w.name === input));
          i = b.inputs.findIndex((s) => s.name === input);
        }
        if (o < 0 || i < 0)
          return {
            error: `link ${from}.${out} -> ${to}.${input}: no such slot`,
          };
        if (!a.connect(o, b, i))
          return { error: `link ${from}.${out} -> ${to}.${input} refused` };
      }
      app.graph.extra.linearData = {
        inputs: spec.inputs,
        outputs: spec.outputs,
      };
      const wf = app.graph.serialize();
      return { wf, name };
    },
    { name, spec },
  );
  if (result.error) {
    console.log(`${name}: ERROR ${result.error}`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(
    path.join(outDir, `${name}.app.json`),
    `${JSON.stringify(result.wf, null, 2)}\n`,
  );
  console.log(
    `${name}: ${result.wf.nodes.length} nodes, ${result.wf.links.length} links`,
  );
}
await browser.close();
