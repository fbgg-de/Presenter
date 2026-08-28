/**
 * Lyric block parse/serialise round-trip test.
 *
 *   node test/lyrics/run.mjs
 *
 * `src/renderer/src/song/lyrics.ts` is a view over the stored block format, not a new one:
 * the song editor parses a block's flat `string[]` into lyric lines (one primary line plus its
 * translations) and writes it straight back. Every presentation surface still reads the flat
 * form, so a parse/serialise pair that is not faithful silently corrupts songs on save.
 *
 * These checks pin that faithfulness down: exact round trips, where the empty anchor line that
 * keeps a translation-only line separate is and is not required, page breaks, and the retagging
 * that happens when the default language changes.
 *
 * The module is bundled with esbuild against a stub of the `@/song` barrel, so the test runs on
 * plain node with no renderer, DOM or store in the way.
 */
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'lyrics-'));
const shim = join(dir, 'index.ts');

/**
 * Stand-in for the `@/song` barrel, so the test pulls in the lyric module alone rather than the
 * whole app. The constants are lifted verbatim out of the real barrel instead of being copied
 * here — a hand-written copy silently stopped matching once the tag regex was widened, which
 * meant the suite was passing against a format the app no longer used.
 */
const barrel = readFileSync('src/renderer/src/song/index.ts', 'utf8');
const lift = (name) => {
  const match = barrel.match(new RegExp(`^export const ${name} = .*$`, 'm'));
  if (!match) throw new Error(`test shim: ${name} is no longer declared in song/index.ts`);
  return match[0];
};

writeFileSync(
  shim,
  [
    'export type TBlocks = { [key: string]: string[] };',
    lift('SONG_BLOCK_SEPARATOR'),
    lift('SONG_TRANSLATION_LINE_REGEX'),
    lift('LANGUAGE_CODE_REGEX'),
  ].join('\n'),
);

await build({
  entryPoints: [
    'src/renderer/src/song/lyrics.ts',
    'src/renderer/src/song/detectLanguage.ts',
    'src/renderer/src/presentation/lineFilter.ts',
    'src/renderer/src/utils/languageSlots.ts',
  ],
  bundle: true,
  format: 'esm',
  outdir: dir,
  outbase: 'src/renderer/src',
  platform: 'node',
  plugins: [
    {
      name: 'song-barrel-stub',
      setup(b) {
        b.onResolve({ filter: /^\.$/ }, () => ({ path: shim }));
      },
    },
  ],
});

const L = await import(pathToFileURL(join(dir, 'song', 'lyrics.js')).href);
const D = await import(pathToFileURL(join(dir, 'song', 'detectLanguage.js')).href);
const F = await import(pathToFileURL(join(dir, 'presentation', 'lineFilter.js')).href);
const S = await import(pathToFileURL(join(dir, 'utils', 'languageSlots.js')).href);

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

// 1. Round-trip of a fully tagged two-language block. Every line names its language, the
// default one included, so nothing depends on the absence of a tag any more.
const block = ['[EN] Amazing grace', '[DE] Erstaunliche Gnade', '[EN] How sweet the sound', '[DE] Wie suess der Klang'];
const pages = L.parseBlockLines(block, 'EN');
eq('parse: one page', pages.length, 1);
eq('parse: two lyric lines', pages[0].lines.length, 2);
eq('parse: line 1 texts', pages[0].lines[0].texts, { '': 'Amazing grace', DE: 'Erstaunliche Gnade' });
eq('round-trip EN/DE', L.serialiseBlockLines(pages, ['EN', 'DE']), block);

// 1b. Songs saved before tags were explicit still read correctly, and writing one back tags it
const legacy = ['Amazing grace', '[DE] Erstaunliche Gnade'];
const legacyPages = L.parseBlockLines(legacy, 'EN');
eq('untagged line is still the primary', legacyPages[0].lines[0].texts, { '': 'Amazing grace', DE: 'Erstaunliche Gnade' });
eq('saving a legacy block tags it', L.serialiseBlockLines(legacyPages, ['EN', 'DE']), ['[EN] Amazing grace', '[DE] Erstaunliche Gnade']);

// 1c. A song that never declared a language is left exactly as it was
eq('no language list, no tags written', L.serialiseBlockLines(L.parseBlockLines(legacy), []), legacy);

// 2. Page breaks survive
const paged = ['[EN] One', '[DE] Eins', '---', '[EN] Two', '[DE] Zwei'];
const p2 = L.parseBlockLines(paged, 'EN');
eq('parse: two pages', p2.length, 2);
eq('round-trip with page break', L.serialiseBlockLines(p2, ['EN', 'DE']), paged);

