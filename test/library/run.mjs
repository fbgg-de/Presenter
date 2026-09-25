/**
 * The library as data: saving a group or media entry, adding it to a show again as a copy (new
 * ids, song mappings following the copied song, contiguous groups), what an entry is made of,
 * and what a song was used with last time.
 *
 *   node test/library/run.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'library-'));
await build({
  entryPoints: ['src/renderer/src/library/libraryData.ts'],
  bundle: true,
  format: 'esm',
  outfile: join(dir, 'library.mjs'),
  platform: 'node',
  alias: { '@': resolve('src/renderer/src') },
});
const L = await import(pathToFileURL(join(dir, 'library.mjs')).href);

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

const video = (id, path, songItemId) => ({
  id,
  type: 'media',
  mediaSubType: 'video',
  mediaPath: path,
  media: {
    role: 'background',
    versionId: 'v1',
    versions: [
      {
        id: 'v1',
        name: 'Default',
        duration: 60,
        sources: [{ id: 's', name: 'clouds', path, type: 'video', offset: 0 }],
        regions: [],
        assignments: [],
        ...(songItemId ? { lyrics: { songItemId, arrangement: 'sig', map: { r1: 'x' }, followLyrics: true, followVideo: true } } : {}),
      },
    ],
  },
});
const groups = [
  { id: 'default', name: '' },
  { id: 'worship', name: 'Worship', color: '#336699', collapsed: true, media: { mode: 'together' } },
  { id: 'sermon', name: 'Sermon' },
];
const order = [
  { id: 'a', type: 'song', songNumber: 1, groupId: 'default' },
  { id: 'b', type: 'song', songNumber: 7, groupId: 'worship' },
  video('c', 'Worship/clouds.mp4', 'b'),
  { id: 'd', type: 'media', mediaSubType: 'audio', mediaPath: 'pads/G.mp3', groupId: 'worship' },
  { id: 'e', type: 'bible_verse', bibleRef: 'Ps 23', groupId: 'sermon' },
];
order[2].groupId = 'worship';

// ── Saving ────────────────────────────────────────────────────────────────────

const saved = L.groupLibraryData(groups[1], order);
eq(
  'a saved group holds its own entries',
  saved.items.map((item) => item.id),
  ['b', 'c', 'd'],
);
eq('and its settings, opened', [saved.group.media, saved.group.collapsed], [{ mode: 'together' }, false]);
eq('saving copies: editing the show does not change it', ((order[1].songNumber = 8), saved.items[0].songNumber), 7);
order[1].songNumber = 7;
eq('a saved media entry belongs to no group', L.mediaLibraryData(order[2]).items[0].groupId, undefined);
eq('the files an entry uses', L.mediaPathsOf(saved.items), ['Worship/clouds.mp4', 'pads/G.mp3']);
eq('what it is made of', L.summariseItems(order), { songs: 2, videos: 1, images: 0, slideshows: 0, audio: 1, verses: 1 });

// ── Adding a copy ─────────────────────────────────────────────────────────────

const copy = L.copyGroup(saved, groups, 'Group');
eq('a copied group gets a new id and a free name', [copy.group.id !== 'worship', copy.group.name], [true, 'Worship 2']);
eq(
  'its entries get new ids and join it',
  copy.items.every((item) => item.id && !['b', 'c', 'd'].includes(item.id) && item.groupId === copy.group.id),
  true,
);
eq(
  'a video mapped to a song of the group follows the copy of that song',
  copy.items[1].media.versions[0].lyrics.songItemId,
  copy.items[0].id,
);
eq(
  'a mapping to a song that did not come along is dropped',
  L.copyItems([video('x', 'a.mp4', 'elsewhere')], 'default')[0].media.versions[0].lyrics,
  undefined,
);
eq('copying twice never shares ids', L.copyItems(saved.items, 'g')[0].id !== L.copyItems(saved.items, 'g')[0].id, true);

const inserted = L.insertGroup(order, groups, copy, 'default');
eq(
  'inserted after the group it was dropped on',
  inserted.groups.map((group) => group.name),
  ['', 'Worship 2', 'Worship', 'Sermon'],
);
eq(
  'every group stays one block, in group order',
  inserted.order.map((item) => (item.groupId === copy.group.id ? 'new' : item.id)),
  ['a', 'new', 'new', 'new', 'b', 'c', 'd', 'e'],
);
eq('without a target it goes last', L.insertGroup(order, groups, copy).groups.at(-1).id, copy.group.id);

// ── Suggestions ───────────────────────────────────────────────────────────────

const past = [
  { showTitle: 'Old', date: '2026-08-01 10:00:00', group: groups[1], items: [order[1], video('p1', 'old/stars.mp4')] },
  {
    showTitle: 'Newer',
    date: '2026-09-06 10:00:00',
    group: groups[1],
    items: [order[1], video('p2', 'Worship/clouds.mp4'), video('p3', 'rays.mp4')],
  },
  { showTitle: 'Other', date: '2026-09-10 10:00:00', group: groups[2], items: [order[4]] },
];
const suggestion = L.songMediaSuggestion(past, 7, [{ id: 'z', type: 'song', songNumber: 7 }]);
eq(
  'the most recent show with the song suggests its group media',
  [suggestion.showTitle, suggestion.items.map((i) => i.mediaPath)],
  ['Newer', ['Worship/clouds.mp4', 'rays.mp4']],
);
eq(
  'files already in the show are not suggested again',
  L.songMediaSuggestion(past, 7, order).items.map((i) => i.mediaPath),
  ['rays.mp4'],
);
eq('a song never used before suggests nothing', L.songMediaSuggestion(past, 99, []), undefined);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
