import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL, next } from './watchdog.mjs';

const run = (seq) => {
  let state = INITIAL;
  const alerts = [];
  for (const problems of seq) {
    const r = next(state, problems);
    state = r.state;
    if (r.alert) alerts.push(r.alert);
  }
  return alerts;
};

test('healthy from the start: no alert', () => {
  assert.deepEqual(run([[], [], []]), []);
});

test('one bad check is noise, two in a row alert once', () => {
  assert.deepEqual(run([[], ['RPC'], []]), []);
  const alerts = run([['RPC'], ['RPC'], ['RPC'], ['RPC']]);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /RPC/);
});

test('recovery is announced once', () => {
  const alerts = run([['worker'], ['worker'], [], [], []]);
  assert.equal(alerts.length, 2);
  assert.match(alerts[1], /recovered/);
});

test('a new problem on top of an old one alerts again', () => {
  const alerts = run([['RPC'], ['RPC'], ['RPC', 'gas'], ['gas', 'RPC']]);
  assert.equal(alerts.length, 2);
  assert.match(alerts[1], /gas/);
});
