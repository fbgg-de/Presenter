# Document items (PDF / PPTX) — plan

Status: **phases 1–5 built (29–30 Sep 2026, uncommitted)** — prototype, PDF items, PPTX items with click builds, refinements (pages left out, relink, library, font notice, file watch, caching), stage monitor. Framing per screen group and page reordering left out on purpose (see below). This follows the agenda media rebuild (phases 1–10, Sep 2026), which left this out on purpose but kept room for it in the data model.

## Prototype result (29 Sep)

Tested on a PowerPoint-made deck with builds, exits and transitions, and on three real sermon decks (46 slides), against PowerPoint's own export:

- **pptx-vanilla-viewer** (the ChristopherVR viewer, Apache 2.0) is the only candidate that plays animations. pptx-browser parses them but never draws them; PptxViewJS has none. It is pinned to **3.12.0** exactly — it publishes several versions a day, and yarn quarantines versions younger than a few days.
- **Fidelity:** two of the three real decks are close to identical. The third loses a master background picture's transparency (`a:alphaModFix`), so its text is hard to read — the PDF fallback covers it; worth an upstream issue.
- **Size:** a lazily loaded chunk of 9.5 MB (2.6 MB gzip); loaded only by a window or card that shows a PowerPoint.
- **Driving it:** only through its own slide show (`next()` / `goToSlide()`), which ignores a step while it animates and cannot take a build back. See `document/pptxDocument.ts` for how that is handled.

## Goal

Put a PDF or PowerPoint file into the agenda the same way as an image or video, and step through its pages on the screens like song slides.

## Already decided

