import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type UiWorkflow } from '../comfy/types.js';
import { info, txt2img } from '../testing/fixtures.js';
import { ConvertError, savedNode, toApiPrompt } from './toApiPrompt.js';

test('widgets take their names from object_info and skip the seed control value', () => {
  const prompt = toApiPrompt(txt2img(), info);
  assert.deepEqual(prompt['4']?.inputs, {
    seed: 42,
    steps: 20,
    cfg: 7,
    sampler_name: 'euler',
    model: ['1', 0],
    positive: ['2', 0],
    latent_image: ['3', 0],
  });
  assert.deepEqual(prompt['2']?.inputs, { text: 'a cat', clip: ['1', 1] });
});

test('frontend-only nodes never reach the prompt', () => {
  assert.equal(toApiPrompt(txt2img(), info)['6'], undefined);
});

test('overrides replace saved values by node path and widget', () => {
  const prompt = toApiPrompt(
    txt2img(),
    info,
    new Map<string, unknown>([
      ['4.seed', 7],
      ['2.text', 'a dog'],
    ]),
  );
  assert.equal(prompt['4']?.inputs.seed, 7);
  assert.equal(prompt['2']?.inputs.text, 'a dog');
});

test('the saved control mode is reported for seeds', () => {
  assert.equal(
    savedNode(txt2img(), info, '4')?.controls.get('seed'),
    'randomize',
  );
});

test('a reroute is followed to its source', () => {
  const wf = txt2img();
  wf.nodes.push({
    id: 9,
    type: 'Reroute',
    inputs: [{ name: '', type: '*', link: 5 }],
  });
  wf.links = wf.links.filter((l) => (Array.isArray(l) ? l[0] !== 5 : true));
  wf.links.push([5, 4, 0, 9, 0, 'IMAGE'], [6, 9, 0, 5, 0, 'IMAGE']);
  const save = wf.nodes.find((n) => n.id === 5);
  if (save?.inputs?.[0]) save.inputs[0].link = 6;
  assert.deepEqual(toApiPrompt(wf, info)['5']?.inputs.images, ['4', 0]);
});

test('a bypassed node passes its same-typed input through, a muted one drops out', () => {
  const wf = txt2img();
  wf.nodes.push({
    id: 10,
    type: 'ImageInvert',
    mode: 4,
    inputs: [{ name: 'image', type: 'IMAGE', link: 5 }],
    outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [7] }],
  });
  wf.links.push([7, 10, 0, 5, 0, 'IMAGE']);
  const save = wf.nodes.find((n) => n.id === 5);
  if (save?.inputs?.[0]) save.inputs[0].link = 7;
  const bypassed = toApiPrompt(wf, info);
  assert.equal(bypassed['10'], undefined);
  assert.deepEqual(bypassed['5']?.inputs.images, ['4', 0]);

  const invert = wf.nodes.find((n) => n.id === 10);
  if (invert) invert.mode = 2;
  const muted = toApiPrompt(wf, info);
  assert.equal(muted['10'], undefined);
  assert.equal(muted['5']?.inputs.images, undefined);
});

test('Set/Get nodes connect by name', () => {
  const wf = txt2img();
  wf.nodes.push(
    {
      id: 11,
      type: 'SetNode',
      inputs: [{ name: 'IMAGE', type: 'IMAGE', link: 5 }],
      widgets_values: ['img'],
    },
    {
      id: 12,
      type: 'GetNode',
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [8] }],
      widgets_values: ['img'],
    },
  );
  wf.links.push([8, 12, 0, 5, 0, 'IMAGE']);
  const save = wf.nodes.find((n) => n.id === 5);
  if (save?.inputs?.[0]) save.inputs[0].link = 8;
  assert.deepEqual(toApiPrompt(wf, info)['5']?.inputs.images, ['4', 0]);
});

