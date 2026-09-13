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
const { advanceCue, commandCue, initialTransport, lyricAt, lyricOccurrences, validateCue } = await import(
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
console.log(`${checks} media cue checks passed`);
