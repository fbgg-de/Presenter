/**
 * Document entries (PDF, PowerPoint): file kinds, pages and click builds as navigation steps, and
 * what the screens are sent for a step.
 *
 *   node test/document-items/run.mjs
 */
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'document-items-'));

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

const D = await bundle('src/renderer/src/document/document.ts', 'document.mjs');

eq('kinds by extension, any case', ['a.PDF', 'b.pptx', 'c.ppsx', 'd.ppt', 'e.key', 'f.odp'].map(D.documentKindOf), [
  'pdf',
  'pptx',
  'pptx',
  undefined,
  undefined,
  undefined,
]);

// Page 1 static, page 2 with two click builds, page 3 static.
const builds = [0, 2, 0];
eq('steps: each page, then its builds', D.documentSteps(builds).map(D.documentStepName), ['1', '2', '2.1', '2.2', '3']);
eq(
  'a page starts where its builds follow the previous page',
  [0, 1, 2].map((page) => D.documentBlockOfPage(builds, page)),
  [0, 1, 4],
);
eq('a document not read yet is one page', D.documentSteps(undefined), [{ page: 0, step: 0 }]);
eq('a PDF has no builds', D.documentSteps([0, 0]).length, 2);

// The set list's pill: slides for PowerPoint, pages for PDF, no count before the file was read.
const LL = {
  DOCUMENT: {
    SLIDES: ({ count }) => `${count} slides`,
    PAGES: ({ count }) => `${count} pages`,
    HIDDEN_COUNT: ({ count }) => `${count} left out`,
  },
};
eq(
  'summary names the format and counts pages once known',
  [
    { mediaPath: 'a/Talk.pptx', documentBuilds: [0, 2, 0] },
    { mediaPath: 'Notes.pdf', documentBuilds: [0, 0] },
    { mediaPath: 'New.ppsx' },
  ].map((item) => D.documentSummary(LL, item)),
  ['PowerPoint · 3 slides', 'PDF · 2 pages', 'PowerPoint'],
);
eq(
  'and how many pages are left out',
  D.documentSummary(LL, { mediaPath: 'a.pptx', documentBuilds: [0, 2, 0], documentHidden: [1] }),
  'PowerPoint · 3 slides · 1 left out',
);

// Pages left out of the show: their steps go, the rest keep their names.
eq('a left-out page and its builds are skipped', D.documentSteps(builds, [1]).map(D.documentStepName), ['1', '3']);
eq('a left-out page has no step to go to', [D.documentBlockOfPage(builds, 1, [1]), D.documentBlockOfPage(builds, 2, [1])], [-1, 1]);
eq('leaving out every page leaves them all in', D.documentSteps([0, 0], [0, 1]).length, 2);

// Pages turning by themselves: only armed pages do, after the file's own time where it has one,
// else the entry's seconds; every build of a page waits that long; never under a second.
eq('an entry turns by hand, 8 s per page, without loop, until armed', D.documentAdvanceOf({ type: 'document' }), {
  running: true,
  armed: [],
  seconds: 8,
  loop: false,
});
eq(
  'each armed step lasts its page time',
  D.documentStepDurations({
    type: 'document',
    documentBuilds: [0, 2, 0],
    documentTimings: [null, 3000, 200],
    documentAdvance: { seconds: 5, armed: [0, 1, 2] },
  }),
  [5000, 3000, 3000, 3000, 1000],
);
eq(
  'a page not armed waits for the operator',
  D.documentStepDurations({
    type: 'document',
    documentBuilds: [0, 1, 0],
    documentTimings: [null, 4000, null],
    documentAdvance: { armed: [1] },
  }),
  [null, 4000, 4000, null],
);
eq(
  'left-out pages take no time',
  D.documentStepDurations({ type: 'document', documentBuilds: [0, 0, 0], documentHidden: [1], documentAdvance: { armed: [0, 1, 2] } }),
  [8000, 8000],
);
eq(
  'a page stays its own time, else the seconds per page',
  [0, 1].map((page) => D.documentPageMs({ documentTimings: [null, 4000] }, page)),
  [8000, 4000],
);

