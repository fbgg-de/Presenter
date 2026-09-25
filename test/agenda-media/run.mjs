/**
 * Dropping media onto the agenda: file kinds and media-folder paths, inserting into a group, and the
 * desktop media server's copy/reuse, search by name and new folders — on a real temporary folder —
 * and the operator's audio players (fade, keep playing, the play key).
 *
 *   node test/agenda-media/run.mjs
 */
import { build } from 'esbuild';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'agenda-media-'));

let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  } else {
    console.log(`ok   ${name}`);
  }
};

const bundle = async (entry, out, extra = {}) => {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    outfile: join(dir, out),
    platform: 'node',
    alias: { '@': resolve('src/renderer/src') },
    ...extra,
  });
  return import(pathToFileURL(join(dir, out)).href);
};

// ── File kinds and media-folder paths ─────────────────────────────────────────

const F = await bundle('src/renderer/src/media/mediaFiles.ts', 'files.mjs');
eq('kinds by extension, any case', ['a.JPG', 'b.mp4', 'c.MP3', 'd.flac', 'e.pdf', 'f.sng'].map(F.mediaKindOf), [
  'image',
  'video',
  'audio',
  'audio',
  undefined,
  undefined,
]);
eq('song files', [F.isSongFileName('Lied.SNG'), F.isSongFileName('ccli.txt'), F.isSongFileName('x.mp3')], [true, true, false]);
eq('label drops the extension', F.mediaLabelOf('Worship/2026/intro clouds.mp4'), 'intro clouds');
eq(
  'inside the media folder on Windows, any case',
  F.relativeToMediaRoot('D:\\Media\\Worship\\Clouds.mp4', 'd:\\media'),
  'Worship/Clouds.mp4',
);
eq('a trailing slash on the root is fine', F.relativeToMediaRoot('/srv/media/a/b.png', '/srv/media/'), 'a/b.png');
eq('a sibling folder with the same prefix is outside', F.relativeToMediaRoot('D:\\Media2\\x.png', 'D:\\Media'), undefined);
eq('POSIX paths are case-sensitive', F.relativeToMediaRoot('/srv/Media/x.png', '/srv/media'), undefined);
eq('the root itself is not a file inside it', F.relativeToMediaRoot('D:\\Media', 'D:\\Media'), undefined);
eq('joining a folder and a name', [F.joinMediaPath('', 'a.png'), F.joinMediaPath('Worship/', 'a.png')], ['a.png', 'Worship/a.png']);

// ── Inserting into a group ────────────────────────────────────────────────────

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = globalThis;
const S = await bundle('src/renderer/src/store/showSlice.ts', 'show.mjs');
const reducer = S.showSlice.reducer;
const show = {
  title: 'Sunday',
  groups: [
    { id: 'default', name: '' },
    { id: 'worship', name: 'Worship' },
    { id: 'sermon', name: 'Sermon' },
  ],
  order: [
    { type: 'song', songNumber: 1, groupId: 'default' },
    { type: 'song', songNumber: 2, groupId: 'worship' },
    { type: 'song', songNumber: 3, groupId: 'worship' },
  ],
};
let state = reducer(undefined, S.setCurrentShow(show));
const media = (path) => ({ type: 'media', mediaSubType: 'image', mediaPath: path });
const names = (s) => s.currentShow.order.map((item) => item.songNumber ?? item.mediaPath);

state = reducer(state, S.insertItemsIntoGroup({ items: [media('a.png'), media('b.png')], groupId: 'worship', afterIndex: 1 }));
eq('dropped after an entry of the group, in drop order', names(state), [1, 2, 'a.png', 'b.png', 3]);
eq(
  'the new entries join the group and get ids',
  state.currentShow.order.slice(2, 4).map((item) => [item.groupId, typeof item.id]),
  [
    ['worship', 'string'],
    ['worship', 'string'],
  ],
);
state = reducer(state, S.insertItemsIntoGroup({ items: [media('c.png')], groupId: 'worship', afterIndex: 0 }));
eq('an entry of another group means the end of the group', names(state), [1, 2, 'a.png', 'b.png', 3, 'c.png']);
state = reducer(state, S.insertItemsIntoGroup({ items: [media('d.png')], groupId: 'sermon' }));
eq('an empty group gets its block after the groups before it', names(state), [1, 2, 'a.png', 'b.png', 3, 'c.png', 'd.png']);
eq('an item added the old way gets an id too', typeof reducer(state, S.addShowItem(media('e.png'))).currentShow.order.at(-1).id, 'string');

// ── Audio players ─────────────────────────────────────────────────────────────

