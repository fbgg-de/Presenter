/**
 * npm run test:stage-messages — messages with `{fields}` (stage/types.ts), requests from the
 * /message page (stage/messageRequests.ts) and how the stage store keeps them (store/stageSlice.ts).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'stage-messages-'));
await build({
  entryPoints: {
    types: 'src/renderer/src/stage/types.ts',
    requests: 'src/renderer/src/stage/messageRequests.ts',
    slice: 'src/renderer/src/store/stageSlice.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: dir,
  outExtension: { '.js': '.mjs' },
  alias: { '@': join(process.cwd(), 'src/renderer/src') },
  logLevel: 'error',
});
const { templateFields, fillTemplate, resolveCue } = await import(pathToFileURL(join(dir, 'types.mjs')).href);
const { parseMessageRequest } = await import(pathToFileURL(join(dir, 'requests.mjs')).href);
const slice = await import(pathToFileURL(join(dir, 'slice.mjs')).href);
const reducer = slice.default ?? slice.stageSlice.reducer;

// ── Fields ──
assert.deepEqual(templateFields('Kind {Nummer} bitte in {Raum} abholen, {Nummer}!'), ['Nummer', 'Raum'], 'in order, once each');
assert.deepEqual(templateFields('a {b}{c}'), ['b', 'c'], 'side by side');
assert.deepEqual(templateFields('{' + 'x'.repeat(31) + '}'), [], 'longer than 30 characters is not a field');
assert.deepEqual(templateFields('no fields here'), []);
assert.equal(fillTemplate('Kind {Nummer} bitte abholen', { Nummer: ' 12 ' }), 'Kind 12 bitte abholen');
assert.equal(fillTemplate('Kind {Nummer} in {Raum}', { Nummer: '3' }), 'Kind 3 in ', 'a missing value stays empty');

const cue = { id: 'm', kind: 'message', text: 'Kind {Nummer} bitte abholen' };
const runtime = { cueIndex: 0, startedAt: 0, hidden: false };
assert.equal(resolveCue(cue, runtime, 'de'), null, 'an unfilled message stays off the screens');
assert.deepEqual(resolveCue(cue, { ...runtime, fields: { Nummer: '7' } }, 'de'), { kind: 'message', text: 'Kind 7 bitte abholen' });
assert.deepEqual(resolveCue({ ...cue, text: 'Gottesdienstende 11:30' }, runtime, 'de'), { kind: 'message', text: 'Gottesdienstende 11:30' });

// ── Requests off the wire ──
assert.equal(parseMessageRequest(null), null);
assert.equal(parseMessageRequest({ id: 'x', layerId: '1', cueId: 'm' }), null, 'layer id must be a number');
assert.equal(parseMessageRequest({ id: '', layerId: 1, cueId: 'm' }), null, 'needs an id');
const parsed = parseMessageRequest(
  { id: 'r1', layerId: 1, cueId: 'm', fields: { Nummer: '12', evil: { x: 1 }, long: 'y'.repeat(500) }, from: 'Kinderkirche' },
  1000,
);
assert.deepEqual(parsed, { id: 'r1', layerId: 1, cueId: 'm', fields: { Nummer: '12', long: 'y'.repeat(200) }, from: 'Kinderkirche', at: 1000 });

// ── The store ──
let state = reducer(undefined, { type: '@@init' });
state = reducer(state, slice.stageShowMessage({ layerId: 1, cueIndex: 0, fields: { Nummer: '12' }, at: 5 }));
assert.deepEqual(state.layers[1].fields, { Nummer: '12' });
assert.equal(state.layers[1].hidden, false);
state = reducer(state, slice.stageReset({ layerId: 1, at: 6 }));
assert.deepEqual(state.layers[1].fields, { Nummer: '12' }, 'restarting the same message keeps its values');
state = reducer(state, slice.stageGo({ layerId: 1, cueCount: 2, at: 7 }));
assert.equal(state.layers[1].fields, undefined, 'another cue drops them');
state = reducer(state, slice.addMessageRequest(parsed));
state = reducer(state, slice.addMessageRequest(parsed));
assert.equal(state.messageRequests.length, 1, 'a resent request stays one');
state = reducer(state, slice.removeMessageRequest('r1'));
assert.equal(state.messageRequests.length, 0);

rmSync(dir, { recursive: true, force: true });
console.log('PASS stage messages: fields, requests, store');
