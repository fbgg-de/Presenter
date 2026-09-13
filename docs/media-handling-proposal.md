# Media handling and song section mapping

Status: the core design is now implemented in the application. See [Media cues](media-cues.md) for usage, deployment, validation and current limits. The findings below describe the pre-implementation audit; the interactive conversation concept remains a separate simulation.

## Current behavior and findings

The application has three related media surfaces:

- `src/renderer/src/components/media/MediaBrowser.tsx` browses a configured media server by folder, with image/video tabs, video hover previews, URL entry, and solid colors.
- `src/renderer/src/components/show/ControlMedia.tsx` provides an item preview, playback controls, and fit, position, zoom, blur, autoplay, and whole-file loop settings.
- `src/renderer/src/components/media/VideoControlPanel.tsx` controls presentation windows and background videos, including optional video-wall drift correction.

The output renderer is `src/renderer/src/presentation/MediaContent.tsx`; presentation content is assembled in `src/renderer/src/hooks/usePresentationSync.ts`. A song can already have a video background through its resolved style. There is no persisted media section/lyric mapping in `ShowItem`.

Concrete findings from source inspection:

1. In `ControlMedia`, play/pause and stop send media-item commands to presentation windows, but `handleSeek` only changes the local preview. The controls do not explain this difference.
2. Mute and volume affect the preview only. Muting also sets volume to zero, but unmuting does not restore it, so the preview can remain silent.
3. The preview has local visibility state while the global control panel uses Redux visibility state. These can disagree.
4. Image load failures hide the image element with no visible explanation or retry action. Video load/play failures also need an operator-facing state.
5. URL classification checks everything after the final period. A video URL with a query string, or an extensionless video URL entered on the video tab, can be added as an image.
6. Seek and volume drag state depends on `onMouseDown`; touch and keyboard behavior needs review when replacing these controls.
7. Video-window status is aggregated per window, without a media asset/transport identity in the local panel status shape. Mapped playback needs explicit targeting when a window has both a media item and a background video.
8. The existing sync engine works from periodic status reports. A section loop should execute in the playback element, rather than waiting for operator-side status updates to send a seek.

These are code findings, not a completed runtime audit. Existing unrelated workspace changes have not been modified.

## Recommended ownership: shared media cue and output assignments

The user needs different videos on different presentation windows, as well as multiple crops of one video playing in sync. A video path on the song itself is too restrictive for that workflow. Use a **media cue** as the single place to configure the media performance; a show item can reference that cue and optionally map its sections to lyrics.

The cue owns:

- A small source list: each video/image is defined once, with a stable source ID. Video tracks include source in-point/alignment and a chosen cue duration.
- One shared timeline and transport: cue time, typed lyric sections and loop regions, play/pause/seek, active loop, and an optional queued boundary action.
- Screen assignments: logical output role → source ID and appearance settings (source crop, destination placement/scale, fit, and blur). Two windows using one source can have different framing without creating separate clocks.
- One primary audio source and an explicitly selected audio output/owner. Cropped visual copies are silent by default. The waveform may be viewed for any source, aligned to cue time; changing the waveform view must not implicitly change audible routing in the actual application.

The show item's cue binding owns its mapping from section IDs to occurrences in that item's lyric arrangement. The song library record remains media-independent. A cue can be used with a song, without lyrics as a standalone media item, or reused via an explicit reference. Editing shared cue media should identify all referencing show items; duplicating a cue creates an independent version.

The UI brings these together in one **Media cue** editor: sources, waveform/sections, lyric mapping for the current show item, and screen assignments. The song editor and window inspector link to that editor rather than offering independent copies of the same media settings.

Example assignments:

| Output role | Source | Crop | Timing |
| --- | --- | --- | --- |
| Left screen | Panorama | Left half | Shared cue time |
| Right screen | Panorama | Right half | Shared cue time |
| Stream | Camera B | Entire frame | Shared cue time + source alignment offset |

The common timeline describes the performance. Source alignment compensates for recordings that start at different times; for example, cue 24.000 s can correspond to Camera B 26.400 s. A source's alignment is shared by all outputs using that source. This assumes recordings progress at the same rate with the same edits. Differently edited recordings need per-section source alignment, not a promise that one offset will synchronize them throughout.

