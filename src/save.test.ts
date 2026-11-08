import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { saveImages } from './save.js';

const png = (text: string) => ({
  data: Buffer.from(text).toString('base64'),
  mimeType: 'image/png',
});

test('two runs in the same second keep both files', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pi-comfy-save-'));
  try {
    const [first] = saveImages(dir, 'a-1', [png('one')]);
    const [second] = saveImages(dir, 'a-1', [png('two')]);
    assert.notEqual(first, second);
    assert.equal(readFileSync(first ?? '', 'utf8'), 'one');
    assert.equal(readFileSync(second ?? '', 'utf8'), 'two');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('several images of one run are numbered', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pi-comfy-save-'));
  try {
    const files = saveImages(dir, 'a', [png('1'), png('2')]);
    assert.deepEqual(
      files.map((f) => path.basename(f)),
      ['a-1.png', 'a-2.png'],
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});
