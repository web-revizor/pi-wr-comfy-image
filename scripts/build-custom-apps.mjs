// Builds the App Mode test workflows with the ComfyUI frontend itself, so they
// have the format real users save, and stores the frontend's API prompt next to
// each one. Local only; writes scripts/custom-apps/workflows/ and nothing in ComfyUI.
// The apps need no models. Usage: node scripts/build-custom-apps.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const outDir = path.resolve('scripts/custom-apps/workflows');
mkdirSync(outDir, { recursive: true });

const save = (id, prefix) => ({
  id,
  type: 'SaveImage',
  widgets: { filename_prefix: `pi-custom-test/${prefix}` },
});
const load = { id: 'in', type: 'LoadImage', widgets: { image: 'example.png' } };

/**
 * nodes: id is a local name. links: [from, slot, to, input name].
 * inputs: [node, widget]; a dotted widget is a dynamic combo's field.
 */
const apps = {
  dynamic_core: {
    nodes: [
      load,
      {
        id: 'resize',
        type: 'ResizeImageMaskNode',
        widgets: { resize_type: 'scale dimensions' },
      },
      save('out', 'dynamic_core'),
    ],
    links: [
      ['in', 0, 'resize', 'input'],
      ['resize', 0, 'out', 'images'],
    ],
    inputs: [
      ['in', 'image'],
      ['resize', 'resize_type'],
      ['resize', 'resize_type.width'],
      ['resize', 'resize_type.height'],
      ['resize', 'resize_type.multiplier'],
    ],
    outputs: ['out'],
  },
  save_advanced: {
    nodes: [
      load,
      {
        id: 'out',
        type: 'SaveImageAdvanced',
        widgets: { filename_prefix: 'pi-custom-test/save_advanced' },
      },
    ],
    links: [['in', 0, 'out', 'images']],
    inputs: [
      ['in', 'image'],
      ['out', 'format'],
      ['out', 'format.bit_depth'],
    ],
    outputs: ['out'],
  },
  third_party: {
    requires: 'ImageTransformKJ',
    nodes: [
      load,
      {
        id: 'kj',
        type: 'ImageTransformKJ',
        widgets: { keep_proportion: 'stretch' },
      },
      save('out', 'third_party'),
    ],
    links: [
      ['in', 0, 'kj', 'image'],
      ['kj', 0, 'out', 'images'],
    ],
    inputs: [
      ['in', 'image'],
      ['kj', 'keep_proportion'],
      ['kj', 'width'],
      ['kj', 'height'],
    ],
    outputs: ['out'],
  },
  two_images: {
    nodes: [
      load,
      { ...load, id: 'in2', title: 'Second photo' },
      { id: 'stitch', type: 'ImageStitch', widgets: {} },
      save('out', 'two_images'),
    ],
    links: [
      ['in', 0, 'stitch', 'image1'],
      ['in2', 0, 'stitch', 'image2'],
      ['stitch', 0, 'out', 'images'],
    ],
    inputs: [
      ['in', 'image'],
      ['in2', 'image'],
    ],
    outputs: ['out'],
  },
  two_outputs: {
    nodes: [
      load,
      { id: 'invert', type: 'ImageInvert', widgets: {} },
      save('a', 'two_outputs_a'),
      save('b', 'two_outputs_b'),
    ],
    links: [
      ['in', 0, 'a', 'images'],
      ['in', 0, 'invert', 'image'],
      ['invert', 0, 'b', 'images'],
    ],
    inputs: [['in', 'image']],
    outputs: ['a', 'b'],
  },
  same_titles: {
    nodes: [
      { ...load, title: 'Фото' },
      { id: 'a', type: 'ImageScale', title: 'Розмір', widgets: { width: 200 } },
      { id: 'b', type: 'ImageScale', title: 'Розмір', widgets: { width: 100 } },
      save('out', 'same_titles'),
    ],
    links: [
      ['in', 0, 'a', 'image'],
      ['a', 0, 'b', 'image'],
      ['b', 0, 'out', 'images'],
    ],
    inputs: [
      ['in', 'image'],
      ['a', 'width'],
      ['b', 'width'],
    ],
    outputs: ['out'],
  },
  unusable_input: {
    nodes: [load, save('out', 'unusable_input')],
    links: [['in', 0, 'out', 'images']],
    inputs: [
      ['in', 'image'],
      ['in', 'no_such_widget'],
    ],
    outputs: ['out'],
  },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${base}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.app && window.app.graph, null, {
  timeout: 60000,
});

let failed = 0;
for (const [name, spec] of Object.entries(apps)) {
  const result = await page.evaluate(async (app) => {
    const { LiteGraph } = window;
    const comfy = window.app;
    if (app.requires && !LiteGraph.registered_node_types[app.requires]) {
      return { skipped: `${app.requires} is not installed` };
    }
    const tick = () => new Promise((r) => setTimeout(r, 100));
    comfy.graph.clear();
    const made = {};
    for (const n of app.nodes) {
      const node = LiteGraph.createNode(n.type);
      if (!node) return { error: `cannot create ${n.type}` };
      comfy.graph.add(node);
      if (n.title) node.title = n.title;
      for (const [key, value] of Object.entries(n.widgets)) {
        const widget = node.widgets.find((w) => w.name === key);
        if (!widget) return { error: `${n.type} has no widget ${key}` };
        widget.value = value;
        widget.callback?.(value);
        await tick();
      }
      made[n.id] = node;
    }
    for (const [from, slot, to, input] of app.links) {
      const at = made[to].findInputSlot(input);
      if (at < 0) return { error: `${to} has no input ${input}` };
      made[from].connect(slot, made[to], at);
    }
    await tick();
    const workflow = comfy.graph.serialize();
    workflow.extra = {
      ...workflow.extra,
      linearMode: true,
      linearData: {
        inputs: app.inputs.map(([id, widget]) => [
          widget.includes('.')
            ? `${workflow.id}:${made[id].id}:${widget}`
            : String(made[id].id),
          widget,
        ]),
        outputs: app.outputs.map((id) => String(made[id].id)),
      },
    };
    await comfy.loadGraphData(workflow, true, false);
    const { output } = await comfy.graphToPrompt();
    return { workflow, output };
  }, spec);
  if (result.skipped) {
    console.log(`SKIP ${name}: ${result.skipped}`);
    continue;
  }
  if (result.error) {
    console.log(`FAIL ${name}: ${result.error}`);
    failed++;
    continue;
  }
  writeFileSync(
    path.join(outDir, `${name}.app.json`),
    `${JSON.stringify(result.workflow, null, 2)}\n`,
  );
  writeFileSync(
    path.join(outDir, `${name}.api.json`),
    `${JSON.stringify(result.output, null, 2)}\n`,
  );
  console.log(`ok ${name}: ${Object.keys(result.output).length} nodes`);
}
await browser.close();
process.exitCode = failed ? 1 : 0;