### Integration with existing presentation windows and styles

`SavedWindowConfig` in `src/renderer/src/store/windowSlice.ts` already has a stable configuration ID, separate from the open window's runtime ID. Reuse that identity when binding a rig's logical output roles (Left, Right, Stream) to actual windows. IDs are currently local to a browser profile, so shared shows should store portable output roles, with a local role-to-window binding. Missing bindings should appear as unassigned and never silently target a similarly named screen.

Window settings continue to describe the physical output, display mode, and text/language styling. Cue assignments describe which media appears there and which crop is used. This keeps media content in one place while letting users retain a saved screen setup.

Resolve media ownership explicitly per output:

1. A cue assignment supplies that output's media layer, crop, and transport. It supersedes inherited style image/video layers there; style background video must not keep playing invisibly or audibly underneath it.
2. An output with no cue assignment keeps its normal style background. An explicit cue assignment of **No media** suppresses inherited media instead; it is distinct from having no assignment.
3. Text styling, language selection, stage layers, and global hide/black controls retain their established purpose. Cue crops do not silently compound with style background zoom/crop.

Show the effective media owner in the window inspector, e.g. “Media cue: Opening song · Panorama · Left half,” with one edit link. Existing shows keep their behavior until explicitly configured for cues. Provide an explicit **Use current backgrounds as a cue** preparation action that imports the effective sources/crops and exposes any different per-window timing/audio settings for resolution, without rewriting shared styles.

### Persistence and playback semantics

Recommended storage is a show-owned cue collection with stable IDs, source IDs, section IDs, and assignments to logical output roles. Each relevant `ShowItem` stores a cue reference and its lyric bindings. A reusable library preset can be added later without changing the song data model. Extend the existing show JSON API deliberately, preserving cue data in every save/copy/export/reorder path; the current API does not already persist a separate cue collection.

One coordinator owns cue time; it is not whichever screen happens to be first alphabetically. Commands carry cue/session identity and ordering so stale output reports and delayed commands cannot affect a later cue. Each output derives its source position from cue time plus source alignment, applies its crop locally, and executes loop boundaries locally. Monitor drift and readiness, including late-joining outputs. Do not report synchronization as successful merely because commands were sent.

The cue's chosen duration and loop range govern every assigned video. Individual source videos do not independently wrap. Before a delayed source starts, show no media; after a shorter source ends, hold its last valid frame until the cue ends by default and display the coverage gap during preparation. Validate loop coverage across sources. If adjacent show items reference the same cue, continue the same session by default; a distinct cue starts a new session. Expose an explicit restart action for intentional repeats. Changing lyric sections must never recreate or restart the shared video source.

The current HTML-video/status-report approach has not been validated for seamless, frame-locked playback across separate windows. Distinguish accurate timestamp editing from measured playback synchronization; validate multi-output timing before making a frame-accuracy promise.

## Proposed operator experience

### Media selection and presentation

Show a useful preview, filename, media type, dimensions, and video duration where available. Keep a visible loading/error state with retry or replace actions. URL entry should have an explicit image/video type, defaulting to the selected tab, with recognized pathname extensions as a hint.

Group controls by purpose: playback, audio, and appearance. Use icons for play/pause, stop, and loop, with tooltips, accessible names, and explicit pressed/disabled states. Use plain labels for Fit entire image, Fill screen, and Stretch. Keep crop position, zoom, and blur in the appearance group with a reset action.

Make the playback destination explicit. A single active media transport controls playback and seeking across the operator and relevant outputs. Preview monitoring volume must be visibly separate from output audio routing. There must be a defined audio owner so opening another screen does not unexpectedly duplicate audio.

### Visual framing and effects per output

Each screen assignment has a **Frame & effects…** action. Open a focused dialog for that output with two distinct previews:

