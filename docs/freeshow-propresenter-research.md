# What FreeShow and ProPresenter can teach us

Research from 12 Oct 2026. Sources: FreeShow's documentation (all ~45 pages), its GPL source code and
its 2026 release notes; ProPresenter's official feature list, release notes (18–21.4), its public
network API (OpenAPI spec, 100 endpoints), support articles and blog posts. Every finding was checked
against our own code before it went on the list, so nothing here is something Presenter already does.

**Not used: the `rea` reverse-engineering MCP server.** It decompiles native binaries through
Ghidra/IDA/Hopper. Installing it means running a third-party npm setup that rewrites the agent
configuration, and decompiling ProPresenter would most likely break its licence, which forbids
reverse engineering. It was not needed either: FreeShow is open source, ProPresenter documents
its features and API publicly, and its song format is described by the community (see Importers).

---

## Status (13 Oct 2026)

Built: 1 live position, 2 shrink to fit (+ preview badge), 3 outputs on top, 4 thumbnail cache,
5 planned durations + ChurchTools import + top-bar chip + stage source "Agenda entry", 6 message
fields + `/message` request page, 8 viewer lower-third overlay, 9 Companion by id/title,
10 OpenLyrics / ChordPro / FreeShow importers. Not built: 7 look presets and slide actions.

Two corrections to the findings below: SongBeamer `.sng` and CCLI `.txt` import already existed
(only OpenLyrics, ChordPro and FreeShow were missing), and ChurchTools agenda durations were written
back but never imported, so item 5 needed a planned-duration field first.

## The short list

Ranked by value for a live service against effort. S = a day or less, M = a few days, L = a week or more.

| # | What | Why | Effort |
|---|---|---|---|
| 1 | **Keep the live position across an operator reload or restart** | Likely today: a crash-reload starts the operator at item 0 and un-blacks the screens | S |
| 2 | **Shrink audience text that does not fit, and warn the operator** | Long blocks are clipped silently on the projector | S–M |
| 3 | **Raise output windows above the taskbar, notifications and Aero Peek** | Windows toasts and taskbar peek can cover the projector mid-service | S |
| 4 | **Persistent thumbnail cache in the media server** | Image tiles load full-size files; video thumbs are re-decoded every session | M |
| 5 | **Agenda timers from ChurchTools durations** | "This item ends in 2:10", overrun warning on stage — the data is already there | M |
| 6 | **Audience messages with fields, plus a nursery request page** | "Child 12 to the nursery" without the operator typing it | M |
| 7 | **Look presets and slide actions** | One click (or a slide) switches what every screen group shows, starts a timer, fires a cue | L |
| 8 | **Lower-third mode for the viewer page (OBS browser source)** | Stream lyrics without NDI, using the viewer tokens we already have | S–M |
| 9 | **Companion: target items by name or id, not only position** | Reordering the agenda silently changes what a Stream Deck button does | S |
| 10 | **Song importers (SongBeamer, OpenLyrics, ChordPro, FreeShow, ProPresenter)** | The easiest way for a church to switch to us | M per format |

Details, evidence and design notes follow.

---

## Reliability

### 1. Live position across reload and restart

**What they do.** ProPresenter's recent release notes are full of "after relaunch" fixes: props media
resetting playback on relaunch, audio inputs appearing disconnected after relaunch, Planning Center
content not repopulating after relaunch (21.3). FreeShow keeps locked overlays across restarts
("Fixed locked overlays not persisting after relaunch", 1.6.6-beta.3) and re-captures outputs
"across initialization and restart" (1.6.6).

**What we do.** The open show is persisted (`store/showSlice.ts`), and output windows survive an
operator crash and are adopted again (`FooterWindows.tsx`). But the live position —
`activeItemIndex`, block, line, black, text hidden, layer eyes — lives only in Redux
(`store/presentationSlice.ts`, `initialState.activeItemIndex = 0`) and is not persisted anywhere.
After the crash-reload added on 29 Sep, the operator very likely comes back on item 0 with black
off, and its first broadcast moves the surviving outputs there. **Verify with `test:desktop`'s crash
step before fixing.**

