import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FailureGuard } from './guard.js';

test('a workflow is refused after two failures in a row, with the reason', () => {
  const guard = new FailureGuard(() => 0);
  guard.fail('a', 'no model.');
  guard.check('a');
  guard.fail('a', 'no model.');
  assert.throws(() => guard.check('a'), /Stop\. Tell the user: no model\./);
  guard.check('b');
});

test('a success clears the failures', () => {
  const guard = new FailureGuard(() => 0);
  guard.fail('a', 'x');
  guard.succeed('a');
  guard.fail('a', 'x');
  guard.check('a');
});

test('the block ends after a while, so a fixed workflow can run', () => {
  let now = 0;
  const guard = new FailureGuard(() => now);
  guard.fail('a', 'x');
  guard.fail('a', 'x');
  now = 120_000;
  guard.check('a');
  guard.fail('a', 'x');
  guard.check('a');
});