1. **Source crop:** show the original source frame with a movable, resizable crop rectangle. Crop coordinates are normalized to the source. Cropping selects which pixels are used; it does not move the destination screen or change the source file.
2. **Screen placement:** show the actual output aspect ratio with the cropped result. Drag to position it, resize/scale it, and use alignment controls. Choose Fit entire crop, Fill placement, or Stretch, then adjust blur with immediate draft feedback. Source cropping and destination placement are separate controls so adjusting one does not unexpectedly rewrite the other.

Provide numeric crop/position/size fields for exact or keyboard editing, optional aspect-ratio locking, accessible handles, and a full-source-crop/reset-placement action. Hide overlapping tiny handles when the preview cannot provide distinct hit targets; keep exact controls available. Clamp source crops to valid source bounds. Allow destination placement partly off-screen, clipping to the output viewport.

Define the transform order explicitly: source crop → fit/scale into the destination placement rectangle → blur in defined output-pixel units → position and clip to output bounds. Fit/Fill preserve aspect ratio; Stretch changes it. Production preview and output must use the same calculation and blur units at different preview scales.

All edits are a local draft until **Apply to this screen**. Cancel, closing, or Escape discard the draft. Do not send live appearance changes on every pointer move by default. Applying appearance changes preserves the media session, playback time, audio routing, and all other screens' settings. Store the result on the cue's output assignment, in the same editor that owns media routing; the dialog does not introduce another video definition.

For one video across several screens, reuse the source ID but save independent source-crop and destination-placement settings for each output. Optional reusable rig framing presets may follow later. For images, use the same framing dialog while omitting irrelevant time controls.

### Video timeline

Provide a seekable time ruler, waveform, playhead, elapsed/remaining time, labeled sections, and a visible loop range. A waveform is an orientation aid; it should not be required for playback or cue editing.

The requested primary editing interaction is direct manipulation:

- Zoom from the whole cue to a fraction of a second, centered on the playhead/pointer, with pan and a fit-selection action. Adapt ruler labels to the visible range. The revised concept offers 1×–128× zoom.
- Show `m:ss.mmm` timestamps and store subsecond values. Offer millisecond snapping plus optional snapping to the selected source's known frame grid. Do not round boundaries to whole seconds. The concept's 25 fps option is illustrative; production must use known source timing or omit that option.
- Draw a range first, without choosing its type beforehand. Dragging empty waveform creates a temporary neutral range; the Draw tool also allows drawing across existing regions. On pointer release, open a compact **Use this region as…** dialog: choose **Lyrics** and its lyric-block mapping, or **Loop** with an Armed switch, or **Pause** with a Pause at beginning switch, then create it or cancel. No region is saved until this choice is committed. Cancel/Escape removes the temporary range. Overlaps remain allowed. Provide a keyboard-accessible creation path as well; the concept uses Alt+N at the playhead.
- Show lyric, loop, and pause regions in separate, labeled timeline lanes against the same waveform/time ruler. Pack simultaneous overlapping regions into additional rows so each stays selectable. Use a distinct loop color (purple in the concept) and text/line styling for selected, active, and queued states; do not rely on color alone.
- Place the editor toolbar directly against the waveform editor, and move the lyric/loop legend below the drawing board. Keep zoom/pan and transport available. Collapse screen assignments and hide pan when the whole cue is visible.
- Drag a selected region body to move it and its edge handles to resize it. Keep neighboring regions intact, allow overlapping times, and display exact boundary times during manipulation. Provide undo, deletion, pointer cancellation, keyboard nudges, and numeric fallback without requiring numeric editing.
- Remove permanent region-name, mapping, start/end, and separate A–B forms from the main view. Region actions live in a right-click context menu, also reachable via a visible ellipsis button and keyboard (Context Menu key / Shift+F10). Small regions can use the selected-region menu button below the editor. The menu contains edit timing/name/mapping, delete, and relevant loop actions. Exact beginning/ending fields appear in the edit dialog with save/cancel, together with the mapping; creation keeps those fields collapsed initially. Deletion supports undo.
- For very short sections at a distant zoom, keep the mark visible and offer zoom-to-selection. Only display separate resize handles when their hit areas fit without overlapping.
- Keep section edits in preparation mode; audition playback can pause while drawing/resizing. Live mode uses the same section marks for navigation but locks destructive editing. Commit/cancel editing separately from live transport.

