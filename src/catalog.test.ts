import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isImageApp, modelId, selectFiles } from './catalog.js';
import { globMatch } from './config.js';
import { info, txt2img } from './testing/fixtures.js';

test('an App Mode workflow saving images qualifies, a video one does not', () => {
  assert.equal(isImageApp(txt2img(), info), true);
  const video = txt2img();
  const save = video.nodes.find((n) => n.id === 5);
  if (save) save.type = 'SaveVideo';
  assert.equal(isImageApp(video, info), false);
});

test('a workflow without App Mode outputs does not qualify', () => {
  const wf = txt2img();
  delete wf.extra;
  assert.equal(isImageApp(wf, info), false);
});

test('only .app.json files minus the excluded ones are read', () => {
  const files = [
    'a.app.json',
    'b_laptop.app.json',
    'old/c.app.json',
    'd.json',
    'sub/e.app.json',
  ].map((path) => ({ path, modified: 0 }));
  assert.deepEqual(
    selectFiles(files, ['old/*', '*_laptop*']).map((f) => f.path),
    ['a.app.json', 'sub/e.app.json'],
  );
  assert.equal(modelId('sub/e.app.json'), 'sub/e');
});

test('globs: * stays in a segment, ** crosses them, case-insensitive', () => {
  assert.equal(globMatch('old/*', 'old/a.app.json'), true);
  assert.equal(globMatch('old/*', 'old/x/a.app.json'), false);
  assert.equal(globMatch('old/**', 'old/x/a.app.json'), true);
  assert.equal(globMatch('*_LAPTOP*', 'q_laptop.app.json'), true);
});
