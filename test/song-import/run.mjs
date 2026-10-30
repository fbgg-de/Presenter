/**
 * npm run test:song-import — song files from other programs (src/renderer/src/song/importers.ts):
 * OpenLyrics, ChordPro and FreeShow, read into blocks, pages, translations and order.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'song-import-'));
await build({
  entryPoints: { importers: 'src/renderer/src/song/importers.ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: dir,
  outExtension: { '.js': '.mjs' },
  alias: { '@': join(process.cwd(), 'src/renderer/src') },
  logLevel: 'error',
});
const { OpenLyricsSong, ChordProSong, FreeShowSong, importerFor } = await import(pathToFileURL(join(dir, 'importers.mjs')).href);

// ── OpenLyrics ──
const openLyrics = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties>
    <titles><title lang="de">Großer Gott, wir loben dich</title><title lang="en">Holy God</title></titles>
    <authors><author type="words">Ignaz Franz</author><author type="music">Unbekannt</author></authors>
    <copyright>Public Domain</copyright>
    <ccliNo>12345</ccliNo>
    <key>F</key>
    <verseOrder>v1 c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1" lang="de"><lines><chord name="F"/>Großer Gott, wir <tag name="b">loben</tag> dich;<br/>Herr, wir preisen deine Stärke.</lines><lines>Vor dir neigt die Erde sich<br/>und bewundert deine Werke.</lines></verse>
    <verse name="v1" lang="en"><lines>Holy God, we praise thy name;<br/>Lord of all, we bow before thee!</lines><lines>All on earth thy sceptre claim,<br/>all in heaven above adore thee.</lines></verse>
    <verse name="c" lang="de"><lines>Wie du warst vor aller Zeit,<br/>so bleibst du in Ewigkeit. <comment>2x</comment></lines></verse>
    <verse name="v2" lang="de"><lines>Alles, was dich preisen kann, &amp; mehr</lines></verse>
  </lyrics>
</song>`;
const ol = OpenLyricsSong(openLyrics);
assert.equal(ol.title, 'Großer Gott, wir loben dich');
assert.equal(ol.authors, 'Ignaz Franz, Unbekannt');
assert.equal(ol.copyright, 'Public Domain');
assert.equal(ol.ccliNumber, '12345');
assert.equal(ol.key, 'F');
assert.deepEqual(ol.order.Default, ['Verse 1', 'Chorus', 'Verse 2', 'Chorus'], 'verse order with repeats');
assert.deepEqual(
  ol.blocks['Verse 1'],
  [
    '[DE] Großer Gott, wir loben dich;',
    '[EN] Holy God, we praise thy name;',
    '[DE] Herr, wir preisen deine Stärke.',
    '[EN] Lord of all, we bow before thee!',
    '---',
    '[DE] Vor dir neigt die Erde sich',
    '[EN] All on earth thy sceptre claim,',
    '[DE] und bewundert deine Werke.',
    '[EN] all in heaven above adore thee.',
  ],
  'each line followed by its translation, one page per <lines>, chords and markup gone',
);
assert.deepEqual(ol.blocks.Chorus, ['[DE] Wie du warst vor aller Zeit,', '[DE] so bleibst du in Ewigkeit.'], 'comments dropped');
assert.deepEqual(ol.blocks['Verse 2'], ['[DE] Alles, was dich preisen kann, & mehr'], 'entities decoded');

// ── ChordPro ──
const chordPro = `{title: Amazing Grace}
{artist: John Newton}
{copyright: Public Domain}
{key: G}
{ccli: 22025}
# a comment line

{start_of_verse: Verse 1}
A[G]mazing grace, how [C]sweet the [G]sound
That saved a wretch like me

I [G]once was lost, but [D]now am found
{end_of_verse}

{start_of_chorus}
[C]My chains are gone, I've been set free
{end_of_chorus}

{c: Verse 2}
'Twas grace that taught my heart to fear
{chorus}
{start_of_tab}
e|---3---|
{end_of_tab}`;
const cp = ChordProSong(chordPro);
assert.equal(cp.title, 'Amazing Grace');
assert.equal(cp.authors, 'John Newton');
assert.equal(cp.key, 'G');
assert.equal(cp.ccliNumber, '22025');
assert.deepEqual(cp.blocks['Verse 1'], ['Amazing grace, how sweet the sound', 'That saved a wretch like me', '', 'I once was lost, but now am found'], 'chords gone, inner blank line kept');
assert.deepEqual(cp.blocks.Chorus, ["My chains are gone, I've been set free"]);
assert.deepEqual(cp.blocks['Verse 2'], ["'Twas grace that taught my heart to fear"], 'a comment names the section');
assert.deepEqual(cp.order.Default, ['Verse 1', 'Chorus', 'Verse 2', 'Chorus'], '{chorus} repeats the chorus');
assert.ok(!Object.values(cp.blocks).flat().some((l) => l.includes('e|')), 'tab blocks are skipped');

const plain = ChordProSong('{t: Plain}\n[G]Line one\nLine two\n\nLine three\n');
assert.deepEqual(plain.order.Default, ['Verse 1', 'Verse 2'], 'without sections, blank lines separate verses');
assert.deepEqual(plain.blocks['Verse 2'], ['Line three']);

// ── FreeShow ──
const freeShow = JSON.stringify([
  'show1',
  {
    name: 'Way Maker file',
    meta: { title: 'Way Maker', artist: 'Sinach', CCLI: '7115744', copyright: '2016 Integrity' },
    settings: { activeLayout: 'L1' },
    slides: {
      a: { group: 'Verse', items: [{ type: 'text', lines: [{ text: [{ value: 'You are here, ' }, { value: 'moving in our midst' }] }] }], children: ['a2'] },
      a2: { group: null, items: [{ lines: [{ text: [{ value: 'I worship You' }] }] }] },
      b: {
        group: 'Chorus',
        items: [
          { type: 'text', lines: [{ text: [{ value: 'Way maker' }] }] },
          { type: 'text', language: 'de', lines: [{ text: [{ value: 'Wegbereiter' }] }] },
        ],
      },
      c: { group: 'Verse', items: [{ type: 'text', lines: [{ text: [{ value: 'You are here, touching every heart' }] }] }] },
      d: { group: 'Tag', items: [{ type: 'text', lines: [{ text: [{ value: 'Even when I don’t see it' }] }] }] },
    },
    layouts: { L1: { name: 'Default', slides: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'b' }, { id: 'd', disabled: true }] } },
  },
]);
const fs = FreeShowSong(freeShow);
assert.equal(fs.title, 'Way Maker');
assert.equal(fs.authors, 'Sinach');
assert.equal(fs.ccliNumber, '7115744');
assert.deepEqual(fs.blocks['Verse 1'], ['You are here, moving in our midst', '---', 'I worship You'], 'a child slide is the next page');
assert.deepEqual(fs.blocks.Chorus, ['Way maker', '[DE] Wegbereiter'], 'a translated textbox becomes [XX] lines');
assert.deepEqual(fs.blocks['Verse 2'], ['You are here, touching every heart'], 'a group used twice is numbered');
assert.deepEqual(fs.order.Default, ['Verse 1', 'Chorus', 'Verse 2', 'Chorus'], 'the layout order, without disabled slides');
assert.ok(fs.blocks.Tag, 'a disabled slide is still part of the song');
assert.equal(FreeShowSong(JSON.stringify({ name: 'Bare', slides: {}, layouts: {} })).title, 'Bare', 'the documented bare object works too');

// ── Routing by extension ──
assert.equal(importerFor('Lied.XML'), OpenLyricsSong);
assert.equal(importerFor('song.chordpro'), ChordProSong);
assert.equal(importerFor('song.cho'), ChordProSong);
assert.equal(importerFor('Way Maker.show'), FreeShowSong);
assert.equal(importerFor('Lied.sng'), null, 'SongBeamer keeps its own parser');

rmSync(dir, { recursive: true, force: true });
console.log('PASS song import: OpenLyrics, ChordPro, FreeShow');