// 3. Repeated same-language tags start new lines
const p3 = L.parseBlockLines(['[DE] Eins', '[DE] Zwei'], 'EN');
eq('repeated tag splits lines', p3[0].lines.length, 2);
eq('orphan translations round-trip', L.serialiseBlockLines(p3, ['EN', 'DE']), ['[DE] Eins', '[DE] Zwei']);

// 4. Blank lines in the middle are kept, trailing scaffolding is dropped
// A blank line is spacing rather than a lyric, so it stays bare instead of becoming an
// empty line of the default language.
const p4 = L.parseBlockLines(['[EN] One', '', '[EN] Two'], 'EN');
eq('blank line kept and left untagged', L.serialiseBlockLines(p4, ['EN']), ['[EN] One', '', '[EN] Two']);
p4[0].lines.push(L.createLyricLine());
eq('trailing empty dropped', L.serialiseBlockLines(p4, ['EN']), ['[EN] One', '', '[EN] Two']);

// 5. Promoting DE to default retags the block
const p5 = L.parseBlockLines(block, 'EN');
const swapped = L.swapPrimaryLanguage(p5, 'EN', 'DE');
eq('swap: German leads now', L.serialiseBlockLines(swapped, ['DE', 'EN']), [
  '[DE] Erstaunliche Gnade',
  '[EN] Amazing grace',
  '[DE] Wie suess der Klang',
  '[EN] How sweet the sound',
]);
eq('swap is reversible', L.serialiseBlockLines(L.swapPrimaryLanguage(swapped, 'DE', 'EN'), ['EN', 'DE']), block);

// 6. Serialisation order follows the song's language list
const p6 = L.parseBlockLines(['[EN] Line', '[DE] Zeile', '[FR] Ligne'], 'EN');
eq('order follows list', L.serialiseBlockLines(p6, ['EN', 'FR', 'DE']), ['[EN] Line', '[FR] Ligne', '[DE] Zeile']);

// 7. A language dropped from the list still keeps its text
eq('dropped language preserved', L.serialiseBlockLines(p6, ['EN']), ['[EN] Line', '[DE] Zeile', '[FR] Ligne']);

// 8. detectSongLanguages finds every tag, the default one included
eq('detect', L.detectSongLanguages({ a: block, b: ['x', '[FR] y'] }), ['EN', 'DE', 'FR']);

// 9. Empty block gives one typing row and serialises back to nothing
const p9 = L.parseBlockLines([]);
eq('empty block has a row', p9[0].lines.length, 1);
eq('empty block serialises empty', L.serialiseBlockLines(p9, ['EN']), []);

// 10. A translation-only line stays its own line after a round trip.
// Repeating a language the line above already has is enough to split it, so no blank anchor
// line is written — that keeps an empty row off the screen.
const p10 = L.parseBlockLines(['[EN] Line one', '[DE] Zeile eins'], 'EN');
p10[0].lines.push(L.createLyricLine({ DE: 'Nur Deutsch' }));
const s10 = L.serialiseBlockLines(p10, ['EN', 'DE']);
eq('no needless anchor', s10, ['[EN] Line one', '[DE] Zeile eins', '[DE] Nur Deutsch']);
eq('still two lines after re-parse', L.parseBlockLines(s10, 'EN')[0].lines.length, 2);

// 11. When the language does not repeat, an anchor is required or the two lines merge
const p11 = L.parseBlockLines(['[EN] Line one', '[DE] Zeile eins'], 'EN');
p11[0].lines.push(L.createLyricLine({ FR: 'Ligne deux' }));
const s11 = L.serialiseBlockLines(p11, ['EN', 'DE', 'FR']);
eq('anchor written when needed', s11, ['[EN] Line one', '[DE] Zeile eins', '', '[FR] Ligne deux']);
const r11 = L.parseBlockLines(s11, 'EN')[0].lines;
eq('anchored line survives re-parse', r11.length, 2);
eq('anchored line keeps its own text', r11[1].texts, { '': '', FR: 'Ligne deux' });

// 12. A page that opens with a translation has nothing above it to merge into
const p12 = L.parseBlockLines(['[EN] A', '---', '[DE] Zwei'], 'EN');
eq('page-leading translation needs no anchor', L.serialiseBlockLines(p12, ['EN', 'DE']), ['[EN] A', '---', '[DE] Zwei']);

