/**
 * npm run test:agenda-timer — planned durations per agenda entry: taking them from a ChurchTools
 * agenda (utils/agendaTarget.ts) and the stage countdown that follows the live entry
 * (stage/types.ts, source 'agendaItem').
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'agenda-timer-'));
await build({
  entryPoints: { agenda: 'src/renderer/src/utils/agendaTarget.ts', stage: 'src/renderer/src/stage/types.ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: dir,
  outExtension: { '.js': '.mjs' },
  alias: { '@': join(process.cwd(), 'src/renderer/src') },
  logLevel: 'error',
});
const { matchAgendaDurations } = await import(pathToFileURL(join(dir, 'agenda.mjs')).href);
const { resolveCue, setAgendaItemEnd, cueEndsAt } = await import(pathToFileURL(join(dir, 'stage.mjs')).href);

// ── Durations from ChurchTools ──
const songs = { 7: { title: 'Großer Gott, wir loben dich' }, 8: { title: 'Way Maker' } };
const order = [
  { id: 'a', type: 'media', label: 'Begrüßung', mediaPath: 'welcome.png' },
  { id: 'b', type: 'song', songNumber: 7 },
  { id: 'c', type: 'song', songNumber: 8, plannedDuration: 99 },
  { id: 'd', type: 'song', songNumber: 8 },
  { id: 'e', type: 'media', label: 'Nicht im Ablauf', mediaPath: 'x.png' },
];
const agenda = [
  { title: 'Gottesdienst', type: 'header', duration: 0, songTitle: null },
  { title: 'Begrüßung', type: 'normal', duration: 120, songTitle: null },
  { title: 'Lied', type: 'song', duration: 240, songTitle: 'Großer Gott wir loben dich' },
  { title: 'Way Maker', type: 'song', duration: 300, songTitle: 'Way Maker' },
  { title: 'Way Maker', type: 'song', duration: 200, songTitle: 'Way Maker' },
];
const { order: next, matched } = matchAgendaDurations(order, songs, agenda);
assert.equal(matched, 4, 'four entries found their agenda entry');
assert.equal(next[0].plannedDuration, 120, 'by title');
assert.equal(next[1].plannedDuration, 240, 'a song by its song title, punctuation aside');
assert.equal(next[2].plannedDuration, 300, 'a duplicate pairs with the first agenda entry…');
assert.equal(next[3].plannedDuration, 200, '…and the second with the second');
assert.equal(next[4].plannedDuration, undefined, 'no match leaves the entry alone');
assert.equal(order[1].plannedDuration, undefined, 'the input is not changed');

// ── Stage countdown following the live entry ──
const cue = { id: 'x', kind: 'countdown', source: 'agendaItem', onZero: 'countUp', format: 'mm:ss' };
const runtime = { cueIndex: 0, startedAt: 1_000, hidden: false };
setAgendaItemEnd(null);
assert.equal(resolveCue(cue, runtime, 'de'), null, 'an entry without a planned duration shows nothing');
setAgendaItemEnd(61_000);
const wire = resolveCue(cue, runtime, 'de');
assert.equal(wire.kind, 'timer');
assert.equal(wire.anchor, 61_000, 'counts to the end of the planned time, not from when the cue started');
assert.equal(wire.clampAtZero, false, 'count-up on zero shows the overrun');
assert.equal(resolveCue(cue, { ...runtime, adjustMs: 30_000 }, 'de').anchor, 91_000, 'the operator can add time');
assert.equal(cueEndsAt({ ...cue, onZero: 'next' }, runtime.startedAt), 61_000, 'a handover at zero follows the entry too');
setAgendaItemEnd(null);

rmSync(dir, { recursive: true, force: true });
console.log('PASS agenda timer: ChurchTools matching, stage countdown');