/** Subgraph wrapping a KSampler; its cfg is promoted to the instance as a widget. */
function withSubgraph(): UiWorkflow {
  const wf = txt2img();
  const sampler = wf.nodes.find((n) => n.id === 4);
  wf.nodes = wf.nodes.filter((n) => n.id !== 4);
  wf.nodes.push({
    id: 20,
    type: 'sg-1',
    inputs: [
      { name: 'model', type: 'MODEL', link: 2 },
      { name: 'positive', type: 'CONDITIONING', link: 3 },
      { name: 'latent', type: 'LATENT', link: 4 },
      { name: 'cfg', type: 'FLOAT', widget: { name: 'cfg' }, link: null },
    ],
    outputs: [{ name: 'LATENT', type: 'LATENT', links: [5] }],
    widgets_values: [3.5],
  });
  wf.links = wf.links.map((l) => {
    if (!Array.isArray(l)) return l;
    const [id, o, os, t, ts, type] = l;
    return [
      id,
      o === 4 ? 20 : o,
      os,
      t === 4 ? 20 : t,
      id === 4 ? 2 : ts,
      type,
    ];
  });
  wf.definitions = {
    subgraphs: [
      {
        id: 'sg-1',
        inputs: [
          { name: 'model', type: 'MODEL' },
          { name: 'positive', type: 'CONDITIONING' },
          { name: 'latent', type: 'LATENT' },
          { name: 'cfg', type: 'FLOAT' },
        ],
        outputs: [{ name: 'LATENT', type: 'LATENT' }],
        nodes: [
          {
            ...sampler!,
            id: 7,
            inputs: [
              { name: 'model', type: 'MODEL', link: 101 },
              { name: 'positive', type: 'CONDITIONING', link: 102 },
              { name: 'latent_image', type: 'LATENT', link: 103 },
              {
                name: 'cfg',
                type: 'FLOAT',
                widget: { name: 'cfg' },
                link: 104,
              },
            ],
          },
        ],
        links: [
          {
            id: 101,
            origin_id: -10,
            origin_slot: 0,
            target_id: 7,
            target_slot: 0,
            type: 'MODEL',
          },
          {
            id: 102,
            origin_id: -10,
            origin_slot: 1,
            target_id: 7,
            target_slot: 1,
            type: 'CONDITIONING',
          },
          {
            id: 103,
            origin_id: -10,
            origin_slot: 2,
            target_id: 7,
            target_slot: 2,
            type: 'LATENT',
          },
          {
            id: 104,
            origin_id: -10,
            origin_slot: 3,
            target_id: 7,
            target_slot: 3,
            type: 'FLOAT',
          },
          {
            id: 105,
            origin_id: 7,
            origin_slot: 0,
            target_id: -20,
            target_slot: 0,
            type: 'LATENT',
          },
        ],
      },
    ],
  };
  return wf;
}

test('subgraphs flatten into prefixed ids, with promoted widgets and outputs joined', () => {
  const prompt = toApiPrompt(withSubgraph(), info);
  assert.equal(prompt['20'], undefined);
  assert.deepEqual(prompt['20:7']?.inputs.model, ['1', 0]);
  assert.equal(prompt['20:7']?.inputs.cfg, 3.5);
  assert.deepEqual(prompt['5']?.inputs.images, ['20:7', 0]);
});

test('a promoted widget can be overridden on the instance', () => {
  const prompt = toApiPrompt(withSubgraph(), info, new Map([['20.cfg', 9]]));
  assert.equal(prompt['20:7']?.inputs.cfg, 9);
});

test('a node type ComfyUI does not have is an error naming the node', () => {
  const wf = txt2img();
  wf.nodes.push({ id: 30, type: 'MissingNode', title: 'Upscaler' });
  assert.throws(
    () => toApiPrompt(wf, info),
    (e: Error) => {
      assert.ok(e instanceof ConvertError);
      assert.match(e.message, /Upscaler.*MissingNode/);
      return true;
    },
  );
});

test('a widget the saved workflow predates gets its default', () => {
  const wf = txt2img();
  const latent = wf.nodes.find((n) => n.id === 3);
  if (latent) latent.widgets_values = [640, 480];
  assert.equal(toApiPrompt(wf, info)['3']?.inputs.batch_size, 1);
});
