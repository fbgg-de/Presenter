import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'presenter-cue-'));
for (const name of ['engine', 'framing'])
  writeFileSync(
    join(dir, `${name}.mjs`),
    ts.transpileModule(readFileSync(`src/renderer/src/media/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );
const { advanceCue, commandCue, followClock, initialTransport, lyricAt, lyricOccurrences, setSyncTolerance, syncTolerance, validateCue } = await import(
  pathToFileURL(join(dir, 'engine.mjs'))
);
const { frameGeometry } = await import(pathToFileURL(join(dir, 'framing.mjs')));
const region = (id, kind, start, end, enabled = true) => ({
  id,
  kind: kind === 'pause' ? 'pause' : 'section',
  loop: kind === 'loop',
  start,
  end,
  name: id,
  enabled,
});
const cue = {
  id: 'cue',
  name: 'Cue',
  duration: 100,
  sources: [],
  assignments: [],
  regions: [
    region('a', 'loop', 10, 20),
    region('b', 'loop', 18, 30),
    region('hold', 'pause', 15, 16),
    region('v', 'lyric', 10, 18),
    region('c', 'lyric', 17, 30),
  ],
};
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log('PASS', name);
}
const start = () => commandCue(cue, initialTransport('session'), { type: 'play' });
test('automatic loop entry and exact hold crossed by a long update', () => {
  const t = advanceCue(cue, start(), 80);
  assert.equal(t.time, 15);
  assert.equal(t.pausedAt, 'hold');
  assert.equal(t.activeLoop, 'a');
  assert.equal(t.playing, false);
});
test('resume passes hold once and pauses on the next lap', () => {
  const held = advanceCue(cue, start(), 15);
  const resumed = commandCue(cue, held, { type: 'play' });
  assert.equal(advanceCue(cue, resumed, 1).time, 16);
  assert.equal(advanceCue(cue, resumed, 11).pausedAt, 'hold');
});
test('disabling a held pause preserves navigation resume reason', () => {
  let t = advanceCue(cue, start(), 15);
  t = commandCue(cue, t, { type: 'enable', id: 'hold', enabled: false });
  assert.equal(t.playing, false);
  t = commandCue(cue, t, { type: 'seek', time: 40, navigate: true });
  assert.equal(t.playing, true);
  assert.equal(t.activeLoop, undefined);
});
test('manual pause stays paused on navigation', () => {
  const t = commandCue(cue, commandCue(cue, start(), { type: 'pause' }), { type: 'seek', time: 50, navigate: true });
  assert.equal(t.playing, false);
});
test('exit bypasses containing overlap, adjacent future loop still enters', () => {
  const c = { ...cue, regions: [region('a', 'loop', 10, 20), region('b', 'loop', 18, 30), region('next', 'loop', 20, 40)] };
  let t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 12);
  t = commandCue(c, t, { type: 'exit' });
  t = advanceCue(c, t, 9);
  assert.equal(t.activeLoop, 'next');
  assert.equal(t.time, 21);
});
test('queued overlapping loop lands on its beginning', () => {
  let t = advanceCue(cue, start(), 12);
  t = commandCue(cue, t, { type: 'enable', id: 'hold', enabled: false });
  t = commandCue(cue, t, { type: 'queue', id: 'b' });
  t = advanceCue(cue, t, 9);
  assert.equal(t.activeLoop, 'b');
  assert.equal(t.time, 19);
});
test('hold wins a tie at loop end, resume resolves pending exit', () => {
  const c = { ...cue, regions: [region('a', 'loop', 10, 20), region('p', 'pause', 20, 21)] };
  let t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 12);
  t = commandCue(c, t, { type: 'exit' });
  t = advanceCue(c, t, 10);
  assert.equal(t.time, 20);
  assert.equal(t.exitLoop, true);
  t = advanceCue(c, commandCue(c, t, { type: 'play' }), 1);
  assert.equal(t.time, 21);
  assert.equal(t.activeLoop, undefined);
});
test('loop landing at a pause fires, skipped intervals do not', () => {
  const c = {
    ...cue,
    regions: [region('a', 'loop', 10, 20), region('b', 'loop', 40, 50), region('p', 'pause', 40, 41), region('skip', 'pause', 30, 31)],
  };
  let t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 12);
  t = commandCue(c, t, { type: 'queue', id: 'b' });
  t = advanceCue(c, t, 10);
  assert.equal(t.pausedAt, 'p');
  assert.equal(t.time, 40);
});
test('many tiny event-free loops are resolved without polling loss', () => {
  const c = { ...cue, regions: [region('tiny', 'loop', 0, 0.01)] };
  const t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 1000000.005);
  assert.ok(Math.abs(t.time - 0.005) < 0.0001);
});
test('stop retains runtime arming choices and clears transient intent', () => {
  const t = commandCue(cue, { ...start(), enabled: { a: false }, nextLoop: 'b', pausedAt: 'hold' }, { type: 'stop' });
  assert.equal(t.enabled.a, false);
  assert.equal(t.nextLoop, undefined);
  assert.equal(t.pausedAt, undefined);
  assert.equal(t.time, 0);
});
test('latest overlapping lyric wins; underlying section returns', () => {
  const c = { ...cue, regions: [region('base', 'lyric', 0, 50), region('overlay', 'lyric', 10, 20)] };
  assert.equal(lyricAt(c, 15).id, 'overlay');
  assert.equal(lyricAt(c, 20).id, 'base');
});
test('raw and presentation lyric signatures agree, reorder invalidates', () => {
  const a = lyricOccurrences([
    { name: 'V', lines: ['[EN] Hello'] },
    { name: 'C', lines: ['World'] },
  ]);
  const b = lyricOccurrences([
    { name: 'V', lines: [{ text: 'Hello', language: 'EN' }] },
    { name: 'C', lines: [{ text: 'World' }] },
  ]);
  assert.equal(a.signature, b.signature);
  assert.notEqual(a.signature, lyricOccurrences([{ name: 'C' }, { name: 'V' }]).signature);
});
test('commands do not mutate published snapshots', () => {
  const t = start();
  const before = JSON.stringify(t);
  commandCue(cue, t, { type: 'queue', id: 'b' });
  advanceCue(cue, t, 20);
  assert.equal(JSON.stringify(t), before);
});
test('invalid ranges and references cannot be saved', () => {
  assert.equal(validateCue(cue), undefined);
  assert.equal(validateCue({ ...cue, regions: [region('x', 'loop', 20, 10)] }), 'regions');
  assert.equal(validateCue({ ...cue, assignments: [{ role: 'left', sourceId: 'missing' }] }), 'assignments');
});
test('two source crops use disjoint halves with identical placement', () => {
  const frame = { crop: { x: 0, y: 0, w: 0.5, h: 1 }, x: 50, y: 50, scale: 100, fit: 'fill', blur: 10 };
  const left = frameGeometry(frame, 1920, 1080, 3840, 1080),
    right = frameGeometry({ ...frame, crop: { ...frame.crop, x: 0.5 } }, 1920, 1080, 3840, 1080);
  assert.equal(Math.abs(left.source.left), 0);
  assert.equal(right.source.left, -1920);
  assert.deepEqual(left.placement, right.placement);
  assert.equal(frameGeometry(frame, 960, 540, 3840, 1080).blur, 5);
});
test('millisecond pause widths remain valid despite floating point representation', () => {
  assert.equal(validateCue({ ...cue, regions: [region('p', 'pause', 19.321, 19.322)] }), undefined);
});
test('invalid crop geometry and audio settings are rejected before publication', () => {
  const frame = { crop: { x: 0, y: 0, w: 1, h: 1 }, x: 50, y: 50, scale: 100, fit: 'contain', blur: 0 };
  assert.equal(
    validateCue({ ...cue, assignments: [{ role: 'screen', sourceId: null, frame: { ...frame, crop: { ...frame.crop, w: 0 } } }] }),
    'assignments',
  );
  assert.equal(validateCue({ ...cue, audioEnabled: 'invalid' }), 'sources');
});
test('mapped sections loop independently of lyric mapping and unmapped overlaps', () => {
  const c = {
    ...cue,
    regions: [
      { id: 'mapped', kind: 'section', loop: true, start: 1, end: 3, name: 'Chorus' },
      { id: 'free', kind: 'section', start: 1.5, end: 2.5, name: 'Unmapped' },
    ],
  };
  const map = { mapped: 'chorus-block' };
  assert.equal(lyricAt(c, 2, map).id, 'mapped');
  let t = commandCue(c, initialTransport('test'), { type: 'play' });
  t = advanceCue(c, t, 3.5);
  assert.equal(t.activeLoop, 'mapped');
  assert.equal(t.time, 1.5);
  t = commandCue(c, t, { type: 'enable', id: 'mapped', enabled: false });
  assert.equal(t.activeLoop, undefined);
  assert.equal(lyricAt(c, t.time, map).id, 'mapped');
  assert.equal(validateCue(c), undefined);
});
test('a looping version starts again at the end, keeping the time past it', () => {
  const c = { ...cue, duration: 10, loop: true, regions: [] };
  const t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 23);
  assert.equal(t.playing, true);
  assert.ok(Math.abs(t.time - 3) < 1e-6);
});
test('without loop it stops at the end', () => {
  const c = { ...cue, duration: 10, regions: [] };
  const t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 23);
  assert.equal(t.playing, false);
  assert.equal(t.time, 10);
});
test('a pause at the very beginning holds a looping version on its next lap', () => {
  const c = { ...cue, duration: 10, loop: true, regions: [region('p', 'pause', 0, 0.5)] };
  const t = advanceCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), 12);
  assert.equal(t.pausedAt, 'p');
  assert.equal(t.time, 0);
});
test('playback speed: the clock counts media time at the chosen rate', () => {
  const c = { ...cue, duration: 100, regions: [] };
  const fast = commandCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), { type: 'rate', rate: 1.5 });
  assert.equal(advanceCue(c, fast, 10).time, 15);
  const slow = commandCue(c, fast, { type: 'rate', rate: 0.5 });
  assert.equal(advanceCue(c, slow, 10).time, 5);
});
test('playback speed: holds and loops are reached in media time', () => {
  // The hold at 15 s is 7.5 wall seconds away at 2×.
  const t = advanceCue(cue, commandCue(cue, start(), { type: 'rate', rate: 2 }), 7.5);
  assert.equal(t.time, 15);
  assert.equal(t.pausedAt, 'hold');
  // A looping version wraps at the same media point whatever the speed.
  const c = { ...cue, duration: 10, loop: true, regions: [] };
  const looped = advanceCue(c, commandCue(c, commandCue(c, initialTransport('s'), { type: 'play' }), { type: 'rate', rate: 2 }), 6);
  assert.ok(Math.abs(looped.time - 2) < 1e-6);
});
test('playback speed: normal speed leaves no field, limits hold, stop keeps the choice', () => {
  const c = { ...cue, duration: 100, regions: [] };
  let t = commandCue(c, initialTransport('s'), { type: 'rate', rate: 1.25 });
  assert.equal(t.rate, 1.25);
  assert.equal(commandCue(c, t, { type: 'rate', rate: 1 }).rate, undefined);
  assert.equal(commandCue(c, t, { type: 'rate', rate: 99 }).rate, 4);
  assert.equal(commandCue(c, t, { type: 'rate', rate: 0.01 }).rate, 0.25);
  assert.equal(commandCue(c, t, { type: 'rate', rate: NaN }), t);
  t = commandCue(c, commandCue(c, t, { type: 'play' }), { type: 'stop' });
  assert.equal(t.rate, 1.25);
  assert.equal(t.time, 0);
});
test('following the clock: small drift is nudged, big drift is sought, the speed is kept', () => {
  assert.deepEqual(followClock(10, 10.01, 1), { playbackRate: 1, nudge: 0 });
  // 0.2 s behind: play 10 % faster, no seek (a seek would stutter every crop of the video).
  const behind = followClock(10.2, 10, 1);
  assert.equal(behind.seek, undefined);
  assert.ok(Math.abs(behind.playbackRate - 1.1) < 1e-9);
  // Ahead at 1.5×: slower than 1.5, never a jump.
  const ahead = followClock(10, 10.1, 1.5);
  assert.equal(ahead.seek, undefined);
  assert.ok(ahead.playbackRate < 1.5 && ahead.playbackRate > 1.5 * 0.9);
  // A seek or a loop wrap: go there.
  assert.deepEqual(followClock(2, 9.8, 1.25), { seek: 2, playbackRate: 1.25, nudge: 0 });
  // A seek aims ahead by the element's seek time (in media time at the playing speed).
  assert.deepEqual(followClock(2, 9.8, 2, 0.25), { seek: 2.5, playbackRate: 2, nudge: 0 });
});
test('a correction runs until settled, at one held rate, so the rate does not flip', () => {
  // Idle: 15 ms off is inside the deadband — leave it alone.
  assert.deepEqual(followClock(10.015, 10, 1), { playbackRate: 1, nudge: 0 });
  // 25 ms behind starts a correction: 1 % faster …
  assert.deepEqual(followClock(10.025, 10, 1), { playbackRate: 1.01, nudge: 0.01 });
  // … which keeps going inside the deadband instead of stopping at its edge …
  assert.deepEqual(followClock(10.015, 10, 1, 0, 0.5, 0.01), { playbackRate: 1.01, nudge: 0.01 });
  // … is raised when the drift grows, never lowered on the way back …
  assert.equal(followClock(10.06, 10, 1, 0, 0.5, 0.01).nudge, 0.03);
  assert.equal(followClock(10.025, 10, 1, 0, 0.5, 0.03).nudge, 0.03);
  // … starts over the other way after an overshoot …
  assert.equal(followClock(9.98, 10, 1, 0, 0.5, 0.03).nudge, -0.01);
  // … and ends within 5 ms.
  assert.deepEqual(followClock(10.004, 10, 1, 0, 0.5, 0.03), { playbackRate: 1, nudge: 0 });
  // Simulated: drift around the old 20 ms edge with ±3 ms timer jitter. The old rule wrote the rate
  // 38 times in these 600 ticks and never pulled the drift in; now: start, end.
  let nudge = 0, rate = 1, writes = 0, drift = 0.021;
  for (let tick = 0; tick < 600; tick++) {
    const jitter = ((tick * 7919) % 7) / 1000 - 0.003;
    const f = followClock(10 + drift + jitter, 10, 1, 0, 0.5, nudge);
    nudge = f.nudge;
    if (Math.abs(f.playbackRate - rate) > 0.002) { rate = f.playbackRate; writes++; }
    drift -= (rate - 1) * 0.016; // the rate pulls the drift in, one 16 ms tick at a time
  }
  assert.ok(writes <= 2, `rate written ${writes} times`);
  assert.ok(Math.abs(drift) < 0.01);
});
test('at higher speed the thresholds are real time, and a fresh seek only nudges', () => {
  // 3×: 45 ms of media is 15 ms late in real time — inside the deadband, left alone.
  assert.deepEqual(followClock(10.045, 10, 3), { playbackRate: 3, nudge: 0 });
  // 1.2 s of media behind at 3× is 0.4 s late: nudged, not a seek (a 0.3 s seek would cost 0.9 s).
  const nudged = followClock(11.2, 10, 3);
  assert.equal(nudged.seek, undefined);
  assert.ok(nudged.playbackRate > 3 && nudged.playbackRate <= 3.3 + 1e-9);
  // 1.8 s of media is 0.6 s late: past the 0.5 s tolerance, sought — aimed ahead by the lead at 3×.
  assert.deepEqual(followClock(11.8, 10, 3, 0.2), { seek: 12.4, playbackRate: 3, nudge: 0 });
  // Right after a seek it may not seek again: the most it does is nudge.
  const fresh = followClock(11.8, 10, 3, 0.2, 0.5, 0, false);
  assert.equal(fresh.seek, undefined);
  assert.equal(fresh.nudge, 0.1);
  assert.ok(Math.abs(fresh.playbackRate - 3.3) < 1e-9);
});
test('the sync tolerance decides what is a jump', () => {
  // 0.8 s behind: nudged at a 1 s tolerance, sought at the default 0.5 s.
  assert.equal(followClock(10.8, 10, 1, 0, 1).seek, undefined);
  assert.equal(followClock(10.8, 10, 1).seek, 10.8);
  // 0.2 s behind at 0.1 s: sought.
  assert.equal(followClock(10.2, 10, 1, 0, 0.1).seek, 10.2);
  // The operator's setting is the default, clamped to 0.1–1 s; garbage falls back to 0.5.
  setSyncTolerance(1);
  assert.equal(followClock(10.8, 10, 1).seek, undefined);
  setSyncTolerance(5);
  assert.equal(syncTolerance(), 1);
  setSyncTolerance(0);
  assert.equal(syncTolerance(), 0.1);
  setSyncTolerance(Number('x'));
  assert.equal(syncTolerance(), 0.5);
});
console.log(`${checks} media cue checks passed`);
