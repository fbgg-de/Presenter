import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = mkdtempSync(join(tmpdir(), 'presenter-metric-units-'));
await build({
  entryPoints: [
    'src/renderer/src/utils/metricSession.ts',
    'src/renderer/src/utils/metricQueue.ts',
    'src/renderer/src/admin/metrics/metricsUtils.ts',
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: dir,
  outExtension: { '.js': '.mjs' },
});
const S = await import(pathToFileURL(join(dir, 'utils/metricSession.mjs')));
const Q = await import(pathToFileURL(join(dir, 'utils/metricQueue.mjs')));
const U = await import(pathToFileURL(join(dir, 'admin/metrics/metricsUtils.mjs')));
let now = Date.UTC(2026, 9, 9, 9),
  id = 0;
const session = S.createMetricSession(
  () => now,
  () => `session-${++id}`,
);
const first = session('show_loaded', 'a');
assert.equal(first.session_id, 'session-1');
assert.equal(first.session_sequence, 1);
assert.equal(first.workflow_previous, undefined);
session('setting_changed', 'a');
const next = session('song_selected', 'a');
assert.equal(next.workflow_previous, 'show_loaded');
assert.equal(next.session_sequence, 3);
now += 30 * 60 * 1000;
const expired = session('block_navigated', 'a');
assert.equal(expired.session_id, 'session-2');
assert.equal(expired.workflow_previous, undefined);
assert.equal(session('show_loaded', 'b').session_id, 'session-3');
assert.equal(session('login', 'b').session_id, 'session-4');
const secondWindow = S.createMetricSession(
  () => now,
  () => 'other-window',
);
assert.equal(secondWindow('window_opened', 'b').workflow_previous, undefined);
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
Q.enqueueMetric({ event: 'show_loaded', metadata: first });
Q.enqueueMetric({ event: 'song_selected', metadata: next });
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
const sent = [];
const flush = Q.flushMetricQueue(async (payload) => {
  sent.push(payload);
  await gate;
  if (payload.event === 'song_selected') throw new Error('offline');
});
const duplicate = Q.flushMetricQueue(async () => {
  throw new Error('duplicate flush must not send');
});
Q.enqueueMetric({ event: 'window_opened' });
release();
await Promise.all([flush, duplicate]);
assert.equal(sent.length, 2);
assert.equal(sent[0].metadata.session_id, 'session-1');
assert.equal(sent[1].metadata.workflow_previous, 'show_loaded');
assert.deepEqual(
  Q.peekQueue().map((row) => row.event),
  ['song_selected', 'window_opened'],
);
await Q.flushMetricQueue(async () => {});
assert.equal(Q.peekQueue().length, 0);
localStorage.setItem('presenter_metrics_offline_queue', JSON.stringify([{ event: 'legacy', queued_at: '2026-01-01' }]));
const legacy = Q.peekQueue()[0].queue_id;
assert.ok(legacy);
assert.equal(Q.peekQueue()[0].queue_id, legacy);
Q.clearQueue();
for (let i = 0; i < 501; i++) Q.enqueueMetric({ event: String(i) });
assert.equal(Q.peekQueue().length, 500);
assert.equal(Q.peekQueue()[0].event, '1');
assert.deepEqual(U.calendarBuckets('2026-09-30', '2026-10-02'), ['2026-09-30', '2026-10-01', '2026-10-02']);
assert.deepEqual(U.calendarBuckets('2026-10-09', '2026-10-13', 'week'), ['2026-10-05', '2026-10-12']);
assert.deepEqual(U.calendarBuckets('2026-01-31', '2026-03-01', 'month'), ['2026-01-01', '2026-02-01', '2026-03-01']);
assert.equal(U.percentChange(20, 0), null);
assert.equal(U.percentChange(0, 10), -100);
const csv = U.csvText([
  { title: '=HYPERLINK("evil")', events: 2 },
  { title: 'line\nbreak', events: 3, extra: '@SUM(1)' },
]);
assert.ok(csv.includes("'=HYPERLINK"));
assert.ok(csv.includes("'@SUM"));
assert.ok(csv.includes('"extra"'));
console.log(
  'PASS: window-scoped sessions, action ordering, idle/device/login rotation, partial offline failures, concurrent queue appends and flushes, legacy queue, calendar buckets, honest zero baselines, safe CSV',
);