// 13. The flat editing view round-trips, and a drag across a break moves the line's page
const p13 = L.parseBlockLines(['[EN] One', '[EN] Two', '---', '[EN] Three'], 'EN');
const items = L.pagesToItems(p13);
eq(
  'items: line, line, break, line',
  items.map((i) => i.kind),
  ['line', 'line', 'break', 'line'],
);
eq('items round-trip', L.serialiseBlockLines(L.itemsToPages(items, p13[0].id), ['EN']), ['[EN] One', '[EN] Two', '---', '[EN] Three']);
eq('first page id preserved', L.itemsToPages(items, p13[0].id)[0].id, p13[0].id);

// Move "Two" past the break: it should land on page two
const moved = [items[0], items[2], items[1], items[3]];
eq('drag across a break changes page', L.serialiseBlockLines(L.itemsToPages(moved, p13[0].id), ['EN']), [
  '[EN] One',
  '---',
  '[EN] Two',
  '[EN] Three',
]);

// 14. Fuzz: parsing is idempotent across a serialise round trip.
// Whatever the editor holds, writing it out and reading it back must give the same structure,
// or a save-reopen-save cycle would keep mutating the song.
const vocab = ['Line', '', 'A longer lyric line', 'Hallelujah'];
const codes = ['DE', 'FR', 'ES'];
let seed = 42;
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const structure = (parsed) => parsed.map((page) => page.lines.map((line) => line.texts));

for (let run = 0; run < 500; run++) {
  const raw = [];
  const length = 1 + rand(8);
  for (let i = 0; i < length; i++) {
    const roll = rand(10);
    if (roll === 0) raw.push('---');
    else if (roll <= 3) raw.push(`[${codes[rand(codes.length)]}] ${vocab[rand(vocab.length)]}`);
    else raw.push(vocab[rand(vocab.length)]);
  }

  const once = L.parseBlockLines(raw, 'EN');
  const twice = L.parseBlockLines(L.serialiseBlockLines(once, ['EN', ...codes]), 'EN');

  if (JSON.stringify(structure(once)) !== JSON.stringify(structure(twice))) {
    failed++;
    console.log(`FAIL fuzz idempotence on ${JSON.stringify(raw)}`);
    console.log(`  once  ${JSON.stringify(structure(once))}`);
    console.log(`  twice ${JSON.stringify(structure(twice))}`);
    break;
  }
}
if (!failed) console.log('ok   fuzz: parse is idempotent over 500 random blocks');

// ── Tagging helpers ───────────────────────────────────────────────────────────

// 15. Untagged lines get an explicit tag; already-tagged lines and spacing are untouched
const mixed = { V1: ['Line one', '[DE] Zeile eins', '', '---', 'Line two'] };
eq('hasUntaggedLines', L.hasUntaggedLines(mixed), true);
const tagged = L.tagUntaggedLines(mixed, 'en');
eq('tagUntaggedLines', tagged.V1, ['[EN] Line one', '[DE] Zeile eins', '', '---', '[EN] Line two']);
eq('tagging is idempotent', L.tagUntaggedLines(tagged, 'EN').V1, tagged.V1);
eq('nothing untagged afterwards', L.hasUntaggedLines(tagged), false);

// 16. Text is grouped by tag, with untagged text under the primary key
eq('collectTextByLanguage', L.collectTextByLanguage(mixed), { '': 'Line one\nLine two', DE: 'Zeile eins' });

// ── Language detection ────────────────────────────────────────────────────────
//
// The sample texts below are written for this test, not taken from any song. They are the kind
// of plain devotional prose the detector will meet, at roughly the length of one song.

const SAMPLES = {
  EN: 'We come before you with open hands and with open hearts. You are the one who never leaves us on our own. In the morning and in the night we will not be afraid, for your love is with us and it will not let go of us.',
  DE: 'Wir kommen zu dir mit offenen Händen und mit offenen Herzen. Du bist der eine, der uns niemals allein lässt. Am Morgen und in der Nacht werden wir uns nicht fürchten, denn deine Liebe ist bei uns und sie lässt uns nicht los.',
  NL: 'Wij komen naar u met open handen en met een open hart. U bent degene die ons nooit alleen laat. In de morgen en in de nacht zijn wij niet bang, want uw liefde is bij ons en zij laat ons niet los.',
  FR: 'Nous venons vers toi avec les mains ouvertes et le cœur ouvert. Tu es celui qui ne nous laisse jamais seuls. Le matin et dans la nuit nous n avons pas peur, car ton amour est avec nous et il ne nous quitte pas.',
  ES: 'Venimos a ti con las manos abiertas y con el corazón abierto. Tú eres el que nunca nos deja solos. En la mañana y en la noche no tendremos miedo, porque tu amor está con nosotros y no nos suelta.',
  PL: 'Przychodzimy do ciebie z otwartymi rękami i z otwartym sercem. Ty jesteś tym, który nigdy nas nie zostawia samych. Rano i w nocy nie będziemy się bać, bo twoja miłość jest z nami i nas nie puszcza.',
};

