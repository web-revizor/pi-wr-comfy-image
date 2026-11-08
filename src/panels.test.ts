import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appInputs, describeInputs, promptInput } from './appInputs.js';
import { catalogEntry } from './catalog.js';
import {
  type InputSpec,
  type ObjectInfo,
  type UiWorkflow,
} from './comfy/types.js';
import { type Config } from './config.js';
import { toApiPrompt } from './convert/toApiPrompt.js';
import { shortNames } from './names.js';
import { panelApp, panelInfo as info } from './testing/fixtures.js';

const config: Config = {
  url: 'http://127.0.0.1:8188',
  exclude: [],
  timeoutMs: 1000,
  promptInput: {},
};

test('child widgets of a dynamic combo resolve from their App Mode locator', () => {
  const inputs = appInputs(panelApp(), info);
  assert.deepEqual(
    inputs.map((i) => i.key),
    ['10.switch', '10.switch.photo', '10.switch.prompt', '10.switch.steps'],
  );
  assert.equal(inputs[1]?.kind, 'image');
  assert.equal(inputs[2]?.default, 'hello');
});

test('a child of an option that is not selected takes its type and default from that option', () => {
  const steps = appInputs(panelApp(), info).at(-1);
  assert.deepEqual(
    { kind: steps?.kind, value: steps?.default, min: steps?.min },
    { kind: 'int', value: 8, min: 1 },
  );
});

test('a multi-line child widget is found as the prompt', () => {
  const wf = panelApp();
  const inputs = appInputs(wf, info);
  assert.equal(promptInput(inputs, wf, info)?.key, '10.switch.prompt');
});

test('switching the option sends that option’s fields, not the saved one’s', () => {
  const node = toApiPrompt(
    panelApp(),
    info,
    new Map<string, unknown>([['10.switch', 't2i']]),
  )['10'];
  assert.deepEqual(node?.inputs, {
    switch: 't2i',
    'switch.prompt': 'hello',
    'switch.steps': 8,
  });
});

test('a dynamic combo nested in another keeps its current fields only', () => {
  const combo = (options: unknown[]): InputSpec =>
    ['COMFY_DYNAMICCOMBO_V3', { options }] as InputSpec;
  const nested: ObjectInfo = {
    Nested: {
      input: {
        required: {
          format: combo([
            {
              key: 'mp4',
              inputs: {
                required: {
                  codec: combo([
                    {
                      key: 'h264',
                      inputs: { required: { mode: ['STRING', {}] } },
                    },
                    {
                      key: 'av1',
                      inputs: { required: { crf: ['INT', { default: 30 }] } },
                    },
                  ]),
                },
              },
            },
          ]),
        },
      },
      output: ['STRING'],
      output_node: false,
    },
  };
  const wf: UiWorkflow = {
    nodes: [{ id: 1, type: 'Nested', widgets_values: ['mp4', 'h264', 'x'] }],
    links: [],
  };
  assert.deepEqual(toApiPrompt(wf, nested)['1']?.inputs, {
    format: 'mp4',
    'format.codec': 'h264',
    'format.codec.mode': 'x',
  });
  const switched = new Map<string, unknown>([['1.format.codec', 'av1']]);
  assert.deepEqual(toApiPrompt(wf, nested, switched)['1']?.inputs, {
    format: 'mp4',
    'format.codec': 'av1',
    'format.codec.crf': 30,
  });
});

test('inputs that cannot be resolved are reported, not dropped silently', () => {
  const wf = panelApp();
  wf.extra?.linearData?.inputs?.push(['elsewhere:9:lost', 'lost']);
  const entry = catalogEntry('a.app.json', 0, wf, info, config);
  assert.deepEqual(entry.unresolved, ['elsewhere:9:lost.lost']);
  assert.match(
    describeInputs('a', entry.inputs, undefined, false, {
      unresolved: entry.unresolved,
    }),
    /not usable from pi: elsewhere:9:lost\.lost/,
  );
});

test('a widget the node no longer has is reported, not offered as a param', () => {
  const wf = panelApp();
  wf.extra?.linearData?.inputs?.push(['10', 'renamed']);
  const entry = catalogEntry('a.app.json', 0, wf, info, config);
  assert.deepEqual(entry.unresolved, ['10.renamed']);
  assert.ok(!entry.inputs.some((i) => i.key === '10.renamed'));
});

test('child widgets are named by their last part, clashes by node title', () => {
  assert.deepEqual(
    shortNames([
      { key: '1.switch.photo', label: 'Mode', widget: 'switch.photo' },
      { key: '1.switch.denoise', label: 'Mode', widget: 'switch.denoise' },
      { key: '2.switch.denoise', label: 'Hires', widget: 'switch.denoise' },
    ]),
    ['photo', 'mode_denoise', 'hires_denoise'],
  );
});
