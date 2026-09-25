/**
 * Image, video and slideshow entries of the agenda: their data (versions, role, screens), the
 * playback rules (who covers whom, several at once, stacking, text taking over, leaving a group,
 * ending by itself, fading out), the group settings and what each window is sent.
 *
 *   node test/media-items/run.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'media-items-'));
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
    alias: { '@': resolve('src/renderer/src'), react: resolve('node_modules/react') },
  });
  return import(pathToFileURL(join(dir, out)).href);
};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const I = await bundle('src/renderer/src/media/mediaItem.ts', 'item.mjs');
const P = await bundle('src/renderer/src/media/playback.ts', 'playback.mjs');
const G = await bundle('src/renderer/src/presentation/groupContent.ts', 'group.mjs');
const S = await bundle('src/renderer/src/media/groupPlayback.ts', 'settings.mjs');
const L = await bundle('src/renderer/src/media/lyricFollow.ts', 'follow.mjs');

const group = (id, kind, layers = {}, enabled = true) => ({ id, name: `G${id}`, enabled, sort_order: id, data: { kind, layers } });
const audience = group(1, 'audience');
const stage = group(2, 'stage');
const led = group(3, 'wall');
const stream = group(4, 'stream', { media: false });
const groups = [audience, stage, led, stream];

// ── Entry data ────────────────────────────────────────────────────────────────

const video = I.newMediaItemData('video', 'Worship/clouds.mp4', { groups });
const version = I.activeVersionOf(video);
eq('a new entry is content', video.role, 'content');
eq(
  'content shows on groups that show media items, never on stage',
  version.assignments.map((a) => a.role),
  ['group:1', 'group:3'],
);
eq('a content video is heard on the operator computer and does not loop', [version.audioEnabled, version.loop], [true, false]);
const bg = I.newMediaItemData('image', 'bg/rays.jpg', { groups, role: 'background' });
eq(
  'a background shows on groups that show backgrounds',
  I.activeVersionOf(bg).assignments.map((a) => a.role),
  ['group:1', 'group:3'],
);
eq('without screen groups an entry shows everywhere', I.activeVersionOf(I.newMediaItemData('image', 'a.png')).assignments[0].role, 'all');

const legacy = {
  type: 'media',
  mediaSubType: 'video',
  mediaPath: 'old/intro.mp4',
  mediaObjectFit: 'contain',
  mediaZoom: 120,
  mediaLoop: false,
};
const read = I.mediaItemDataOf(legacy);
eq(
  'an entry saved before versions reads as one version on every screen',
  [read.role, read.versions.length, read.versions[0].assignments[0].role],
  ['content', 1, 'all'],
);
eq(
  'its display fields become the framing',
  [read.versions[0].assignments[0].frame.fit, read.versions[0].assignments[0].frame.scale],
  ['contain', 120],
);
eq('reading it twice gives the same ids (no false changes)', JSON.stringify(I.mediaItemDataOf(legacy)), JSON.stringify(read));
eq(
  'colours and audio are not media entries',
  [
    I.mediaItemDataOf({ type: 'media', mediaSubType: 'color' }),
    I.mediaItemDataOf({ type: 'media', mediaSubType: 'audio', mediaPath: 'a.mp3' }),
  ],
  [undefined, undefined],
);

let v = I.toggleScreen(version, 'group:4', true);
eq('turning a screen on copies the framing of the first', v.assignments.at(-1).frame, version.assignments[0].frame);
v = I.toggleScreen(v, 'group:1', false);
eq(
  'and off removes it',
  v.assignments.map((a) => a.role),
  ['group:3', 'group:4'],
);
const everywhere = I.toggleScreen(I.activeVersionOf(read), 'group:3', true);
eq(
  'choosing a group replaces "all screens"',
  everywhere.assignments.map((a) => a.role),
  ['group:3'],
);
eq(
  'the group assignment wins, all-screens is the fallback',
  [I.assignmentFor(read.versions[0], 7)?.role, I.assignmentFor(version, 2)],
  ['all', undefined],
);
const copy = I.duplicateVersion(version, 'Short');
eq(
  'a new version is a copy with its own id',
  [copy.name, copy.id !== version.id, copy.sources[0].path],
  ['Short', true, 'Worship/clouds.mp4'],
);

// ── Playback rules ────────────────────────────────────────────────────────────

const cue = (id, loop = false) => ({
  id,
  name: id,
  duration: 60,
  sources: [{ id: 's', name: id, path: `http://media/${id}.mp4`, type: 'video', offset: 0 }],
  regions: [],
  assignments: [
    { role: 'group:1', sourceId: 's', frame: I.defaultMediaFrame() },
    { role: 'group:3', sourceId: 's', frame: I.defaultMediaFrame() },
  ],
  loop,
});
let agendaCounter = 0;
const entry = (key, role, screens, agendaGroupId = 'worship', extra = {}) => ({
  key,
  label: key,
  role,
  agendaGroupId,
  agendaIndex: agendaCounter++,
  cue: cue(key, role === 'background'),
  screens,
  ...extra,
});
const live = () =>
  P.getPlaybacks()
    .filter((p) => p.endsAt === undefined)
    .map((p) => p.key);
const onScreen = (groupId, backgroundVisible = true) => {
  const media = P.mediaForScreen(P.getPlaybacks(), groupId, { backgroundVisible });
  const top = media.contents.filter((packet) => packet.visible !== false).at(-1);
  return [media.background?.cue.id ?? null, media.background?.visible ?? null, top?.cue.id ?? null];
};

P.startPlayback(entry('clouds', 'background', ['1', '3']), { autoplay: true, fadeMs: 0 });
P.startPlayback(entry('welcome', 'content', ['3']), { autoplay: true, fadeMs: 0 });
eq('a background and content on the LED wall at once', onScreen(3), ['clouds', true, 'welcome']);
eq('the audience sees only the background', onScreen(1), ['clouds', true, null]);
eq('stage shows neither', onScreen(2), [null, null, null]);
eq(
  'videos start playing',
  P.getPlaybacks().map((p) => p.transport.playing),
  [true, true],
);

P.startPlayback(entry('rays', 'background', ['1']), { autoplay: true, fadeMs: 0 });
eq('a newer background covers the older one only where it shows', [onScreen(1)[0], onScreen(3)[0]], ['rays', 'clouds']);
P.startPlayback(entry('stars', 'background', ['3']), { autoplay: true, fadeMs: 200 });
eq('covered everywhere, the older background ends', live(), ['welcome', 'rays', 'stars']);

P.coverContent(['1', 'none'], 0);
eq('text on the audience leaves the LED wall content alone', onScreen(3)[2], 'welcome');
P.coverContent(['3'], 0);
eq('text on the LED wall ends it', live().includes('welcome'), false);

P.startPlayback(entry('announce', 'content', ['3'], 'welcome'), { autoplay: true, fadeMs: 0 });
P.endGroupPlaybacks('welcome', 'content', 0);
eq('leaving an agenda group ends its content', live().includes('announce'), false);
eq('but its backgrounds keep running', live().includes('rays'), true);

eq('Hide background: delivered, but invisible', onScreen(1, false), ['rays', false, null]);
P.setPlaybackHidden('rays', true);
eq('Clear on one entry hides it', onScreen(1)[1], false);
P.setPlaybackHidden('rays', false);

const before = P.getPlaybacks().find((p) => p.key === 'rays').transport.session;
P.startPlayback(entry('rays', 'background', ['1']), { autoplay: true, fadeMs: 0 });
eq('starting a running entry again keeps its clock', P.getPlaybacks().find((p) => p.key === 'rays').transport.session, before);

P.endPlayback('rays', 100);
eq(
  'ending fades: still delivered, invisible, with its fade time',
  [onScreen(1)[0], onScreen(1)[1], P.mediaForScreen(P.getPlaybacks(), 1, { backgroundVisible: true }).background.fadeMs],
  ['rays', false, 100],
);
await wait(200);
eq('and is gone after the fade', onScreen(1), [null, null, null]);

P.startPlayback(entry('loop', 'background', ['1']), { autoplay: true, fadeMs: 0 });
const edited = {
  ...entry('loop', 'background', ['1']),
  cue: { ...cue('loop', true), assignments: [{ role: 'group:1', sourceId: 's', frame: { ...I.defaultMediaFrame(), fit: 'contain' } }] },
};
P.updatePlayback(edited);
const after = P.getPlaybacks().find((p) => p.key === 'loop');
const sessionBeforeSwap = after.transport.session;
eq('changing the framing keeps it playing', [after.transport.playing, after.cue.assignments[0].frame.fit], [true, 'contain']);
P.updatePlayback({ ...edited, cue: { ...edited.cue, sources: [{ ...edited.cue.sources[0], path: 'http://media/other.mp4' }] } });
const swapped = P.getPlaybacks().find((p) => p.key === 'loop');
eq(
  'changing the file pauses it in a new session',
  [swapped.transport.playing, swapped.transport.session !== sessionBeforeSwap],
  [false, true],
);
P.resetPlaybacks();

// ── Several at once, stacking, ending by itself ───────────────────────────────

const contentIds = (groupId) => P.mediaForScreen(P.getPlaybacks(), groupId, { backgroundVisible: true }).contents.map((p) => p.cue.id);
P.startPlayback(entry('a', 'content', ['1'], 'welcome', { agendaIndex: 5 }), { autoplay: true, fadeMs: 0, maxAtOnce: 2 });
P.startPlayback(entry('b', 'content', ['1'], 'welcome', { agendaIndex: 3 }), { autoplay: true, fadeMs: 0, maxAtOnce: 2 });
eq('two at once stack by start, the newest on top', contentIds(1), ['a', 'b']);
P.startPlayback(entry('c', 'content', ['1'], 'welcome', { agendaIndex: 4 }), { autoplay: true, fadeMs: 0, maxAtOnce: 2 });
eq('a third covers the oldest', contentIds(1), ['b', 'c']);
P.resetPlaybacks();
for (const [key, index] of [
  ['x', 2],
  ['y', 1],
]) {
  P.startPlayback(entry(key, 'content', ['1'], 'welcome', { agendaIndex: index, stackBy: 'agendaOrder' }), {
    autoplay: true,
    fadeMs: 0,
    maxAtOnce: 0,
  });
}
eq('stacked by agenda order, the later entry is on top', contentIds(1), ['y', 'x']);
P.resetPlaybacks();

const endedKeys = [];
const unsubscribe = P.onPlaybackEnded((playback) => endedKeys.push(playback.key));
P.startPlayback({ ...entry('short', 'content', ['1']), cue: { ...cue('short'), duration: 0.05 } }, { autoplay: true, fadeMs: 0 });
P.startPlayback(
  { ...entry('looping', 'background', ['1']), cue: { ...cue('looping', true), duration: 0.05 } },
  { autoplay: true, fadeMs: 0 },
);
await wait(120);
P.tickPlaybacks();
eq('an entry that reaches its end says so; a loop does not', endedKeys, ['short']);
unsubscribe();
P.resetPlaybacks();

// ── Group settings ────────────────────────────────────────────────────────────

eq(
  'an agenda group without settings plays one at a time, fades content out and keeps backgrounds',
  [S.groupMediaSettings(undefined), S.groupBackgroundSettings({})],
  [
    { mode: 'sequence', autoAdvance: false, maxAtOnce: 1, topLayer: 'lastStarted', onLeave: 'fade', startWithSong: false },
    { transition: 'fade', onLeave: 'keep' },
  ],
);
eq(
  'stored settings are kept, nonsense falls back',
  S.groupMediaSettings({ media: { mode: 'together', maxAtOnce: 0, onLeave: 'explode', autoAdvance: 'yes' } }),
  { mode: 'together', autoAdvance: false, maxAtOnce: 0, topLayer: 'lastStarted', onLeave: 'fade', startWithSong: false },
);

// ── Slideshows ────────────────────────────────────────────────────────────────

const slides = I.newSlideshowData(['a.jpg', 'b.jpg', 'c.jpg'], { groups, seconds: 5 });
const show = I.activeVersionOf(slides);
eq('a slideshow repeats and fades by default', [show.loop, show.slideshow], [true, { seconds: 5, transition: 'fade' }]);
eq('its length is every image for its seconds', I.slideshowDuration(show), 15);
eq(
  'the clock picks the image',
  [0, 4.9, 5, 14.99, 20].map((t) => I.slideAt(show, t).index),
  [0, 0, 1, 2, 2],
);

{
  // ◀ ▶ in the transports: images for a slideshow, sections for a video, else ten seconds.
  const slides = { duration: 0, regions: [], sources: [{}, {}, {}], slideshow: { seconds: 5, transition: 'cut' } };
  eq('slideshow: next image', I.stepTarget(slides, 6, 1), { time: 10, unit: 'slide' });
  eq('slideshow: previous image', I.stepTarget(slides, 6, -1), { time: 0, unit: 'slide' });
  eq('slideshow: nothing before the first image', I.stepTarget(slides, 2, -1), { time: undefined, unit: 'slide' });
  eq('slideshow: ticks where images start', I.slideStarts(slides), [0, 5, 10]);
  const sections = {
    duration: 60,
    sources: [],
    regions: [
      { id: 'a', kind: 'section', start: 0, end: 20, name: 'A' },
      { id: 'p', kind: 'pause', start: 25, end: 25, name: 'P' },
      { id: 'b', kind: 'section', start: 30, end: 60, name: 'B' },
    ],
  };
  eq('video: next section start', I.stepTarget(sections, 10, 1), { time: 30, unit: 'section' });
  eq('video: back from just past a start goes to the one before', I.stepTarget(sections, 30.5, -1), { time: 0, unit: 'section' });
  eq('video: nothing after the last section', I.stepTarget(sections, 40, 1), { time: undefined, unit: 'section' });
  const plain = { duration: 25, sources: [], regions: [] };
  eq('plain video: ten seconds on', I.stepTarget(plain, 3, 1), { time: 13, unit: 'seconds' });
  eq('plain video: not past the end', I.stepTarget(plain, 20, 1), { time: 25, unit: 'seconds' });
  eq('plain video: nothing before the start', I.stepTarget(plain, 0, -1), { time: undefined, unit: 'seconds' });
}
eq('a slideshow runs on a clock, an image does not', [I.hasClock(show), I.hasClock(I.activeVersionOf(bg))], [true, false]);
eq(
  'a slideshow entry reads as media data',
  I.mediaItemDataOf({ type: 'media', mediaSubType: 'slideshow', media: slides })?.role,
  'content',
);

// ── Lyrics and video follow each other ────────────────────────────────────────

const slidesA = [
  { name: 'Verse 1', lines: ['Holy God'] },
  { name: 'Chorus', lines: ['We praise'] },
  { name: 'Verse 2', lines: ['Lord of all'] },
  { name: 'Chorus', lines: ['We praise'] },
];
/** The lyric occurrence id of a slide, as the song editor's mapping stores it (name and repeat). */
const occ = (index) =>
  JSON.stringify([slidesA[index].name, slidesA.slice(0, index + 1).filter((b) => b.name === slidesA[index].name).length]);