Generate and cache real waveform peaks where supported. Represent loading, unavailable audio, and extraction failure explicitly, with an ordinary timeline fallback. Do not display synthetic peaks in the application. The conversation concept uses clearly labeled simulated audio only.

Waveform generation needs a separate implementation decision: client decoding versus media-server preprocessing, taking supported video formats, long files, remote media, cancellation, and cache invalidation into account. Do not assume every playable video container can be decoded by the same waveform extraction path.

### Named sections and lyric mapping

Each region has a stable ID, explicit kind (lyric, loop, or pause), editable name, start and end time, and optional color. Only lyric sections receive lyric bindings. The same lyric content may appear in several distinct section occurrences: Chorus 1 and Chorus 2 can both contain chorus text but seek to different times. A loop can span several lyric sections or overlap several other loops without adding duplicate lyric mappings.

After choosing Lyrics in the post-draw dialog, choose the lyric-block mapping first. Use that occurrence's display name automatically, with an optional collapsed custom-name override. Changing the mapping updates an inherited name but preserves an explicit custom name. A new lyric region needs no separate name input. Keep identity separate from display names when arrangements change.

Map to an occurrence in the selected song arrangement, not just a display name or mutable array index. Keep an arrangement snapshot/signature and mark mappings for review when blocks are reordered, removed, or renamed. Never silently shift a cue to another block.

An instrumental section can explicitly clear lyrics. Distinguish that from an unmapped section, which holds the current lyric and shows that no mapping exists. A gap between sections holds the current lyric. Ranges have inclusive starts and exclusive ends.

When lyric sections overlap, the containing section with the latest start time controls the lyric; equal starts use a stable stored creation/order priority. When that section ends, another still-containing section can take control. Loop regions do not participate in lyric selection. Expose this rule in the editor and highlight the effective lyric section so overlapping mappings cannot cause two competing outputs. This is a proposed default, not a simultaneous display of multiple lyric blocks.

Provide independent, clearly named switches:

- **Lyrics follow video:** reaching a mapped section selects its lyric block; seeking backward also resolves the appropriate block.
- **Video follows lyric clicks:** a deliberate lyric selection seeks to the mapped section. Preserve playing/manual-paused state; a cue paused by a pause point resumes after this deliberate navigation.

With both switches enabled, automatic lyric changes must not generate a seek back to the same cue. Carry an event origin so playback-driven changes and operator-driven actions remain distinct. Handle mouse, keyboard, and permitted remote navigation through the same deliberate-action path.

When a lyric target has multiple mapped video ranges, use the current containing range first, then the next occurrence, then the first occurrence. Show which occurrence is selected. Never jump to another show item merely because an unmapped lyric was selected.

Mapping edits belong in a preparation mode with explicit save/cancel; seeking during live operation must not accidentally rewrite boundaries. Persist lyric bindings on the relevant show item's cue binding, and section/source definitions in the shared cue collection. Reusable presets can follow later.

### Loops

Use one loop-region model. “A–B” only described the start and end of a range, so it should not be a separate feature or input panel. Drawing a Loop region already defines those boundaries; a region spanning the whole cue provides whole-cue looping. Multiple saved loops may overlap, but only one is active at a time.

Distinguish four visible states: **Off** (play through), **Armed** (enter automatically), **Active** (currently looping), and **Next** (explicitly queued). A newly created loop is armed by default, with the state clearly selectable in the post-draw dialog. Region selection is independent of all of these states.