- **Own agenda item type** `document`, next to song, Bible verse, media, audio and slideshow.
- **Pages become slide cards** in Control, so the operator uses the same arrow keys, clicks and preview as for songs.
- **Same file rule as other media:** the path is stored relative to the media folder. Files dropped from outside get the copy-into-media-folder dialog on the desktop. In the web version they are uploaded to the account's Nextcloud.
- **PPTX is rendered in the browser, never converted.** Rendering uses [pptx-viewer](https://github.com/ChristopherVR/pptx-viewer) (Apache 2.0, HTML/SVG output). The desktop app and the web version work the same way. There is no LibreOffice, no server-side conversion and no extra software on the computer.
- **[PptxViewJS](https://gptsci.com/pptxviewjs/) is the possible alternative renderer** (canvas output), in case pptx-viewer falls short in the prototype or stops being maintained.
- **The fallback is always PDF.** When a presentation doesn't render well enough, the operator exports it as PDF in PowerPoint (or wherever it was made) and uses the PDF. The app offers no conversion of its own.
- **PDFs are rendered with `pdfjs-dist`**, which the musician PDFs already use (`components/pdf/`).

Data model sketch:

```ts
type DocumentItem = ShowItem & {
  type: 'document';
  file: MediaRef;   // { path, kind: 'pdf' | 'pptx' }
  pages: number[];  // which pages, in which order (default: all)
};
```

## Rendering design

One small interface, so the renderers can be swapped without touching the agenda, Control or the sync code:

```ts
interface DocumentRenderer {
  load(url: string): Promise<void>;
  pageCount(): number;
  /** Animation build steps on a page (always 1 for PDF). */
  stepsOf(page: number): number;
  render(page: number, step: number, element: HTMLElement, options: { startedAt?: number }): void;
  dispose(): void;
}
```

Implementations: `pdfRenderer` (pdf.js), `pptxViewerRenderer` (pptx-viewer), and `pptxViewJsRenderer` (PptxViewJS) if the fallback is needed.

- **Every window renders for itself.** Each presentation window and the preview loads the file and renders the page it is told to. The operator sends only the position: `{ page, step, startedAt }`. Animations and transitions start from `startedAt`, the same way video playback stays in sync today, so windows stay in step without streaming anything.
- **Stepping:** the arrow keys first go through a slide's animation builds, then to the next slide.
- **Framing:** the rendered page is scaled and positioned like an image (fit or fill, framing per screen group, background colour from the group theme). HTML/SVG output stays sharp at any output resolution.
- **Loading:** the renderer bundle is loaded lazily, only in windows that show a document item. The file is parsed when its item comes up in the agenda, not when the slide goes live.
- **Embedded video and audio** play in the windows; sound follows the rules of media items (operator sound, muted copies).

## Proposed (to confirm)

- **Role and screens:** same as media items. Role content or background, **Show on** screen groups and screen sets.
- **Page selection:** hide or reorder pages in the item editor. Thumbnails come from the same renderer.
- **Stage monitor:** show current and next page thumbnails, plus the PPTX speaker notes if the renderer exposes them.
- **Library:** document entries can be saved and reused like media entries.
- **Fidelity hint:** show a note on the item when the presentation uses fonts that aren't available, and suggest the PDF export.

## Open questions

1. **Prototype result:** is pptx-viewer good enough on real presentations (fonts, SmartArt, charts, animations), or is PptxViewJS better?
2. **Auto-advance:** should documents support timed pages like slideshows (e.g. announcement loops), and should PPTX timings be respected?
3. **Text over pages:** may a document be a background with song text on top, or is it always full-screen content?
4. **Large files:** render pages on demand only, or pre-render and cache thumbnails?

## Rough phases

1. **Prototype:** render 5–10 real presentations (announcements, sermon slides, some with animations) with pptx-viewer and PptxViewJS, compare them with PowerPoint, check bundle size and parse time, then pick one and pin its version.
2. **PDF items:** drop, item type, page cards in Control, `DocumentRenderer` with pdf.js, rendering on screens and preview.
3. **PPTX items:** the chosen PPTX renderer behind the same interface, animation steps and synced start times.
4. **Refinements:** page selection, framing, screen groups, library entries, fidelity hint.
5. **Stage monitor:** pages and notes.

## What was built (phases 1–3)

- Entry type `document` with `mediaPath` and `documentBuilds` (click builds per page, read when the entry is opened in Control and stored on it). Every page and every build is one navigation step (`document/document.ts`), so keyboard, remote, Companion, preview-before-live and the layer bar's Slides row work unchanged.
- Drop `.pdf`, `.pptx`, `.ppsx` on the agenda (same copy/find rules as media), or use "Add PDF / PowerPoint" in the add menu (opens the media browser's "PDF & PowerPoint" tab; Add mode only, not for backgrounds; the desktop media server lists them under `type=document`). The empty operator view has a button for it too. Other formats (Keynote, ODP, `.ppt`) are refused with "save as PDF".
- `ControlDocument`: one card per page with its picture, live card shows "click 1 of 2". The set list row and the header say "PowerPoint · 11 slides" / "PDF · 8 pages" (`documentSummary`; the count once the entry was opened).
- Screens: `contentType: 'document'` with `{ kind, url, page, step }`; `DocumentContent` opens the file in each window and steps it. Screen groups with media off do not show documents.
- **Not the plan's interface:** instead of `render(page, step, element, { startedAt })`, `openDocument()` returns `show(page, step)` (a queue on the viewer's show) and `drawPage()` for cards. Animations start when the step arrives, not from a shared `startedAt`.

## What was built (phases 4–5, 30 Sep)

- **Loading:** the PowerPoint renderer stays one lazily loaded chunk; its AI toolkit (`pptx-viewer-mcp`, which brought a second copy of the PowerPoint core, zod and an EMF converter) is stubbed in `vite.shared.ts` — 9.5 → 6.5 MB (2.6 → 1.75 MB gzip). Aliases now match exactly. `.htaccess` lets browsers keep hashed `/assets` for good.
- **Caching** (`takeDocument` in `document/openDocument.ts`): every window keeps its last 3 opened documents, shared by all users in the window and parked (show left, media paused, host in an invisible full-window box) when none uses it. Going back to an entry is instant on the screens and in Control; a screen re-enters its page fresh. **Opened ahead:** the broadcast carries `documentsAhead` (the entry open in Control and the one after the live one); every window (and the operator) opens them in advance.
- **File watch** (`document/useDocumentFileWatch.ts`): HEAD every 10 s and on focus, Last-Modified + size = version. The first version seen is stored (`documentVersion`); a different one shows the set list's orange reload icon, like songs. Reloading bumps `documentRevision`, which becomes `?r=N` on the file URL — every window opens it anew, past its own and the HTTP cache. The media server sends documents with `no-cache`.
- **Pages left out** (`documentHidden`): eye toggle on each card (not in Live, never the live page or the last shown one); steps, navigation, layer bar and screens skip them; a live entry keeps its page and build. Summary "PowerPoint · 11 slides · 2 left out".
- **Relink** ("Find file…") and **library** ("Save to library", listed among media entries) take documents; a copy watches the file afresh (version and revision dropped).
- **Font notice:** fonts a deck uses that this computer lacks (canvas measurement against the generic fallbacks) show as a warning icon in Control's header. No PDF advice (the user did not want it).
- **Timed pages** (30 Sep, `document/autoAdvance.ts`): the operator's app turns the live document's pages when their time is up (`setActiveBlockFromMedia`, so a preview pick survives) — screens follow like any step. Only **armed** pages turn (`documentAdvance.armed`, page indices; none by default); the others wait for the operator, as PowerPoint waits for a click on a slide without an "After" time. Time per step: PowerPoint's "After" per page (`documentTimings`, read on open; the viewer's own timer stays off) else `documentAdvance.seconds` (default 8); every build of a page waits that long; ≥ 1 s. Loop back to the first shown page (needs the last page armed). A deck set up in PowerPoint to use timings arms the pages timed there; loop is taken over too (`documentAdvance` initialised once).
  - **One look for every armable chip:** `media/armableChip.ts` (`armableChipSx`), shared with a video's region chips — filled and solid when armed, empty, dashed and grey when not, heavier while live. Arming goes through `useDocumentArming` (`document/autoAdvance.ts`).
  - **Slide cards:** a timer chip in each card's footer, between the number and the name, in the slides tint; click toggles. The live page counts down. PowerPoint-timed pages say so in the tooltip. A deck with nothing armed and no timings shows the chips only on card hover. Header: "Arm all" / "Disarm all". Arming stays open in Live (it's running the show, not editing it).
  - **Layer bar, Slides row:** by the row's name a timer button (as the media row has its speed) — "n of m pages turn by themselves", a menu with Arm all / Disarm all. The step chips ("2", "2.1") are armable chips: click jumps, as on every slide chip; the timer at the chip's end arms or disarms its page. A deck not using auto-turn keeps plain chips.
  - **Layer bar, Media row (`DocumentLine`):** play/pause is a master hold over the armed pages (`documentAdvance.paused`); with nothing armed, play arms every page. "3.1 · next in 5 s" / "· held" / "· turned by hand"; the deck as a strip of equal steps (armed ones tinted, click jumps) — no timecode, since pages that wait have no length in time; seconds per page (3–60 s menu), loop.