const region = (id, start, end, kind = 'section') => ({ id, name: id, kind, start, end });
const mapped = {
  ...cue('mapped'),
  duration: 100,
  regions: [
    region('intro', 0, 10),
    region('v1', 10, 30),
    region('c1', 30, 50),
    region('v2', 50, 70),
    region('c2', 70, 90),
    region('hold', 95, 96, 'pause'),
  ],
  lyrics: {
    ...L.emptyLyricBinding('song-1', slidesA),
    map: { intro: 'clear', v1: occ(0), c1: occ(1), v2: occ(2), c2: occ(3) },
  },
};
eq(
  'the song slide follows the video time',
  [5, 12, 45, 60, 80, 99].map((t) => L.slideForTime(mapped, t, slidesA)),
  [-1, 0, 1, 2, 3, undefined],
);
eq(
  'moving to a slide finds its section',
  [0, 1, 3].map((i) => L.sectionForSlide(mapped, i, 0, slidesA)?.id),
  ['v1', 'c1', 'c2'],
);
const twice = { ...mapped, lyrics: { ...mapped.lyrics, map: { ...mapped.lyrics.map, c2: occ(1) } } };
eq(
  'a slide mapped twice: the section the video is in, else the next one ahead',
  [
    L.sectionForSlide(twice, 1, 75, slidesA)?.id,
    L.sectionForSlide(twice, 1, 55, slidesA)?.id,
    L.sectionForSlide(twice, 1, 95, slidesA)?.id,
  ],
  ['c2', 'c2', 'c1'],
);
const reordered = [slidesA[1], slidesA[0], slidesA[2], slidesA[3]];
eq(
  'another arrangement follows nothing until confirmed',
  [L.slideForTime(mapped, 12, reordered), L.mappingMatches(mapped.lyrics, reordered)],
  [undefined, false],
);
eq(
  'switching following off stops it in that direction only',
  [
    L.slideForTime({ ...mapped, lyrics: { ...mapped.lyrics, followVideo: false } }, 12, slidesA),
    L.sectionForSlide({ ...mapped, lyrics: { ...mapped.lyrics, followVideo: false } }, 0, 0, slidesA)?.id,
  ],
  [undefined, 'v1'],
);
eq(
  'a disarmed section is left out both ways: lyrics stay, the slide finds no section',
  [L.slideForTime(mapped, 35, slidesA, { c1: false }), L.sectionForSlide(mapped, 1, 0, slidesA, { c1: false })?.id],
  [undefined, undefined],
);
eq(
  'a section disarmed in the saved cue but armed at runtime counts again',
  L.slideForTime({ ...mapped, regions: mapped.regions.map((r) => (r.id === 'c1' ? { ...r, enabled: false } : r)) }, 35, slidesA, { c1: true }),
  1,
);
const editorBinding = L.timelineBinding(mapped);
eq(
  'the timeline editor gets the mapping in its own shape and gives it back',
  L.withTimelineBinding(mapped, { ...editorBinding, followLyrics: false }).lyrics,
  {
    ...mapped.lyrics,
    followLyrics: false,
  },
);
eq(
  'a version without a song keeps none after editing',
  L.withTimelineBinding(cue('plain'), L.timelineBinding(cue('plain'))).lyrics,
  undefined,
);

