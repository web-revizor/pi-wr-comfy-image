import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appInputs, describeInputs, promptInput } from './appInputs.js';
import { ParamsError, resolveParams } from './params.js';
import { info, txt2img } from './testing/fixtures.js';

const wf = txt2img();
wf.nodes.push({
  id: 40,
  type: 'LoadImage',
  title: 'Photo',
  widgets_values: ['in.png', 'image'],
});
wf.extra?.linearData?.inputs?.push(['40', 'image']);
const inputs = appInputs(wf, info);
const prompt = promptInput(inputs, wf, info);

test('App Mode inputs carry key, alias, label, type and choices', () => {
  const seed = inputs.find((i) => i.key === '4.seed');
  assert.deepEqual(
    {
      alias: seed?.alias,
      label: seed?.label,
      kind: seed?.kind,
      control: seed?.control,
    },
    { alias: 'seed', label: 'Sampler', kind: 'int', control: 'randomize' },
  );
  assert.deepEqual(inputs.find((i) => i.key === '4.sampler_name')?.choices, [
    'euler',
    'dpmpp_2m',
  ]);
  assert.equal(inputs.find((i) => i.key === '40.image')?.kind, 'image');
  assert.equal(prompt?.key, '2.text');
});

test('the tool lists the prompt and image inputs by role', () => {
  const text = describeInputs('t2i', inputs, prompt);
  assert.match(text, /prompt ← 2\.text/);
  assert.match(text, /image#1 ← 40\.image/);
});

test('plain text goes to the prompt, a JSON block sets inputs by key or alias', () => {
  const r = resolveParams(
    [
      { type: 'text', text: 'a fox' },
      {
        type: 'text',
        text: '{"cfg": 3.5, "4.sampler_name": "dpmpp_2m", "seed": 5}',
      },
    ],
    inputs,
    prompt,
  );
  assert.equal(r.values.get('2.text'), 'a fox');
  assert.equal(r.values.get('4.cfg'), 3.5);
  assert.equal(r.values.get('4.sampler_name'), 'dpmpp_2m');
  assert.deepEqual(r.seeds, { '4.seed': 5 });
});

test('a randomize seed gets a new value per run unless given', () => {
  const r = resolveParams(
    [{ type: 'text', text: 'x' }],
    inputs,
    prompt,
    () => 0.5,
  );
  assert.equal(r.values.get('4.seed'), 2 ** 49);
});

test('images go to the image inputs in order', () => {
  const r = resolveParams(
    [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
    inputs,
    prompt,
  );
  assert.deepEqual(r.images, [
    { key: '40.image', data: 'AAAA', mimeType: 'image/png' },
  ]);
  assert.throws(
    () =>
      resolveParams(
        [
          { type: 'image', data: 'A', mimeType: 'image/png' },
          { type: 'image', data: 'B', mimeType: 'image/png' },
        ],
        inputs,
        prompt,
      ),
    ParamsError,
  );
});

test('unknown keys, wrong types and values outside the choices are refused', () => {
  const bad = (json: string): RegExp | undefined => {
    try {
      resolveParams([{ type: 'text', text: json }], inputs, prompt);
    } catch (e) {
      assert.ok(e instanceof ParamsError);
      return undefined;
    }
    assert.fail(`accepted ${json}`);
  };
  bad('{"steps": 4}');
  bad('{"cfg": "high"}');
  bad('{"sampler_name": "lms"}');
  bad('{"seed": 1.5}');
  bad('{"cfg": 1000}');
});
