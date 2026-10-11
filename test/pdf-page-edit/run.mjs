/**
 * PDF page editor core: moving a lassoed region between pages, erasing, deleting a page, and
 * carrying annotations and block mappings along.
 *
 *   node test/pdf-page-edit/run.mjs
 *
 * `src/renderer/src/components/pdf/pageEdit/pageEdits.ts` is bundled with esbuild and run on
 * plain node. Placement is checked behaviourally: pdf.js reads back where a moved word ended up
 * in user space. (It cannot tell clipped from visible — text extraction ignores clipping — so the
 * lasso's clip itself is covered by looking at the page in the editor, not here.)
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { PDFDocument, StandardFonts, concatTransformationMatrix } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const dir = mkdtempSync(join(tmpdir(), 'pdf-page-edit-'));
await build({
  entryPoints: ['src/renderer/src/components/pdf/pageEdit/pageEdits.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(dir, 'pageEdits.mjs'),
  alias: { '@': resolve('src/renderer/src') },
  logLevel: 'error',
});
const E = await import(pathToFileURL(join(dir, 'pageEdits.mjs')).href);

let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  } else console.log(`ok   ${name}`);
};
const near = (name, got, want, tolerance = 0.5) => {
  const ok = got && want.every((v, i) => Math.abs(got[i] - v) <= tolerance);
  if (!ok) {
    failed++;
    console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  } else console.log(`ok   ${name}`);
};

/** Where each word sits per page, in user space, as pdf.js reads it. */
async function wordsByPage(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { items } = await page.getTextContent();
    pages.push(Object.fromEntries(items.filter((it) => it.str.trim()).map((it) => [it.str, [it.transform[4], it.transform[5]]])));
  }
  await doc.destroy();
  return pages;
}

/** Two A4 pages, words at known places. `flip` reproduces wkhtmltopdf's never-restored `cm`. */
async function makePdf({ flip = false, mediaOrigin = [0, 0] } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [ox, oy] = mediaOrigin;
  for (const words of [{ ONE: [50, 700] }, { MOVEME: [60, 700], STAY: [60, 100] }]) {
    const page = doc.addPage([595, 842]);
    page.setMediaBox(ox, oy, 595, 842);
    for (const [text, [x, y]] of Object.entries(words)) page.drawText(text, { x: ox + x, y: oy + y, size: 20, font });
    // Pushed after the text so the words stay put; anything appended later inherits the flip.
    if (flip) page.pushOperators(concatTransformationMatrix(0.75, 0, 0, -0.75, 33.75, 808.25));
  }
  return doc.save();
}

const around = (x, y, w = 140, h = 40) => [
  [x - 10, y - 10],
  [x + w, y - 10],
  [x + w, y + h],
  [x - 10, y + h],
];

// ── Moving ──────────────────────────────────────────────────────────────────

{
  const moved = await E.applyPageEdit(await makePdf(), { kind: 'move', from: 1, to: 0, polygon: around(60, 700), dx: 250, dy: -450 });
  const pages = await wordsByPage(moved);
  near('a moved word lands where it was dropped', pages[0].MOVEME, [310, 250]);
  near('the target keeps its own content', pages[0].ONE, [50, 700]);
  near('the source text stays underneath the white-out', pages[1].MOVEME, [60, 700]);
}

{
  // The real chart's problem: its content flips the page and never restores it.
  const moved = await E.applyPageEdit(await makePdf({ flip: true }), {
    kind: 'move',
    from: 1,
    to: 0,
    polygon: around(60, 700),
    dx: 250,
    dy: -450,
  });
  near('a stray transform in the target does not throw the move off', (await wordsByPage(moved))[0].MOVEME, [310, 250]);
}

{
  const moved = await E.applyPageEdit(await makePdf({ mediaOrigin: [100, 50] }), {
    kind: 'move',
    from: 1,
    to: 0,
    polygon: around(160, 750),
    dx: 200,
    dy: -400,
  });
  near('a page box off the origin moves by plain offsets', (await wordsByPage(moved))[0].MOVEME, [360, 350]);
}

{
  const same = await E.applyPageEdit(await makePdf(), { kind: 'move', from: 1, to: 1, polygon: around(60, 100), dx: 300, dy: 0 });
  const words = (await wordsByPage(same))[1];
  eq('moving within a page keeps the page count', (await PDFDocument.load(same)).getPageCount(), 2);
  // Both copies read back (the old one under its white-out); the moved one is drawn last, so it wins.
  near('within a page: the copy sits at the new place', words.STAY, [360, 100]);
}