const B = await bundle('src/renderer/src/utils/itemBlocks.ts', 'blocks.mjs');
eq(
  'navigation counts every step',
  B.navigableBlockCount({ type: 'document', mediaPath: 'x.pptx', documentBuilds: builds }, undefined, 'Default'),
  5,
);

const C = await bundle('src/renderer/src/presentation/itemContent.ts', 'content.mjs');
const item = { type: 'document', mediaPath: 'Predigt/Folien 1.pptx', label: 'Folien 1', documentBuilds: builds };
const parts = C.itemContentParts(item, undefined, 'Default');
eq('a document is its own content type', parts.contentType, 'document');
eq(
  'its blocks are its steps',
  parts.blocks.map((b) => b.name),
  ['1', '2', '2.1', '2.2', '3'],
);
eq('the file is resolved like media, segment by segment', parts.document, {
  kind: 'pptx',
  url: 'http://127.0.0.1:9100/Predigt/Folien%201.pptx',
});
const at = (blockIndex) =>
  C.contentForItem(parts, {
    item,
    blockIndex,
    lineIndex: 0,
    style: {},
    isBlack: false,
    hideText: false,
    nextLinePreview: false,
    licenseLabel: '',
  }).document;
eq('block 3 is page 2 after its second build', at(3), { kind: 'pptx', url: parts.document.url, page: 1, step: 2, title: 'Folien 1' });
eq('the last block is the last page', at(4), { kind: 'pptx', url: parts.document.url, page: 2, step: 0, title: 'Folien 1' });

// The stage screen goes by pages: the ones shown, the current one, and the next.
const F = await bundle('src/renderer/src/presentation/stageFrame.ts', 'stage.mjs');
const hiddenItem = { ...item, documentBuilds: [0, 2, 0, 0], documentHidden: [2] };
const stageAt = (blockIndex) => {
  const content = C.contentForItem(C.itemContentParts(hiddenItem, undefined, 'Default'), {
    item: hiddenItem,
    blockIndex,
    lineIndex: 0,
    style: {},
    isBlack: false,
    hideText: false,
    nextLinePreview: false,
    licenseLabel: '',
  });
  const frame = F.stageFrameFromContent(content);
  return [frame.title, frame.sections, frame.activeIndex, frame.document.page, frame.document.nextPage];
};
eq('the stage shows the pages left in, and the next one', stageAt(2), ['Folien 1', ['1', '2', '4'], 1, 1, 3]);
eq('the last page has no next one', stageAt(4), ['Folien 1', ['1', '2', '4'], 2, 3, undefined]);
eq(
  'left-out pages are not navigated',
  B.navigableBlockCount({ type: 'document', mediaPath: 'x.pptx', documentBuilds: builds, documentHidden: [1] }, undefined, 'Default'),
  2,
);
eq(
  'a reloaded file gets a new address, so every window opens it anew',
  C.documentFileOf({ ...item, documentRevision: 2 }).url,
  'http://127.0.0.1:9100/Predigt/Folien%201.pptx?r=2',
);
eq(
  'an unsupported file leaves the screens on the look',
  C.itemContentParts({ type: 'document', mediaPath: 'a.key' }, undefined, 'Default').contentType,
  'song',
);

// The desktop media server lists documents under their own type for the media browser.
const S = await bundle('src/main/mediaServer.ts', 'server.mjs');
const media = join(dir, 'media');
mkdirSync(media);
for (const name of ['Predigt.pdf', 'Folien.PPTX', 'Show.ppsx', 'Bild.jpg', 'Clip.mp4', 'Notizen.docx'])
  writeFileSync(join(media, name), 'x');
const server = new S.LocalMediaServer(media);
const port = await server.start(0);
const list = async (type) => (await (await fetch(`http://127.0.0.1:${port}/list?type=${type}`)).json()).files.sort();
eq('documents are listed as their own type', await list('document'), ['Folien.PPTX', 'Predigt.pdf', 'Show.ppsx']);
eq('and not among images', await list('image'), ['Bild.jpg']);
eq('videos still by their MIME type', await list('video'), ['Clip.mp4']);
await server.stop();

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
