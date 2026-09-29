/** Storage failure recovery and library search regressions. Run: node test/reliability/run.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(file, globals = {}) {
  const source = readFileSync(new URL(`../../src/renderer/src/${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = vm.createContext({ exports: {}, console, Error, ...globals });
  vm.runInContext(outputText, context);
  return context.exports;
}

function storageFixture(setItem, api) {
  const events = [];
  const timers = [];
  const window = { api, dispatchEvent: (event) => events.push(event.detail) };
  const persistence = loadModule('store/persist.ts', {
    window,
    localStorage: { setItem },
    console: { error() {}, warn() {} },
    CustomEvent: class {
      constructor(_name, { detail }) {
        this.detail = detail;
      }
    },
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  });
  return { ...persistence, events, timers, window };
}

const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });
const test = async (name, run) => {
  await run();
  console.log(`ok   ${name}`);
};

await test('unserializable values never overwrite saved state', () => {
  let writes = 0;
  const p = storageFixture(() => writes++);
  const circular = {};
  circular.self = circular;
  assert.equal(p.persistState('settings', circular), false);
  assert.equal(p.persistState('settings', undefined), false);
  assert.equal(writes, 0);
});

await test('a failed evictor cannot discard the action or prevent later recovery', () => {
  let space = false;
  const p = storageFixture(() => {
    if (!space) throw quotaError();
  });
  p.registerEvictor({
    name: 'broken cache',
    priority: 1,
    run: () => {
      throw new Error('corrupt cache');
    },
  });
  p.registerEvictor({ name: 'optional cache', priority: 2, run: () => (space = true) });
  assert.equal(p.persistState('settings', { language: 'de' }), true);
  assert.equal(p.events[0].saved, true);
  assert.equal(p.events[0].freed.join(','), 'optional cache');
});

await test('eviction uses priority and stops before current-show data when space is sufficient', () => {
  const calls = [];
  let space = false;
  const p = storageFixture(() => {
    if (!space) throw quotaError();
  });
  p.registerEvictor({
    name: 'current show',
    priority: 90,
    run: () => {
      calls.push('current');
      return true;
    },
  });
  p.registerEvictor({
    name: 'optional',
    priority: 10,
    run: () => {
      calls.push('optional');
      return (space = true);
    },
  });
  assert.equal(p.persistState('settings', {}), true);
  assert.deepEqual(calls, ['optional']);
});

await test('losing storage permission during retry preserves remaining offline data', () => {
  let attempts = 0;
  let currentEvicted = false;
  const p = storageFixture(() => {
    if (++attempts === 1) throw quotaError();
    throw Object.assign(new Error('denied'), { name: 'SecurityError' });
  });
  p.registerEvictor({ name: 'optional', priority: 10, run: () => true });
  p.registerEvictor({ name: 'current', priority: 90, run: () => (currentEvicted = true) });
  assert.equal(p.persistState('settings', {}), false);
  assert.equal(currentEvicted, false);
  assert.equal(p.events[0].saved, false);
});

await test('full storage and a broken notification surface still return a failure safely', () => {
  const p = storageFixture(() => {
    throw quotaError();
  });
  p.window.dispatchEvent = () => {
    throw new Error('unavailable');
  };
  assert.equal(p.persistState('settings', {}), false);
});

await test('a disconnected desktop bridge cannot invalidate an already successful write', () => {
  let writes = 0;
  const p = storageFixture(() => writes++);
  Object.defineProperty(p.window, 'api', {
    get: () => {
      throw new Error('bridge unavailable');
    },
  });
  assert.equal(p.persistState('settings', {}), true);
  assert.equal(writes, 1);
});

await test('disk flushes coalesce and recover after sync or async bridge failures', async () => {
  let flushes = 0;
  const p = storageFixture(() => {}, {
    flushStorage: () => {
      if (++flushes === 1) throw new Error('disconnected');
      return Promise.reject(new Error('closed'));
    },
  });
  p.persistState('settings', {});
  p.persistState('show', {});
  assert.equal(p.timers.length, 1);
  assert.doesNotThrow(() => p.timers.shift()());
  assert.equal(p.persistState('show', {}), true);
  assert.doesNotThrow(() => p.timers.shift()());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flushes, 2);
});

const search = loadModule('song/librarySearch.ts');
const songs = [
  { title: 'Über alle Grenzen', songNumber: 12, authors: 'Zoë Müller' },
  { title: 'Amazing Grace', songNumber: 123456, authors: 'John Newton' },
  { title: 'Other', songNumber: 42 },
];
const index = search.indexLibrarySongs(songs);
await test('search handles pasted whitespace, accents, and terms across title and author', () => {
  assert.equal(search.searchLibrarySongs(index, '  UBER   muller  ')[0], songs[0]);
  assert.equal(search.searchLibrarySongs(index, 'zoe')[0], songs[0]);
  assert.equal(search.searchLibrarySongs(index, 'Grace Newton')[0], songs[1]);
  assert.equal(search.searchLibrarySongs(index, '1234')[0], songs[1]);
  assert.equal(search.searchLibrarySongs(index, 'missing').length, 0);
  assert.equal(search.searchLibrarySongs(index, '   ').length, 3);
  assert.equal(songs[0].title, 'Über alle Grenzen');
});

await test('CCLI renumbering rejects truncation, exponent notation and unsafe integers', () => {
  for (const invalid of ['1000.5', '1e6', '1000oops', '-1000', '', '999', '9007199254740993']) {
    assert.equal(search.parseCcliNumber(invalid, 1000), undefined, invalid);
  }
  assert.equal(search.parseCcliNumber(' 1234567 ', 1000), 1234567);
  assert.equal(search.parseCcliNumber('1000', 1000), 1000);
});

await test('background queue bounds concurrency and releases slots after rejection', async () => {
  const { createTaskQueue } = loadModule('utils/taskQueue.ts');
  const queue = createTaskQueue(3);
  let active = 0,
    maximum = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 15 }, (_, index) =>
      queue(async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setImmediate(resolve));
        active--;
        if (index % 2) throw new Error('expected failure');
        return index;
      }),
    ),
  );
  assert.equal(maximum, 3);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 8);
});

await test('drafts validate stored data, preserve raw text, and flush writes and removal', () => {
  const records = new Map();
  const timers = [];
  let flushes = 0;
  const storage = {
    setItem: (key, value) => records.set(key, value),
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => records.delete(key),
  };
  const persistence = loadModule('store/persist.ts', {
    localStorage: storage,
    window: { api: { flushStorage: () => flushes++ } },
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  });
  const drafts = loadModule('song/editorDraft.ts', { localStorage: storage, require: () => persistence });
  const key = drafts.songDraftKey('', 1, 1);
  const draft = {
    title: 'Draft',
    authors: '',
    copyright: '',
    languages: ['EN'],
    blocks: [{ name: 'Verse', lines: ['line'] }],
    orders: { Default: ['Verse'] },
    currentOrder: 'Default',
    rawText: 'Unfinished text [',
  };
  assert.equal(drafts.writeSongDraft(key, draft), true);
  assert.equal(drafts.readSongDraft(key).rawText, draft.rawText);
  timers.shift()();
  drafts.removeSongDraft(key);
  assert.equal(drafts.readSongDraft(key), undefined);
  timers.shift()();
  assert.equal(flushes, 2);
  for (const value of ['{broken', 'null', '{"version":1,"data":{}}', JSON.stringify({ version: 1, data: { ...draft, blocks: [null] } })]) {
    storage.setItem(key, value);
    assert.equal(drafts.readSongDraft(key), undefined);
  }
  assert.notEqual(key, drafts.songDraftKey('', 2, 1));
  assert.notEqual(key, drafts.songDraftKey('other', 1, 1));
});

console.log('\nAll reliability checks passed.');