for (const [code, text] of Object.entries(SAMPLES)) {
  const guess = D.bestGuess(text);
  const label = `detect ${code} against every language`;
  if (!guess || guess.language !== code) {
    failed++;
    console.log(`FAIL ${label}\n  got  ${guess ? `${guess.language} (${guess.score.toFixed(3)})` : 'nothing'}`);
  } else if (guess.confidence < D.CONFIDENT_THRESHOLD) {
    failed++;
    console.log(`FAIL ${label} — right answer but only ${guess.confidence.toFixed(2)} confident`);
  } else {
    console.log(`ok   ${label} (${guess.confidence.toFixed(2)} confident)`);
  }
}

// 17. A candidate list is the normal case: the account pool, two or three languages
eq('DE against an EN/DE pool', D.bestGuess(SAMPLES.DE, ['EN', 'DE']).language, 'DE');
eq('EN against an EN/DE pool', D.bestGuess(SAMPLES.EN, ['EN', 'DE']).language, 'EN');
eq('NL against an NL/DE pool', D.bestGuess(SAMPLES.NL, ['NL', 'DE']).language, 'NL');
const wrongPool = D.detectLanguage(SAMPLES.DE, ['FR', 'ES']);
eq(
  'German against an FR/ES pool is never confident',
  wrongPool.every((g) => g.confidence < D.CONFIDENT_THRESHOLD),
  true,
);

// 18. Too little text is reported as uncertain rather than guessed at
const short = D.bestGuess('Halleluja', ['EN', 'DE']);
eq('one word is not confident', !short || short.confidence < D.CONFIDENT_THRESHOLD, true);
eq('empty text detects nothing', D.detectLanguage('', ['EN', 'DE']), []);
eq('no words detects nothing', D.detectLanguage('1234 5678', ['EN', 'DE']), []);

// 19. An exclusive character carries a short phrase the word counts could not
const sharp = D.bestGuess('Größe und Weiß', ['EN', 'DE']);
eq('ß identifies German', sharp?.language, 'DE');

// 20. A distinctive script settles it without word counting
eq('Greek script', D.bestGuess('Ερχόμαστε σε σένα με ανοιχτά χέρια')?.language, 'EL');
eq('Cyrillic script', D.bestGuess('Мы приходим к тебе с открытыми руками')?.language, 'RU');
// Cyrillic is shared by several languages, so it is deliberately not reported as certain
eq('shared script is not certain', D.bestGuess('Мы приходим к тебе').confidence < D.CONFIDENT_THRESHOLD, true);

// 21. The detector's whole job in one line: what language are a song's untagged lines?
const legacySong = {
  V1: ['Wir kommen zu dir mit offenen Händen', '[EN] We come before you with open hands'],
  C: ['Denn deine Liebe ist bei uns und sie lässt uns nicht los'],
};
const untagged = L.collectTextByLanguage(legacySong)[''];
eq('untagged text of a legacy song is German', D.bestGuess(untagged, ['EN', 'DE'])?.language, 'DE');
eq('and its English tag still reads as English', D.bestGuess(L.collectTextByLanguage(legacySong).EN, ['EN', 'DE'])?.language, 'EN');

// ── Display filtering ─────────────────────────────────────────────────────────
//
// filterLinesByLanguage decides what a presentation window actually shows. It groups each
// primary line with its translations, and which line is primary depends on whether the song
// tags its default language or marks it by carrying no tag.

const texts = (lines) => lines.map((l) => l.text);

// A fully tagged song: EN is the anchor, DE hangs off it
const bilingual = [
  { text: 'Line one', language: 'EN' },
  { text: 'Zeile eins', language: 'DE' },
  { text: 'Line two', language: 'EN' },
  { text: 'Zeile zwei', language: 'DE' },
];