- **Stage monitor:** a document shows pages, not text — Band: current page large, next beside it, page roadmap (a window around the current page for long decks); Speaker: both pages as cards plus the page's speaker notes (`OpenedDocument.notes`); Lyrics: the page alone. Stage windows open the file themselves (same cache).

Known gaps: bullets show before their build (viewer), media browser tiles show an icon rather than the first page, a single-slide deck cannot step back within its builds, Google Fonts substitutes (e.g. Carlito for Calibri) are blocked by the CSP — installed fonts are used. Not built: page reordering (do it in PowerPoint), per-screen framing (fit/fill) and "Show on" screen groups for documents (they follow the group's media switch). A first open in the web mock can take ~8 s: the dev server serves the viewer as a 7.3 MB unminified pre-bundle plus a 12 MB source map to the operator and both preview frames at once — not seen with the built app so far.

## Code touchpoints

- `media/mediaFiles.ts`: add a `document` kind for `.pdf`/`.pptx`.
- `src/main/mediaServer.ts`: its listing currently leaves out PDFs.
- `components/agenda/useAgendaFileDrop.tsx`, `components/media/MediaBrowser.tsx`: accept documents.
- `presentation/itemContent.ts`: build the page position for the screens.
- `components/show/Control.tsx`: route to a new `ControlDocument`.
- `library/libraryData.ts`: copy rules for document entries.