**Proposal.** Write the live position to `sessionStorage` on every change (survives a renderer reload)
and to `localStorage` with a timestamp. On start: restore silently after a reload; after a full
restart within, say, 30 minutes, offer "Continue where you were (item 4, Predigt)?". Gate the first
broadcast on the restore so outputs never see item 0.

### 2. Text that does not fit

**What they do.** Both fit text to its box. FreeShow has auto-size text items. ProPresenter scales text
on slides and themes, and its stage screens fit text too.

**What we do.** The stage screen already fits lyrics to their box with a binary search over forced
layouts (`presentation/StageScreen.tsx`, the "Lines fitted to their box" comment). The audience output
(`presentation/NormalMode.tsx`) uses the theme's fixed font size, and `Presentation.tsx` clips with
`overflow: hidden`. A long bilingual block, or a theme made for a 16:9 projector shown on a 4:3 one,
silently loses its last lines, and nothing warns the operator.

**Proposal.** A theme option "Shrink to fit (never grow)", default on, reusing the StageScreen fitter
on the text box. In the operator view, a small badge on slides that needed more than, say, 15 %
shrinking (or would still overflow), and a readiness-chip entry "3 slides too long for Beamer
links". That catches it while preparing, not during the service.

### 3. Output windows that stay on top

**What they do.** FreeShow sets outputs `alwaysOnTop` at the `screen-saver` level on Windows (above the
taskbar and notification toasts). It also excludes the window from Aero Peek through DWM, so hovering
the taskbar no longer blanks the projector. On macOS it uses a `panel` window, which stays above
fullscreen apps without the Dock icon bug of `setVisibleOnAllWorkspaces`
(`src/electron/output/helpers/OutputAlwaysOnTop.ts`).

**What we do.** `win.setAlwaysOnTop(value)` at the default level (`src/main/windows.ts`). Teams or
Windows Update toasts, the Windows taskbar and Aero Peek can all appear over the output.

**Proposal.** `setAlwaysOnTop(true, 'screen-saver')` on Windows, `pop-up-menu` level or a panel window
on macOS. Aero Peek exclusion needs `DwmSetWindowAttribute(DWMWA_EXCLUDED_FROM_PEEK)`. FreeShow ships
a tiny helper exe for it; a few lines of native code, or a small koffi call, would do the same.

### Display changes beyond plug and unplug

**What they do.** FreeShow re-places outputs on `display-metrics-changed` too (resolution, scaling or
rotation changes — typical when a projector renegotiates its EDID or a TV switches input). Its
fallbacks go saved position → saved display id → any display matching the output's name.

**What we do.** `windowManager.watchDisplays()` handles `display-added` and `display-removed`,
recognising displays by position only (memory: configs store no display id).

**Proposal.** Store the display id (and its label) with each output. On
`display-metrics-changed`, re-fit fullscreen outputs to their display's new bounds. Match a returning
display by id first, then by position.

### Smaller reliability items

- **Media in hidden windows.** FreeShow sets `disable-background-media-suspend`, because Chromium
  suspends muted media in hidden windows. Our parked outputs (display unplugged) are hidden. The
  deterministic cue clock re-syncs on return, so this only matters if a re-seek visibly stutters.
  Worth a test with a real projector.
- **Auth for local control.** FreeShow added a password for its API commands (1.6.6-beta.4) and for
  stage layouts (1.6.5-beta.1). We now bind the Companion server to localhost by default and use
  relay tickets, which covers the same ground.

---

## Performance

### 4. Thumbnail cache in the media server

**What they do.** FreeShow keeps a disk thumbnail cache in `appData/media-cache`: four sizes (100,
250, 500, 900 px), file names hashed from the path, invalidated when the file's ctime changes. A
queue de-duplicates concurrent requests for the same file. Images go through `nativeImage`
("fastest"); videos are captured in a hidden window (`src/electron/data/thumbnails.ts`). ProPresenter
had to fix "thumbnails after an asset is overwritten" (21.3), so the cache key must include mtime and
size, not just the path.

