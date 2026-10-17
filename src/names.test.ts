import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortNames, titleSlug } from './names.js';

test('titles become short snake_case names', () => {
  assert.equal(titleSlug('🎲 SEED: fixed = same image'), 'seed');
  assert.equal(titleSlug('Long side (px, after hires)'), 'long_side');
  assert.equal(titleSlug('3. Variants per run'), 'variants_per_run');
  assert.equal(titleSlug('Mode: i2i / t2i / edit'), 'mode');
  assert.equal(titleSlug('📐 Output long side (px)'), 'output_long_side');
  assert.equal(
    titleSlug('Lenovo UltraReal (realism; 0 = off)'),
    'lenovo_ultrareal',
  );
});

test('names are unique: specific widgets keep their name, clashes take more of the title', () => {
  const names = shortNames([
    { key: '10.cfg', label: 'KSampler', widget: 'cfg' },
    { key: '122.value', label: '⚙ Custom: steps generation', widget: 'value' },
    { key: '123.value', label: '⚙ Custom: steps hires', widget: 'value' },
    { key: '46.switch', label: 'Prompt: true = auto', widget: 'switch' },
    { key: '7.value', label: 'Same', widget: 'value' },
    { key: '8.value', label: 'Same', widget: 'value' },
  ]);
  assert.deepEqual(names, [
    'cfg',
    'custom_steps_generation',
    'custom_steps_hires',
    'prompt_true_auto',
    'same_7',
    'same_8',
  ]);
});
