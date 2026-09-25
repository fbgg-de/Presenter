/**
 * Screen groups: what a window shows is decided by its group.
 *
 *   node test/screen-groups/run.mjs
 *
 * Exercises the real presentation bridge in browser mode — `window.open` is replaced by a
 * fake popup that records every message — so the per-window resolution is tested exactly as
 * it runs, not re-implemented. Everything here fails silently in the app: a layer switch that
 * stops applying just leaves a background on the stage monitor.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'screen-groups-'));

/** Every popup the bridge opens, with the messages it was sent. */
const popups = [];
globalThis.window = {
  addEventListener() {},
  dispatchEvent() {},
  open(url) {
    const popup = { url, closed: false, messages: [], postMessage: (m) => popup.messages.push(m) };
    popups.push(popup);
    return popup;
  },
};

const bundle = async (entry, out) => {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    outfile: join(dir, out),
    platform: 'node',
    alias: { '@': resolve('src/renderer/src') },
  });
  return import(pathToFileURL(join(dir, out)).href);
};

const B = await bundle('src/renderer/src/utils/presentationBridge.ts', 'bridge.js');
const G = await bundle('src/renderer/src/screens/types.ts', 'screens.js');

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const group = (id, kind, over = {}) => ({
  id,
  name: `Group ${id}`,
  enabled: true,
  sort_order: 0,
  data: G.emptyScreenGroupData(kind),
  ...over,
});

const content = (over = {}) => ({
  contentType: 'song',
  displayMode: 'normal',
  activeBlockIndex: 0,
  activeLineIndex: 0,
  blocks: [{ name: 'Verse 1', lines: [{ text: 'O holy night' }] }],
  style: { backgroundVideo: 'candles.mp4' },
  isBlack: false,
  ...over,
});

/** Open a window, send `c`, and return what it received. */
const open = async (config) => {
  const id = await B.openPresentationWindow(config);
  return { id, popup: popups[popups.length - 1] };
};
const lastContent = (popup) => popup.messages.filter((m) => m.type === 'UPDATE_PRESENTATION').at(-1)?.props.content;
const lastStage = (popup) => popup.messages.filter((m) => m.type === 'UPDATE_STAGE').at(-1)?.payload;

const streamGroup = group(5, 'stream');
streamGroup.data = { ...streamGroup.data, display: { mode: 'stream', lines: 3 }, languages: ['DE', 'EN'], transparent: true };
B.setScreenGroups([group(1, 'audience'), group(2, 'stage'), group(3, 'wall'), group(4, 'stage', { enabled: false }), streamGroup]);

const plain = await open({ name: 'Laptop' });
const audience = await open({ name: 'Beamer', screenGroupId: 1 });
const stage = await open({ name: 'Floor monitor', screenGroupId: 2 });
const wall = await open({ name: 'LED left', screenGroupId: 3 });
const disabled = await open({ name: 'Choir TV', screenGroupId: 4 });
const stream = await open({ name: 'OBS', screenGroupId: 5 });

// ── Songs ─────────────────────────────────────────────────────────────────────

await B.broadcastContent(content());

eq('no group shows the background', lastContent(plain.popup).style.hideBackground, undefined);
eq('no group shows the text', lastContent(plain.popup).hideText, false);
eq('audience shows the background', lastContent(audience.popup).style.hideBackground, undefined);
eq('stage hides the background in the style, where the renderer reads it', lastContent(stage.popup).style.hideBackground, true);
eq('stage keeps the text', lastContent(stage.popup).hideText, false);
// Every kind starts with the song text on: an LED wall is a second audience screen far more
// often than a picture-only backdrop, and one that starts blank reads as a broken output.
eq('a wall keeps the text too', lastContent(wall.popup).hideText, false);
eq('a disabled group behaves like no group', lastContent(disabled.popup).style.hideBackground, undefined);

// Switching the text layer off is still what hides it — that is the one setting behind an
// output that stays blank while every other one is right.
const noText = group(6, 'wall');
noText.data = { ...noText.data, layers: { ...noText.data.layers, slides: false, bibleVerses: false } };
B.setScreenGroups([group(1, 'audience'), group(2, 'stage'), group(3, 'wall'), group(4, 'stage', { enabled: false }), streamGroup, noText]);
const textless = await open({ name: 'LED right', screenGroupId: 6 });
await B.broadcastContent(content());
eq('a group with the text layer off hides it', lastContent(textless.popup).hideText, true);

// ── Display settings come from the group ──────────────────────────────────────