eq('no filter passes everything through', texts(F.filterLinesByLanguage(bilingual, undefined, 'EN')), [
  'Line one',
  'Zeile eins',
  'Line two',
  'Zeile zwei',
]);
eq('filter to both keeps both, in list order', texts(F.filterLinesByLanguage(bilingual, ['EN', 'DE'], 'EN')), [
  'Line one',
  'Zeile eins',
  'Line two',
  'Zeile zwei',
]);
eq('the list decides the order within a line', texts(F.filterLinesByLanguage(bilingual, ['DE', 'EN'], 'EN')), [
  'Zeile eins',
  'Line one',
  'Zeile zwei',
  'Line two',
]);
eq('showing only the default drops the translations', texts(F.filterLinesByLanguage(bilingual, ['EN'], 'EN')), ['Line one', 'Line two']);

// This is the case the old format could not express: the primary line was the untagged anchor
// and had to be emitted to hold each group together, so the original could never be hidden.
eq('showing only the translation hides the original', texts(F.filterLinesByLanguage(bilingual, ['DE'], 'EN')), [
  'Zeile eins',
  'Zeile zwei',
]);

// A song saved before tags were explicit: the untagged line is the anchor and has no name to
// filter by, so it is always shown rather than vanishing along with its group.
const legacyLines = [
  { text: 'Line one' },
  { text: 'Zeile eins', language: 'DE' },
  { text: 'Line two' },
  { text: 'Zeile zwei', language: 'DE' },
];

eq('untagged anchors survive a filter that cannot name them', texts(F.filterLinesByLanguage(legacyLines, ['DE'])), [
  'Zeile eins',
  'Line one',
  'Zeile zwei',
  'Line two',
]);
eq('untagged song still groups without a primary language', texts(F.filterLinesByLanguage(legacyLines, ['', 'DE'])), [
  'Line one',
  'Zeile eins',
  'Line two',
  'Zeile zwei',
]);

// Without the anchor language a fully tagged block has no group boundaries at all: every line
// looks like a translation, they all collapse into one group, and only the last of each
// language survives — three of the four lines simply vanish from the screen. This is the
// breakage the primaryLanguage field exists to prevent, so it is pinned down here.
eq('grouping collapses without the anchor language', texts(F.filterLinesByLanguage(bilingual, ['EN'])), ['Line two']);
eq('and is correct once it is supplied', texts(F.filterLinesByLanguage(bilingual, ['EN'], 'EN')), ['Line one', 'Line two']);

// ── Language slots ────────────────────────────────────────────────────────────
//
// A style names positions, not languages: slot 1 is whatever the song lists first. These check
// the mapping in both directions, since getting it wrong would style the main lines of one song
// and the translations of the next.

const song = ['EN', 'DE', 'FR'];

eq('main language is slot 1', S.slotForLanguage('EN', song), 1);
eq('second language is slot 2', S.slotForLanguage('DE', song), 2);
eq('third language is slot 3', S.slotForLanguage('FR', song), 3);
eq('slot lookup ignores case', S.slotForLanguage('de', song), 2);
eq('a language the song does not list has no slot', S.slotForLanguage('ES', song), undefined);
// An untagged line is how songs written before tagging mark their primary lines.
eq('an untagged line is the main language', S.slotForLanguage(undefined, song), 1);

// The same style, applied to two songs with opposite language orders. This is the whole point:
// "second language" follows the song, so one design serves both.
const styleEntries = [{ slot: 1 }, { slot: 2 }];
eq('slot 2 is German here', S.languagesForStyle(styleEntries, ['EN', 'DE']), ['EN', 'DE']);
eq('and English there, unchanged style', S.languagesForStyle(styleEntries, ['DE', 'EN']), ['DE', 'EN']);

// Visibility is per slot, and hiding one does not disturb the others
eq('a hidden slot drops out', S.languagesForStyle([{ slot: 1 }, { slot: 2, visible: false }], song), ['EN']);
eq('showing only the translation', S.languagesForStyle([{ slot: 1, visible: false }, { slot: 2 }], song), ['DE']);
eq('slots default to visible', S.visibleSlots([{ slot: 1 }, { slot: 3 }]), [1, 3]);

// A style configured for more languages than the song has simply shows fewer
eq('missing slots drop out', S.languagesForStyle([{ slot: 1 }, { slot: 2 }, { slot: 3 }], ['EN']), ['EN']);

// "No opinion" has to stay distinguishable from "show nothing", or a style that never touched
// languages would blank every translation.
eq('a style with no entries expresses no preference', S.languagesForStyle([], song), undefined);
eq('nor does an undefined list', S.languagesForStyle(undefined, song), undefined);
eq('show-all overrides the slots', S.languagesForStyle([{ slot: 1 }], song, true), undefined);

