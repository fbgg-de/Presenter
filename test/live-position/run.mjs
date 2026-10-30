/**
 * npm run test:live-position — store/livePosition.ts: the live position survives an operator
 * reload (sessionStorage) and a recent restart (localStorage), only for the show it belongs to.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'live-position-'));
const file = join(dir, 'livePosition.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync('src/renderer/src/store/livePosition.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);

const storage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), clear: () => data.clear() };
};
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
const { restoreLivePosition, keepLivePosition, showIdentity } = await import(pathToFileURL(file).href);

const show = { title: 'Gottesdienst', date: '2026-10-11' };
localStorage.setItem('presenter_show', JSON.stringify({ currentShow: show }));
const presentation = { activeItemIndex: 3, activeBlockIndex: 2, activeLineIndex: 0, isBlack: true, isTextHidden: false, videoVisible: true, mediaVisible: false };
let listener;
const store = {
  state: { presentation, show: { currentShow: show } },
  getState() {
    return this.state;
  },
  subscribe(fn) {
    listener = fn;
    return () => (listener = undefined);
  },
};

const stop = keepLivePosition(store);
assert.deepEqual(restoreLivePosition(), presentation, 'a reload restores everything, black included');

store.state = { ...store.state, presentation: { ...presentation, activeItemIndex: 5 } };
listener();
assert.equal(restoreLivePosition().activeItemIndex, 5, 'every change is written');
stop();
assert.equal(listener, undefined, 'the subscription ends');

localStorage.setItem('presenter_show', JSON.stringify({ currentShow: { title: 'Another show', date: '2026-10-18' } }));
assert.deepEqual(restoreLivePosition(), {}, 'another show starts at its beginning');
localStorage.setItem('presenter_show', JSON.stringify({ currentShow: show }));

sessionStorage.clear(); // a restart: only the localStorage copy is left
assert.equal(restoreLivePosition().activeItemIndex, 5, 'a recent restart restores');
const old = JSON.parse(localStorage.getItem('presenter_live_position'));
localStorage.setItem('presenter_live_position', JSON.stringify({ ...old, at: Date.now() - 31 * 60 * 1000 }));
assert.deepEqual(restoreLivePosition(), {}, 'a restart after more than 30 minutes starts fresh');

localStorage.setItem('presenter_live_position', '{broken');
assert.deepEqual(restoreLivePosition(), {}, 'a broken entry is ignored');
assert.equal(showIdentity(null), '', 'no show, no identity');

rmSync(dir, { recursive: true, force: true });
console.log('PASS live position: reload, restart window, show match, broken data');