**What we do.** Image tiles in the media browser load the full file (`MediaBrowser.tsx`,
`<img src={file.url} loading="lazy">`): a 12 MP photo is decoded at full size for a 240 px tile.
Video thumbnails are grabbed in the renderer by one `<video>` element into an in-memory `Map`
(`useVideoThumbnails.ts`), so every app start decodes them again.

**Proposal.** `GET /thumb?path=…&w=240` on the desktop media server, with a cache in `userData` keyed by
path + mtime + size + width. Use Electron's `nativeImage.createThumbnailFromPath` (Windows and macOS
shell thumbnails, which also covers most videos on Windows), falling back to `nativeImage` resize for
images and the existing renderer grab for the rest. The media browser then asks for `/thumb` instead of
the file. On a folder of photos this is the difference between hundreds of MB of decoded bitmaps and
a few MB of JPEGs.

---

## User experience

### 5. Agenda timers from ChurchTools durations

**What they do.** ProPresenter's Planning Center integration has "End Item on Time" timers (made to
match Planning Center in 21.2) and Go-to-Next timers that show the next presentation. FreeShow
downloads plans with their times.

**What we do.** Our ChurchTools sync already reads and writes each agenda slot's `duration`
(`classes/ChurchToolsCcli.php`). But show items don't carry it, and the stage timers know nothing of
the agenda.

**Proposal.** Import the planned duration (and start time) per agenda item. Stage elements:
"Item ends in 2:10" (turning amber, then red when over), "Service ends 11:30 (+4 min)" and "Next:
Predigt". The operator top bar gets the same overrun hint. It's data we already fetch, and it's the
feature worship leaders and preachers ask for most in both products' communities.

### 6. Audience messages with fields, and a nursery request page

**What they do.** ProPresenter's Messages combine fixed text with tokens such as "Child {number} to
the nursery". The operator types only the number, the message shows for a set time or until hidden,
and a nursery worker can submit the token from a phone through a page on the local network.
FreeShow has a per-show "Message" and metadata overlays with dynamic values.

**What we do.** Operator messages and templates exist for the stage monitor only (stage monitor
redesign). The audience output has no message layer.

**Proposal.** Reuse the stage message templates for an audience message layer (ticker or lower third,
per screen group via the look). Add a small `/message` page in the style of `/control`: it signs in
with a relay ticket and sends `message_request {template, fields}`. The operator sees a request chip
with Show / Dismiss, so nothing reaches the screen without the operator. ChurchTools check-in
numbers could fill the field later.

### 7. Look presets and slide actions

**What they do.** ProPresenter's Looks decide which layers each screen shows and which theme it uses
for the slide layer (for example a green-screen lower third for the stream only). Looks are saved as
presets, switched in one click, and triggered from a slide through an "Audience Look" action. Macros
bundle actions (look, stage layout, clear layer, timer, lighting command) and run from a slide, a
button, MIDI or the API. FreeShow's Styles do the same per output, including "max 2 lines" for a
stream output. Its slide actions start a timer, change an output style, send MIDI, or emit OSC/HTTP
through reusable "emitters".

**What we do.** Screen groups, per-group theme variants and background tracks are built (Look
redesign phases 1–4), and the layer bar has per-layer eyes. What's missing is a named, switchable
combination ("Sermon: stream shows scripture only, stage shows timer layout"), and anything
triggered when a slide goes live.

**Proposal.** In two steps. First, **Look presets**: named snapshots of per-group layer visibility (and
optionally a theme variant), switchable from the top bar, Companion and `/control`. Second, **slide and
agenda actions**: a small list per slide or agenda item — switch preset, start or stop a stage timer,
clear a layer, send MIDI, send an HTTP request or OSC message (FreeShow's "emitter" idea: a saved
target plus message template). The existing armed and auto-advance machinery is the natural place
to run them.