- Selecting a loop region only selects it for editing or queueing; it does not seek, pause, activate it, or replace the active loop.
- With no active loop, normal forward playback reaching an armed loop's start activates it automatically. Repeat that range until the operator exits, disarms, or requests another loop. If several armed ranges start together, use stable stored order to choose; an existing active loop cannot be preempted by an overlapping armed loop.
- Starting/resuming or deliberately seeking inside an armed loop activates it when playing. For multiple containing armed loops, the earliest-starting eligible region wins, with stable order as tie-breaker. A paused seek preserves pause; activation occurs on resume. Explicit Enter now can choose another region directly.
- **Arm / Disarm** is available from the region menu and the selected loop's transport toggle. Arming inside a range during playback activates it immediately if no loop is active. Disarming an active loop releases it immediately at the current position and cancels its queued transition; disarming a queued target cancels that target. Disarmed loops remain visible and editable.
- **Enter selected loop now** seeks to its start and activates it. Preserve playing/manual-paused state; resume if held at a pause point. Drawing or editing a region is a preparation action and can pause playback.
- At the loop end, playback returns to the loop start and lyrics follow if enabled.
- **Exit at end** queues a one-pass release: finish the current pass and continue forward. Keep the loop armed for later use, but do not immediately recapture playback in another already-overlapping armed range. Bypass such containing overlaps for the remainder of this pass. A future armed loop whose start has not yet been reached can still activate normally; an adjacent loop starting exactly at the exit boundary is eligible. A deliberate seek/restart resets the bypass. Pausing/resuming during a bypass does not reset it.
- **Queue selected loop** finishes the current active loop pass, then jumps to the selected loop's start and loops that range. This also works when the target overlaps the current loop or starts earlier in the timeline. Show the active and queued names and ranges separately.
- Queueing another loop replaces a queued exit or earlier target. Queueing exit replaces any queued target. **Cancel queued change** retains the current loop. The latest accepted operator intent wins; selection alone never changes that intent.
- A manual jump outside the active range releases that loop and cancels queued actions. The destination's armed loops then follow the same explicit-seek entry rule; show the resulting active loop clearly. A manual jump within the active loop preserves it.
- Stop cancels active/queued loop state and returns to the beginning, while keeping saved armed/off choices intact. Restarting playback can therefore encounter and activate those loops again.
- Changing to another cue clears runtime loop and queued command state. Navigating between lyric blocks, or between adjacent items explicitly continuing the same cue, preserves the cue session.

Queued loop transitions require an active loop. If none is active, arm the target to enter when reached or use Enter now. Queueing the current active loop is unnecessary and disabled. Queueing a target arms it. Deleting a queued region cancels that queued target; deleting an active region releases its loop. Editing is a draft in production, so published active/queued boundary definitions stay stable until an explicit apply operation. Handle an applied boundary moving behind the playhead deliberately rather than firing a stale transition.

Loop handling belongs beside playback in every targeted renderer, keyed to the same media session. Share armed states, the active loop, queued target/exit, and current-pass bypass state with a command revision before the boundary, so outputs perform the same transition locally. At an active-loop boundary, resolve the latest accepted action exactly once: queued target, queued exit, or ordinary repeat. When free-running, resolve eligible armed-loop entries chronologically, even when a status/frame update crosses a short region. Late-opening screens receive the current time, playback state, loop/queue/arming/bypass state, and revision. The operator must show an output that has not acknowledged the current session.

Section loops are the proposed first version. Beat/BPM grids, quantized jumps, tempo changes, and seamless musical loops are a separate scope requiring timing and audio validation; the existing status-based sync should not be represented as beat-accurate.

Provide quick loop tiles alongside the lyric shortcuts. Show the loop name, current state, and next click action. Clicking an inactive tile arms/disarms it; clicking the active tile requests exit at its end. Clicking again while exit is pending cancels that exit and keeps looping. Keep immediate disarm and Enter now in the region menu. Arming or selecting a tile never resumes a paused cue. If another loop is queued, clicking the active tile replaces that queue with exit, following the same latest-intent rule.

### Boundary checks

For the selected region, provide icon actions to pause and seek the cue to its exact beginning or ending, plus separate local audition actions. Beginning audition covers one second before and two seconds after; ending audition covers two before and one after, clamped to available source coverage. Expose the same audition actions in exact-time editing, using the unsaved draft boundaries. Validate those fields before starting.

Audition uses a separate preview clock and explicitly routed operator monitoring audio. It must not seek outputs, change lyrics, alter armed/active/queued loops, or change the cue's pause reason. Bypass loops and pause points during the preview, stop automatically at the preview range end, and offer an explicit stop icon. Show a distinct audition playhead and label; selecting another region or cancelling edits stops that preview. Main seek actions deliberately pause and move the cue. Production must avoid duplicated monitoring/output audio while retaining an intelligible preview.