// ── Deleting and erasing ────────────────────────────────────────────────────

{
  const bytes = await E.applyPageEdit(await makePdf(), { kind: 'delete', page: 1 });
  const pages = await wordsByPage(bytes);
  eq('delete drops the page', pages.length, 1);
  eq('and keeps the others', Object.keys(pages[0]), ['ONE']);
  const erased = await E.applyPageEdit(await makePdf(), { kind: 'erase', page: 1, polygon: around(60, 700) });
  eq('erase keeps the page count', (await PDFDocument.load(erased)).getPageCount(), 2);
}

// ── Coordinates ─────────────────────────────────────────────────────────────

const A4 = [0, 0, 595, 842];
near('percent → point (origin top-left → bottom-left)', E.percentToPoint(A4, 50, 25), [297.5, 631.5]);
const back = E.pointToPercent(A4, [297.5, 631.5]);
near('point → percent round trips', [back.x, back.y], [50, 25]);
eq('inside the lasso', E.insidePolygon([5, 5], around(0, 0, 10, 10)), true);
eq('outside the lasso', E.insidePolygon([50, 50], around(0, 0, 10, 10)), false);

// ── Annotations and mappings follow the content ─────────────────────────────

const move = { kind: 'move', from: 1, to: 0, polygon: around(60, 700), dx: 250, dy: -450 };
// MOVEME's box in percent on page 2 is around x≈10–33 %, y≈12–18 %.
const stroke = {
  page: 2,
  x: 12,
  y: 15,
  data: {
    points: [
      { x: 12, y: 15 },
      { x: 20, y: 16 },
    ],
  },
};
const movedStroke = E.remapAnnotation(stroke, move, [A4, A4]);
eq('a stroke inside the lasso moves to the target page', movedStroke.page, 1);
near('and by the same offset', [movedStroke.x, movedStroke.data.points[1].x], [12 + (250 / 595) * 100, 20 + (250 / 595) * 100], 0.01);
near('down is up in percent', [movedStroke.y], [15 + (450 / 842) * 100], 0.01);
eq('a note elsewhere on the page stays', E.remapAnnotation({ page: 2, x: 80, y: 80, data: {} }, move, [A4, A4]).page, 2);
eq('a note on another page stays', E.remapAnnotation({ page: 1, x: 12, y: 15, data: {} }, move, [A4, A4]).page, 1);

const deletion = { kind: 'delete', page: 0 };
eq('a note on a deleted page goes', E.remapAnnotation({ page: 1, x: 5, y: 5, data: {} }, deletion, [A4, A4]), null);
eq('later pages move up', E.remapAnnotation({ page: 2, x: 5, y: 5, data: {} }, deletion, [A4, A4]).page, 1);
eq(
  'an erase leaves the musicians’ marks alone',
  E.remapAnnotation(stroke, { kind: 'erase', page: 1, polygon: around(60, 700) }, [A4, A4]),
  stroke,
);

const mapping = { blockName: 'Bridge', page: 2, region: { x: 8, y: 13, width: 20, height: 6 } };
const movedMapping = E.remapMapping(mapping, move, [A4, A4]);
eq('a block mapping inside the lasso moves with it', movedMapping.page, 1);
near('its region shifts, its size stays', [movedMapping.region.width, movedMapping.region.height], [20, 6], 0.001);
eq('a mapping without a region only follows its page', E.remapMapping({ blockName: 'V', page: 2 }, deletion, [A4, A4]), {
  blockName: 'V',
  page: 1,
});

const half = [0, 0, 297.5, 421];
// Boxes are by page: the target (page 1) is the half-size one.
const scaled = E.remapAnnotation({ page: 2, x: 10, y: 13, data: { width: 20, height: 6 } }, move, [half, A4]);
near('a smaller target page scales boxes up in percent', [scaled.data.width, scaled.data.height], [40, 12], 0.001);

const chained = E.throughEdits(
  stroke,
  [move, { kind: 'delete', page: 1 }],
  [
    [A4, A4],
    [A4, A4],
  ],
  E.remapAnnotation,
);
eq('edits chain: moved off page 2, then page 2 deleted — the stroke survives on page 1', chained.page, 1);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