// ── What a window is sent ─────────────────────────────────────────────────────

const packet = {
  cue: cue('x'),
  transport: { session: 's', revision: 0, time: 0, playing: true, exitLoop: false, bypass: [], enabled: {} },
  at: 0,
  visible: true,
};
const content = {
  contentType: 'song',
  displayMode: 'normal',
  activeBlockIndex: 0,
  activeLineIndex: 0,
  blocks: [],
  style: {},
  isBlack: false,
};
const sent = (groupId, extra = {}) =>
  G.applyScreenGroup({ ...content, ...extra }, groups, groupId, { media: { background: packet, contents: [packet] } }).media;
eq('the audience gets both layers', [!!sent(1)?.background, sent(1)?.contents.length], [true, 1]);
eq('a group without media items gets no content layer', [!!sent(4)?.background, sent(4)?.contents.length ?? 0], [false, 0]);
eq('a stage group gets neither', sent(2), undefined);
eq('a hidden background is sent invisible', sent(1, { hideBackground: true }).background.visible, false);

// ── Master speed ──────────────────────────────────────────────────────────────

P.resetPlaybacks();
P.setMasterRate(1);
P.setFollowMasterByDefault(true);
P.startPlayback(entry('m1', 'content', ['1']), { autoplay: true, fadeMs: 0 });
P.startPlayback(entry('m2', 'background', ['1']), { autoplay: true, fadeMs: 0 });
const rateOfKey = (key) => P.getPlaybacks().find((p) => p.key === key)?.transport.rate ?? 1;
P.setMasterRate(1.5);
eq('the master speed re-times every follower', [rateOfKey('m1'), rateOfKey('m2')], [1.5, 1.5]);
P.commandPlayback('m1', { type: 'rate', rate: 0.75 });
eq('an own speed detaches the entry', P.getPlaybacks().find((p) => p.key === 'm1').followsMaster, false);
P.setMasterRate(2);
eq('a detached entry keeps its own speed', [rateOfKey('m1'), rateOfKey('m2')], [0.75, 2]);
P.setPlaybackFollowsMaster('m1', true);
eq('re-attached, it takes the master speed', rateOfKey('m1'), 2);
P.startPlayback(entry('m3', 'content', ['3']), { autoplay: true, fadeMs: 0 });
eq('a new video starts at the master speed', rateOfKey('m3'), 2);
P.setFollowMasterByDefault(false);
P.startPlayback(entry('m4', 'content', ['3'], 'other'), { autoplay: true, fadeMs: 0 });
eq('with the setting off, a new video plays at its own 1×', [rateOfKey('m4'), P.getPlaybacks().find((p) => p.key === 'm4').followsMaster], [1, false]);
P.setMasterRate(99);
eq('the master is kept within the limits', P.getMasterRate(), 4);
P.setMasterRate(1);
P.setFollowMasterByDefault(true);

// ── Playback clock ────────────────────────────────────────────────────────────

// Time running on is not a change of the list (that re-rendered the whole operator view four
// times a second); the clock tells the readouts. Reaching a hold is a change.
P.resetPlaybacks();
const held = { ...cue('held'), regions: [{ id: 'hold', kind: 'pause', name: 'hold', start: 0.2, end: 0.3 }] };
P.startPlayback({ ...entry('held', 'content', ['1']), cue: held }, { autoplay: true, fadeMs: 0 });
let listTold = 0;
let clockTold = 0;
const stopList = P.subscribePlaybacks(() => listTold++);
const stopClock = P.subscribePlaybackClock(() => clockTold++);
P.tickPlaybacks();
await wait(80);
P.tickPlaybacks();
eq('running on does not republish the list', listTold, 0);
await wait(300);
P.tickPlaybacks();
eq('reaching a hold republishes the list, paused there', [listTold, P.getPlaybacks()[0].transport.pausedAt], [1, 'hold']);
eq('the clock told the readouts while it played', clockTold > 0, true);
const clockBefore = clockTold;
await wait(300);
P.tickPlaybacks();
eq('nothing playing, the clock is quiet', clockTold, clockBefore);
stopList();
stopClock();
P.resetPlaybacks();

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