### Pause regions

Use the same typed-region model and drawing flow for **Lyrics**, **Loop**, and **Pause**. Draw a range, choose Pause as the third option in the shared classification dialog, then create or cancel. Pause regions have a stable ID, name, start/end, and enabled state. Remove the separate pause-point creation control and dedicated dialog. Retain the shared exact-time modal, context menu, deletion, undo, and boundary checks. The shared menu offers Enable/Disable pause, and the shared dialog exposes a Pause at beginning switch. All three types can overlap.

Pause at the region's beginning. Display it as a fixed-width red pause-icon marker, independent of the drawn length and timeline zoom. The concept uses 38 px for a mouse and 44 px for touch. A thin anchor line identifies the exact timestamp; keep markers within the board at its edges, and stack them by their rendered hit areas when nearby times would collide. Show the name/time through its accessible label, tooltip, selection detail, and quick tile. Drag the marker or use arrow-key nudges to move its trigger; use the shared modal for exact editing. Range resize handles remain on lyric/loop regions. The drawn ending may be retained as contextual range data for editing or changing type, but does not determine marker width, hold duration, or automatic resumption. Resuming continues from the held time without skipping the region. All assigned videos/crops share that cue-clock trigger. Several enabled regions with the same beginning produce one hold at that time, with stable ID order selecting the displayed reason.

Below the quick loop controls, add matching quick pause tiles with the pause icon, name, timestamp, enabled/off state, and the next Enable/Disable action. Clicking toggles that pause using the same operation as the context menu. It does not seek or resume playback. If playback is currently held there, preserve the pause reason so Play/Space or deliberate section navigation still resumes normally. Keep disabled markers visible with a distinct disabled style. Creation, renaming, time changes, type conversion, deletion, and undo immediately update these tiles.

An enabled Pause region pauses all assigned outputs exactly when forward playback reaches its beginning. Record a pause reason and show the region name beside the transport. Play or the keyboard transport shortcut resumes beyond the same beginning without immediately pausing there again. A later pass through it, including another loop iteration, pauses again. Retain active-loop and queued-exit/next intent during the hold.

Deliberately jumping to a mapped lyric, Jump to beginning on a region, or Enter loop now resumes a cue held by a pause point. Manual pauses remain paused after those actions. With video-follow-lyrics disabled or an unmapped lyric, clicking a lyric does not navigate or resume. Merely selecting/editing a region, arming a loop, queueing exit, or setting the seeker does not auto-resume. An explicit seek to a point followed by Play proceeds past that point; future crossings remain enabled. Stop clears the runtime pause reason while preserving saved points.

Resolve pause-point crossings and loop boundaries chronologically. A pause point at a loop end takes precedence over the transition; on resume, perform the latest queued transition or ordinary repeat exactly once. A loop wrap or queued transition landing exactly on a pause point pauses there; jumps must not fire points in skipped intervals. Explicit operator navigation authorizes continuing from its destination. A runtime point ID, command revision, and pass/visit identity prevent repeated stops from duplicate status updates. Include these with playback/loop state in late-join snapshots. This requires renderer-owned timing and multi-output validation, not delayed operator polling.

## Confirmed requirements and revised recommendation