class FakeAudio extends EventTarget {
  static all = [];
  paused = true;
  currentTime = 0;
  duration = 180;
  volume = 1;
  loop = false;
  preload = '';
  src = '';
  constructor() {
    super();
    FakeAudio.all.push(this);
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  load() {}
  removeAttribute() {}
}
globalThis.Audio = FakeAudio;
const P = await bundle('src/renderer/src/media/audioPlayers.ts', 'audio.mjs');
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const pad = { key: 'pad', label: 'Pad in G', url: 'http://media/pad.mp3', volume: 0.8, loop: true };

const release = P.holdAudio(pad);
eq('holding loads without playing', FakeAudio.all.at(-1).paused, true);
eq('the play key toggles the open audio entry', P.toggleFocusedAudio(), true);
const padEl = FakeAudio.all.at(-1);
eq('it plays at the item volume and loops', [padEl.paused, padEl.volume, padEl.loop], [false, 0.8, true]);
release();
eq('closing the entry keeps it playing', padEl.paused, false);
eq('and nothing is focused for the play key any more', P.toggleFocusedAudio(), false);

padEl.currentTime = 42;
P.fadeOutAudio('pad', 0.2);
await wait(100);
eq('half-way through a fade it is quieter but still playing', padEl.volume > 0 && padEl.volume < 0.8 && !padEl.paused, true);
await wait(200);
eq('after the fade it is stopped and rewound', [padEl.paused, padEl.currentTime], [true, 0]);

P.loadAudio({ key: 'walkin', label: 'Walk-in', url: 'http://media/walkin.mp3' });
P.toggleAudio('walkin');
const walkEl = FakeAudio.all.at(-1);
eq('a row button starts a player without an open entry', walkEl.paused, false);
P.setAudioVolume('walkin', 0.5);
P.fadeOutAudio('walkin', 5);
P.playAudio('walkin');
eq('playing again cancels the fade and restores the volume', [walkEl.paused, walkEl.volume], [false, 0.5]);
P.stopAllAudio();
eq('stop all', walkEl.paused, true);
P.fadeOutAudio('missing', 1);
eq('commands for unknown players do nothing', P.toggleFocusedAudio(), false);
eq(
  'keys prefer the entry id, else the path',
  [P.audioKeyOf({ id: 'x1', mediaPath: 'a.mp3' }), P.audioKeyOf({ mediaPath: 'a.mp3' })],
  ['x1', 'path:a.mp3'],
);

// ── The desktop media server ──────────────────────────────────────────────────

const serverModule = join(dir, 'server.mjs');
writeFileSync(
  serverModule,
  ts.transpileModule(readFileSync('src/main/mediaServer.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);
const { LocalMediaServer } = await import(pathToFileURL(serverModule).href);
const root = join(dir, 'media');
const outside = join(dir, 'downloads');
mkdirSync(join(root, 'Worship'), { recursive: true });
mkdirSync(join(root, 'Archive', '2025'), { recursive: true });
mkdirSync(outside);
writeFileSync(join(outside, 'clouds.mp4'), 'video-bytes');
writeFileSync(join(outside, 'pad.mp3'), 'audio');
writeFileSync(join(outside, 'notes.pdf'), 'pdf');
writeFileSync(join(root, 'Worship', 'pad.mp3'), 'other audio'); // same name, different size
writeFileSync(join(root, 'Archive', '2025', 'Clouds.MP4'), 'old');

const server = new LocalMediaServer(root);
const first = await server.importFiles([join(outside, 'clouds.mp4'), join(outside, 'pad.mp3'), join(outside, 'notes.pdf')], 'Worship');
eq(
  'copied, renamed on a name clash, unsupported skipped',
  first.placed.map((p) => [p.name, p.reused]),
  [
    ['clouds.mp4', false],
    ['pad (2).mp3', false],
  ],
);
eq(
  'the pdf is reported as unsupported',
  first.skipped.map((s) => [s.name, s.reason]),
  [['notes.pdf', 'unsupported']],
);
const again = await server.importFiles([join(outside, 'clouds.mp4')], 'Worship');
eq(
  'the same file dropped again is reused, not copied',
  again.placed.map((p) => [p.name, p.reused]),
  [['clouds.mp4', true]],
);
eq('and no second copy exists', existsSync(join(root, 'Worship', 'clouds (2).mp4')), false);

const found = await server.findByName('clouds.mp4');
eq('search by name finds every folder, ignoring case', found.map((f) => f.path).sort(), ['Archive/2025/Clouds.MP4', 'Worship/clouds.mp4']);
eq('with sizes', found.find((f) => f.path === 'Worship/clouds.mp4')?.size, 'video-bytes'.length);
eq('nothing for an unknown name', await server.findByName('missing.png'), []);

eq('a new folder inside a folder', await server.createFolder('Worship', 'Easter 2026'), 'Worship/Easter 2026');
eq('it exists', existsSync(join(root, 'Worship', 'Easter 2026')), true);
let refused = 0;
for (const name of ['..', '../escape', 'a/b', '']) {
  await server.createFolder('', name).catch(() => refused++);
}
eq('names that leave the folder or nest are refused', refused, 4);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
