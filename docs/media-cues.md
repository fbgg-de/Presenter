# Media cues

The operator Control pane now includes a **Media cue** editor. Cues belong to the show; a song or media item references a cue. The song library does not own video files. Reuse an existing cue to share its sources and timeline, or duplicate it for independent edits.

## Prepare a cue

1. Select a show item and choose **Create cue**.
2. Pick an image or video and choose **Use this file**. The browser opens directly for a new cue; an existing media item's source is offered automatically. The first video's duration and waveform source are detected automatically.
3. Tick the saved presentation windows under **Show on these screens**. One source can feed several windows, each with its own crop. Adding another source gives each selected window a source chooser.
4. **Play audio in the main window** controls the single audio player on this PC. No presentation window is needed for sound; visual copies stay muted. The main editor has a live mute switch.
5. Use **Frame & effects** beside a screen to crop, position, scale, fit, and blur its image or video. The preview uses that window's aspect ratio. Save applies sources and assignments together.
6. **Advanced · timing, sources & output roles** holds manual duration, source offsets, independent audio/waveform sources, and portable role names. Source time equals cue time plus offset. Reopening setup does not silently shorten existing regions.

Source and timeline settings are portable show data. Role-to-window bindings belong to the local rig. Missing bindings and closed windows are shown explicitly. An assigned role suppresses inherited style media; **No media** explicitly suppresses it too. Unassigned windows retain their normal backgrounds.

## Edit sections

Drag on the timeline, then choose the region type:

- **Lyrics:** choose a lyric block first; its name becomes the section name. A custom name is optional. Repeated block occurrences can be mapped separately. An instrumental mapping clears the lyrics.
- **Loop:** an armed loop enters automatically when playback reaches it. Overlapping regions are supported and stacked in separate rows.
- **Pause:** pauses at the beginning of the drawn selection. It uses a fixed-width pause icon and is a point, irrespective of the length initially drawn.

Use the pencil tool to draw over existing regions. Drag regions to move them; select a section to expose its resize handles. Zoom, pan and 1/10/100 ms snapping support precise editing. Right-click, Shift+F10, or the selected region's ellipsis opens actions for editing, jumping and deleting. Exact times are inside the shared edit dialog. Undo restores preparation edits, including mappings.

When the timeline has focus, Left/Right seeks by the selected snap step; Shift+Left/Right jumps one second; Alt+Left/Right jumps to the previous/next section boundary. Home/End seeks to the cue ends, and Space toggles playback. The keyboard icon shows these shortcuts and focuses the timeline.

Beginning/ending controls either pause and position the live seeker or audition the boundary locally. Auditions have an independent clock and do not run the cue's loops or pauses.

## Run playback

The icon controls and configured video playback shortcut (Space by default) operate the shared transport. The lower section and pause controls provide quick access:

- Section name buttons jump to their section. The two follow switches control automatic playback-to-lyrics and lyric-click-to-playback mapping.
- The separate loop icon beside a section arms/disarms its loop. An active loop button requests exit at its end; clicking again cancels the exit. Its context menu can enter another loop immediately or queue it after the active loop.
- Pause buttons enable/disable pause points. Play or a section/lyric jump resumes a point hold. A deliberate manual pause stays paused when navigating.

Runtime arming overrides are separate from saved defaults. Stop resets position and pending actions while retaining the current arming choices. Preparation changes pause the cue; live audio mute/unmute keeps the video running. Changed lyric arrangements require reviewing and confirming mappings before automatic synchronization resumes.

The development schema now uses section/pause regions with a separate loop flag. Earlier development cues should be detached and recreated; no compatibility migration is included.

## Storage and deployment

`Show.mediaCues` holds sources, regions and role assignments. `ShowItem.mediaCue` holds the cue reference and lyric mappings. The show save/rename/copy paths preserve cues. Save the show using the existing Save control to upload local changes.

Apply **database migration 24** in the admin migrations UI before using the updated PHP Shows endpoint. It adds the nullable `shows.media_cues` JSON column. Fresh installations include it in `install.sql`. Requests omitting `mediaCues` preserve existing cue data.

## Validation and limits

Run `npm run test:media`, `npm run test:media:browser`, `npm run test:media:outputs`, `npm run test:media:server`, and `npm run test:media:library`. Browser tests use a temporary browser profile and an isolated fixture API. Output tests use generated PCM media to exercise native media decoding, two output clocks, audio ownership, source framing, pause/resume/seek and real waveform extraction. They do not test an actual projector or every encoded video format.

Waveforms decode the audio track in a worker using Mediabunny and browser audio codecs. Bounded HTTP range requests and an 8 MiB source cache avoid downloading an entire large video. An animated skeleton and spinner appear inside the audio strip while decoding. Completed peaks stay cached for up to eight sources during the session. Use the waveform refresh icon after replacing a file. Missing audio tracks, unsupported codecs, or unreadable files have distinct messages; timeline editing still works. Servers should support HEAD and byte ranges; files up to 16 MiB also work without ranges. Original media files are referenced, not uploaded or transcoded by the cue editor.

Video thumbnails build automatically one at a time and remain cached during browsing. Hovering still plays a muted preview; images load lazily. Pagination advances past unsupported files on older local servers. Updated desktop builds also cache asynchronous directory listings and filter by type/search before pagination. Deploy the web build for the editor/browser changes and update the desktop app for the local server improvements. No additional database migration is needed after migration 24.

The library regression can test a specific local MP4: `node test/media-cue/library.mjs "path/to/video.mp4"`. It keeps the file local and verifies waveform generation with a virtual 128 MiB padding block, checking that only a small fraction is requested.

Time values have millisecond precision; HTML media seeking, decoder buffering and display scheduling are not frame-locked or sample-accurate. Loop seeks are not guaranteed gapless. Outputs show loading/playback failures to the operator; clocks continue while a particular source buffers. Different recordings need matching playback rates and edits for a single offset to align them throughout. Beat/BPM quantization, time stretching, reusable cue-library presets and automatic conversion of inherited style backgrounds are not included.

PHP/MySQL migration execution and a physical multi-output Electron rehearsal remain deployment checks; the local automated suites use the fixture API and browser outputs.