### 8. Streaming lower third without NDI

**What they do.** Both send outputs over NDI with transparency (FreeShow also over OMT and
Blackmagic). Both recommend a separate stream output with its own style: two lines at most and a
lower-third template.

**What we do.** No NDI. The viewer page (`viewer/index.php`) already shows live lyrics from the relay
with a viewer token, but only takes `token` and `debug`.

**Proposal.** An overlay mode for the viewer page — `?overlay=lowerthird&lines=2&bg=transparent`,
plus a theme choice — so a church adds it as an OBS browser source and gets a transparent lyric
lower third that follows the operator. No native NDI dependency, no extra window on the presenter
PC, and it works with the read-only viewer tokens from the security work. NDI can still come later
if a church needs SDI/NDI switchers.

### 9. Companion and remote by name or id

**What they do.** Every ProPresenter API call that takes an item accepts "the ID of the required item,
either name, index or UUID". A button bound to "Announcements" keeps working after the playlist is
reordered.

**What we do.** Companion "go to item" is by position (companion module notes: "reordering the agenda
moves what a button targets").

**Proposal.** Accept `{ index }`, `{ id }` or `{ title }` in `set_item` (also for remote commands).
The Companion presets keep using position, and a "Go to item by title" action is added. It's a small
change to `wsServer.ts`, `handleRemoteCommand` and the module.

### 10. Song importers

**What they do.** FreeShow imports ProPresenter 4–7, EasyWorship, VideoPsalm, OpenLP (OpenLyrics),
OpenSong, MediaShout, Quelea, SoftProjector, **SongBeamer**, EasySlides, VerseVIEW, plain text, CSV,
ChordPro, Word, PowerPoint (text) and PDF. ProPresenter 21.2 added a native PPTX importer.

**What we do.** Songs come from ChurchTools/CCLI, are typed in, or are dropped onto the agenda as SongBeamer `.sng` or CCLI `.txt` files.

**Proposal, in order of value for our users:**
1. **SongBeamer `.sng`** — the most common tool in German-speaking churches. A text format:
   `#Tag=value` headers, verses split by `---`, encoding by BOM with a cp1252 fallback (as OpenLP's
   and `icemac.songbeamer`'s importers do). Bilingual SongBeamer songs map onto our language-tagged
   lines.
2. **OpenLyrics XML** (OpenLP's export format; open standard).
3. **ChordPro** (common for chord sheets; maps to the musician view).
4. **FreeShow `.show`** (JSON, documented at freeshow.app/docs/format-show).
5. **ProPresenter `.pro`** — protobuf, readable with the community's unofficial
   `greyshirtguy/ProPresenter7-Proto` definitions. They're reverse-engineered and incomplete, so
   import only (never write back).

### Smaller ideas

- **QR code slide item** (FreeShow 1.6.6-beta.2). `qrcode.react` is already a dependency. Showing the
  audience viewer link as a QR code lets the congregation follow bilingual lyrics on their phones,
  which is good for accessibility.
- **Clean up unlinked media** (ProPresenter 19). For us, server-side PDFs and icons no song references
  any more (`data/<account>/pdfs`). An admin action that lists and removes them.
- **Missing media search** (FreeShow). If a file is missing, look for the same name in the media folder.
  Our media server already has `/find`, so this could run automatically on load, not only on demand.
- **Output lock** (FreeShow). Our Prepare/Live switch and preview/take cover most of this. Listed for
  completeness only.

---

## Worth watching, not building now

- **Speech-to-text scripture** (FreeShow "Smart" mode, 1.6.6): a local Nemotron model listens to the
  sermon and suggests (or auto-presents) "Johannes 3,16" when it's spoken. Optional LLM via Ollama.
  Impressive, but heavy (model download, microphone routing), and German verse references need their
  own parsing.
- **Audio ducking, routing and multi-channel recording** (FreeShow 1.6.5–1.6.6). Our monitor mixer
  covers the musicians' side; ducking music under announcements could be a later addition.
- **Recorded slide timings** (ProPresenter Timeline, FreeShow timeline): record a run-through, play it
  back. Our media cue timeline covers synced video, which is the main use.
- **Multi-machine Link** (ProPresenter Network Link): several machines trigger together, anyone can
  take control. Our relay and the operator sync authority already provide the building blocks.
- **Automatic translation of song text** (FreeShow, 240 languages): convenient, but translated lyrics
  raise CCLI copyright questions, so leave it alone.

---

## What we already do as well or better

So these don't get rebuilt by accident:
- Browser-based remote, musician view (PDFs, annotations, sync modes) and audience viewer.
  FreeShow has similar web remotes; ProPresenter's are native apps.
- ChurchTools agenda sync in both directions, CCLI via ChurchTools.
- PowerPoint *with animations* as live documents (pptx-vanilla-viewer). ProPresenter 21 imports only
  "simple animations", and FreeShow recommends converting to PDF.
- Screen groups with per-group theme variants and section background tracks, comparable to
  ProPresenter Looks.
- Video walls (crop-based tiles), deterministic multi-window video sync, speed control.
- Crash reload of renderers, wake lock, projector hot-plug, close guard, readiness chip.
- Monitor mixer bridge and a dedicated Companion module.

---

## API design notes (for a future local HTTP API)

ProPresenter's public API is worth copying in spirit if we ever open Presenter to lighting desks,
vMix scripts or "generic HTTP" Companion buttons:
- **Plain REST** for state and triggers: `GET /v1/presentation/current`, `GET /v1/look/{id}/trigger`,
  `GET /v1/clear/layer/{layer}`, `PUT /v1/stage/message`, thumbnails for every item.
- **Streaming instead of polling.** Any read endpoint accepts `?chunked=true` and then sends a new chunk
  on every change. `POST /v1/status/updates` merges several such streams into one connection, "to
  overcome a browser limit on the number of concurrent connections allowed".
- **Flexible ids**, as in item 9: name, index or UUID.
- Small groups that map onto our concepts: looks, props, messages, macros, timers, stage layouts,
  clear groups, transport per layer.

Our Companion WebSocket server already pushes state, so this would be a thin HTTP layer on top, kept
localhost-only by default and with a token when network access is enabled.

---

## Sources

- FreeShow docs: https://freeshow.app/docs (features, output, outputs, styles, stage, remote, actions,
  midi, companion, cloud, smart, data, importing, media, audio, ndi, livestreaming, faq)
- FreeShow source: https://github.com/ChurchApps/FreeShow (`src/electron/data/thumbnails.ts`,
  `data/save.ts`, `data/backup.ts`, `output/helpers/OutputAlwaysOnTop.ts`, `OutputLifecycle.ts`,
  `OutputVisibility.ts`, `utils/commandLineSwitches.ts`)
- FreeShow releases: https://github.com/ChurchApps/FreeShow/releases (1.6.5 – 1.6.6, Jul–Oct 2026)
- ProPresenter features: https://renewedvision.com/propresenter/all-features
- ProPresenter release notes: https://renewedvision.com/propresenter/release-notes and
  https://renewedvision.com/propresenter/download
- ProPresenter API spec (mirror of the official OpenAPI file): https://github.com/jeffmikels/ProPresenter-API
- Looks: https://support.renewedvision.com/hc/en-us/articles/360041407174,
  https://renewedvision.com/blog/using-looks-with-multiple-screens-in-propresenter-7
- Network Link: https://support.renewedvision.com/hc/en-us/articles/4412193892627-Network-Link
- Messages and tokens: https://learn.renewedvision.com/propresenter6/the-features-of-propresenter/messages
- Macros: https://renewedvision.com/blog/how-to-use-macros-in-propresenter-7
- ProPresenter 7 file format (unofficial): https://github.com/greyshirtguy/ProPresenter7-Proto
- SongBeamer format notes: https://pypi.org/project/icemac.songbeamer, OpenLP's songbeamer importer