// End to end: the style's slots decide what the window shows, for this song
const lines = [
  { text: 'Line one', language: 'EN' },
  { text: 'Zeile eins', language: 'DE' },
  { text: 'Ligne un', language: 'FR' },
];
const shown = (entries, songLangs) => texts(F.filterLinesByLanguage(lines, S.languagesForStyle(entries, songLangs), songLangs[0]));

eq('style showing slots 1 and 2', shown([{ slot: 1 }, { slot: 2 }], song), ['Line one', 'Zeile eins']);
eq('style showing slot 1 and 3', shown([{ slot: 1 }, { slot: 3 }], song), ['Line one', 'Ligne un']);
eq('style hiding the main language', shown([{ slot: 1, visible: false }, { slot: 2 }], song), ['Zeile eins']);

// ── Styles saved before slots existed ─────────────────────────────────────────
//
// Migration 21 converts these server-side, but a style can still arrive unconverted — an
// un-migrated database, or an older style imported later. Reading one has to work, because
// entries without a slot all collapse onto `undefined`: duplicate React keys, and a row of
// blank language labels on screen instead of anything that looks like a problem.

const legacyEntries = [{ language: '', fontColor: '#fff' }, { language: 'de' }, { language: 'fr' }];

eq(
  'legacy entries take slots from their position',
  S.normaliseLanguageEntries(legacyEntries).map((entry) => entry.slot),
  [1, 2, 3],
);
eq('the default entry becomes the main slot', S.normaliseLanguageEntries(legacyEntries)[0].fontColor, '#fff');
eq('legacy entries yield real slots, not undefined', S.visibleSlots(legacyEntries), [1, 2, 3]);
eq('and map onto a song the same way converted ones do', S.languagesForStyle(legacyEntries, ['EN', 'DE', 'FR']), ['EN', 'DE', 'FR']);
eq('entryForSlot reaches a legacy entry', S.entryForSlot(legacyEntries, 2)?.language, 'de');

// A list with no default entry starts its translations at slot 2, leaving the main slot unstyled
eq(
  'no default entry leaves slot 1 free',
  S.normaliseLanguageEntries([{ language: 'de' }, { language: 'fr' }]).map((entry) => entry.slot),
  [2, 3],
);

// Already-converted entries are left exactly alone, so this is safe to run on every read
const converted = [{ slot: 1 }, { slot: 2, visible: false }];
eq('converted entries pass through untouched', S.normaliseLanguageEntries(converted), converted);
eq('a hidden converted slot stays hidden', S.visibleSlots(converted), [1]);
eq('empty in, empty out', S.normaliseLanguageEntries(undefined), []);

// ── Songs that never recorded their language list ─────────────────────────────
//
// Migration 21 adds the column; it does not fill it. Until the language review runs, a whole
// library carries no list — and a style's per-slot typography then has nothing to attach to,
// so translations render completely unstyled. The languages have to come off the lyrics.

const untaggedMain = ['Line one', '[DE] Zeile eins', '[FR] Ligne un'];
eq('untagged main line holds slot 1', L.inferSongLanguages(untaggedMain), ['', 'DE', 'FR']);
eq('so a translation resolves to a real slot', S.slotForLanguage('DE', L.inferSongLanguages(untaggedMain)), 2);
eq('and the third language to the next one', S.slotForLanguage('FR', L.inferSongLanguages(untaggedMain)), 3);

// A fully tagged song names every slot itself, so nothing is prepended
eq('fully tagged needs no placeholder', L.inferSongLanguages(['[EN] One', '[DE] Eins']), ['EN', 'DE']);
eq('its main language is slot 1', S.slotForLanguage('EN', L.inferSongLanguages(['[EN] One', '[DE] Eins'])), 1);

// Separators and blank lines are not lyrics
eq('separators ignored', L.inferSongLanguages(['[EN] One', '---', '', '[DE] Eins']), ['EN', 'DE']);

// The empty slot-1 code must survive the display filter, or a style could not hide anything
// on a song whose main lines are untagged.
eq('empty code kept in the filter', S.languagesForStyle([{ slot: 1 }, { slot: 2 }], ['', 'DE']), ['', 'DE']);
eq('hiding slot 1 still works there', S.languagesForStyle([{ slot: 1, visible: false }, { slot: 2 }], ['', 'DE']), ['DE']);
eq('a slot the song lacks still drops out', S.languagesForStyle([{ slot: 1 }, { slot: 2 }], ['']), ['']);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