eq('a stream group lays text out as stream lines', lastContent(stream.popup).displayMode, 'stream');
eq('with its number of lines', lastContent(stream.popup).streamLines, 3);
eq('and its languages', lastContent(stream.popup).languages, ['DE', 'EN']);
eq('an audience group shows whole slides', lastContent(audience.popup).displayMode, 'normal');
eq(
  'the popup opens transparent in stream mode',
  [stream.popup.url.includes('transparent=1'), stream.popup.url.includes('mode=stream')],
  [true, true],
);
eq('a plain window opens in normal mode', plain.popup.url.includes('mode=normal'), true);

// ── Bible verses and media items ──────────────────────────────────────────────

await B.broadcastContent(content({ contentType: 'bible_verse' }));
eq('a wall shows bible verses', lastContent(wall.popup).hideText, false);
eq('audience shows bible verses', lastContent(audience.popup).hideText, false);
eq('a group with the verse layer off hides them', lastContent(textless.popup).hideText, true);

await B.broadcastContent(content({ contentType: 'media', blocks: [] }));
eq('stage shows nothing for a media item', lastContent(stage.popup).contentType, 'empty');
eq('audience shows the media item', lastContent(audience.popup).contentType, 'media');

// ── Changing a group applies to open windows ──────────────────────────────────

const before = audience.popup.messages.length;
const noBackground = group(1, 'audience');
noBackground.data.layers.background = false;
B.setScreenGroups([noBackground, group(2, 'stage'), group(3, 'wall')]);
eq('changing groups re-sends to open windows', audience.popup.messages.length > before, true);
eq('and the new layers apply', lastContent(audience.popup).style.hideBackground, true);

// Moving a window to another group.
B.updateWindowConfigInBridge(wall.id, { screenGroupId: 2 });
await B.broadcastContent(content());
eq('a moved window follows its new group', lastContent(wall.popup).hideText, false);

// ── Media layers follow the group's layers ─────────────────────────────────────

const packet = { cue: { id: 'c', assignments: [] }, transport: {}, at: 0, visible: true };
B.setWindowMediaResolver(() => ({ background: packet, contents: [packet] }));
await B.broadcastContent(content());
eq('a group without backgrounds and media items gets no media layers', lastContent(stage.popup).media, undefined);
eq(
  'a window without a group gets both',
  [!!lastContent(plain.popup).media?.background, !!lastContent(plain.popup).media?.contents.length],
  [true, true],
);
B.setWindowMediaResolver(undefined);

// ── Stage overlays ────────────────────────────────────────────────────────────

await B.broadcastStage({
  layers: [
    { id: 7, screenGroupIds: [2] },
    { id: 8, screenGroupIds: [1, 3] },
  ],
});
eq(
  'a stage group shows the layers assigned to it',
  lastStage(stage.popup).layers.map((l) => l.id),
  [7],
);
eq('a window without a group gets no layers', lastStage(plain.popup).layers.length, 0);
eq('an audience group hides overlays even when a layer is assigned to it', lastStage(audience.popup).layers.length, 0);
eq('a disabled group gets no layers', lastStage(disabled.popup).layers.length, 0);
B.updateWindowConfigInBridge(stage.id, { screenGroupId: 5 });
eq('moving a window to another group takes its layers along', lastStage(stage.popup).layers.length, 0);

// ── Pure helpers ──────────────────────────────────────────────────────────────

eq('a stored group without display settings gets its kind defaults', G.normaliseScreenGroupData({ kind: 'stream' }).display, {
  mode: 'stream',
  lines: 2,
});
eq(
  'and no languages and no transparency',
  [G.normaliseScreenGroupData({ kind: 'audience' }).languages, G.normaliseScreenGroupData({}).transparent],
  [[], false],
);
eq(
  'nonsense lines fall back to the default',
  G.normaliseScreenGroupData({ kind: 'stream', display: { mode: 'stream', lines: -1 } }).display.lines,
  2,
);
const pool = [
  group(9, 'stage', { sort_order: 0 }),
  group(10, 'audience', { sort_order: 2 }),
  group(11, 'audience', { sort_order: 1, enabled: false }),
];
eq('new windows join the first enabled audience group', G.defaultGroupForWindows(pool)?.id, 10);
eq('or the first enabled group of any kind', G.defaultGroupForWindows([group(9, 'stage')])?.id, 9);
eq('or none while there are no groups', G.defaultGroupForWindows([]), undefined);
eq(
  'stored data missing layers is completed from its kind',
  G.normaliseScreenGroupData({ kind: 'stage', layers: { overlays: false } }).layers,
  { background: false, slides: true, media: false, bibleVerses: true, overlays: false },
);
eq('an unknown kind becomes custom', G.normaliseScreenGroupData({ kind: 'foyer' }).kind, 'custom');

console.log(failed ? `\n${failed} failing` : '\nall passing');
// The browser-mode bridge polls each popup for closing; nothing else would end the process.
process.exit(failed ? 1 : 0);