- Confirmed: support different videos across outputs and multiple synchronized crops of one video. Avoid independent video definitions scattered across song, style, and window editors.
- Confirmed: region loops and exit-at-end first. A–B is consolidated into the region's start/end boundaries. Beat/BPM-based loops and quantized jumps are outside the first version.
- Confirmed: zoom, subsecond precision, waveform drawing, directly resizable section blocks, and icon transport controls.
- Confirmed: overlapping regions, visually distinct loop regions, and the choice to exit a loop or transition to another loop.
- Confirmed: visual tools for source crop, screen placement/position, scale, and blur, with a detailed settings dialog as the proposed interface.
- Confirmed: fewer permanent inputs; a region context menu for removal and exact-time editing; choose Lyrics/mapping or Loop after drawing, with Cancel; legend below the drawing board.
- Confirmed: optional automatic loop entry and interactive enabling/disabling. The explicit Armed/Off and Active/Next states implement this distinction.
- Confirmed: mapping-first lyric creation with automatic naming, quick loop tiles, and boundary seek/audition controls.
- Confirmed: pause points that hold playback until Play, keyboard transport, or deliberate lyric/section navigation resumes it.
- Confirmed: Pause is a third region type in the same draw-and-classify flow as Lyrics and Loop, with shared editing controls. Pause-at-beginning and a visual-only ending are proposed semantics.
- Confirmed: fixed-width pause-icon markers regardless of drawn length, plus quick Enable/Disable pause tiles directly below loop tiles. This supersedes displaying pause duration as a proportional region width.
- Recommended architecture after this feedback: a shared media cue with per-output source/crop assignments and optional per-show-item lyric bindings. This replaces the earlier recommendation to attach video directly to the song.

Additional proposed defaults: block-level lyric timing first; both sync directions configurable and off for existing unmapped material; one audio owner; imported/shared output roles mapped explicitly to the local rig. Preserve existing shows and normal manual lyric navigation.

## Implementation sequence and acceptance

1. Correct the immediate seek/mute/visibility inconsistencies, clarify control destinations, and add accessible loading/error states and reliable URL typing.
2. Introduce the cue collection, output-role binding, source/crop assignment, and explicit transport/session model shared by operator, Electron outputs, browser outputs, and remote command paths. Verify one video/two crops, multiple aligned source videos, style precedence, source coverage, play/pause/stop/seek, one audio owner, and late-joining outputs.
3. Add persisted typed region data, preparation editing, and a zoomable timeline with drawing, moving, and resize handles. Verify post-draw type/mapping selection, cancelled creation, context-menu keyboard/touch access, exact-time modal save/cancel, subsecond values, snapping, pan/zoom coordinate conversion, overlapping lane layout, deterministic lyric overlap resolution, undo, round-trip save, repeated occurrences, arrangement changes, and missing sources. Verify framing-dialog crop/placement math, fit modes, blur scaling, and apply/cancel isolation for each output.
4. Add real waveform generation/cache with cancellation and an honest fallback. Check representative supported local/remote files, silent tracks, unsupported extraction, and large files.
5. Add both lyric-sync directions and renderer-owned region loops. Verify automatic armed entry, short ranges crossed between updates, arming/disarming inside a range, no preemption by overlaps, resume/seek behavior, one-pass bypass after exit, adjacent armed loops, cue boundaries, feedback suppression, instrumental sections, queued exit/next/cancel/replacement, boundary races, deleted targets, and item changes.
6. Exercise the complete flow in Electron and browser mode, including two outputs, output reconnection, touch/keyboard operation, narrow layouts, and German/English labels.

For the latest flow, verify mapping-derived names and custom overrides; loop tile arm/disarm, exit cancellation, and replacement of a queued target; isolated auditions at cue edges and draft boundaries; and explicit boundary seeks. Verify shared Pause classification, cancelled creation, type conversion, moving/resizing, context-menu enable/disable, enabled/disabled pause regions, start-only triggering, resume without immediate retrigger, manual pause versus point hold, navigation with lyric sync disabled, repeated loop passes, pause/loop boundary ties, wrap/queued landing on a point, skipped intervals, points crossed between frames, undo, persistence, and reconnection while held.

The latest interactive conversation concept additionally demonstrates mapping-first names, quick loop tiles, boundary seeks and separate audition clocks, and Pause as a third drawn region type with shared editing and Play/keyboard/navigation resumption. The separate A–B interface has been removed. Screen assignments are collapsed by default. **Frame & effects…** retains the crop, placement, scale, fit, alignment, blur, and per-output apply/cancel dialog using a calibration pattern. All waveform/media clocks are simulated; this remains disconnected from the application and real media. It does not implement real waveform extraction, video/audio, backend persistence, real output synchronization, or optional crop aspect locking. The concept combines audio/waveform source selection for brevity; production keeps them distinct as specified above.
