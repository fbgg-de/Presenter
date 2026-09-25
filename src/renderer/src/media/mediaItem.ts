/**
 * Image and video entries of the agenda.
 *
 * An entry holds one or more *versions* (like the orders of a song) and plays one of them. A
 * version is a media cue: its files, its timeline, and per screen group which file shows there
 * and how it is framed. The entry's *role* decides where it sits: Content fills the screen as the
 * item itself; Background sits behind the text of its agenda group.
 *
 * Entries saved before versions existed only carry `mediaPath` and a few display fields; they
 * are read as a single version on every screen, without rewriting the show.
 *
 * Imports only dependency-free modules: the bridge, the host and the tests use it.
 */
import type { ShowItem } from '@/api/shows.api';
import { newId } from '@/utils/ids';
import { normaliseScreenGroupData, type ScreenGroupEntity } from '@/screens/types';
import type { MediaAssignment, MediaCue, MediaFrame, MediaSource } from './types';

export type MediaRole = 'content' | 'background';

/** A version of a media entry. */
export type MediaVersion = MediaCue;

export interface MediaItemData {
  role: MediaRole;
  /** The version played. */
  versionId: string;
  versions: MediaVersion[];
}

/** The assignment role that reaches every window, whatever its screen group — and windows without one. */
export const ALL_SCREENS = 'all';

const GROUP_PREFIX = 'group:';
export const screenRole = (groupId: number): string => `${GROUP_PREFIX}${groupId}`;
export const groupIdOfRole = (role: string): number | undefined => {
  if (!role.startsWith(GROUP_PREFIX)) return undefined;
  const id = Number(role.slice(GROUP_PREFIX.length));
  return Number.isInteger(id) ? id : undefined;
};

export const defaultMediaFrame = (fit: MediaFrame['fit'] = 'cover'): MediaFrame => ({
  crop: { x: 0, y: 0, w: 1, h: 1 },
  x: 50,
  y: 50,
  scale: 100,
  fit,
  blur: 0,
});

/** Whether an entry is an image, video or slideshow entry (colours and audio are not). */
export const isVisualMediaItem = (item: ShowItem | undefined): boolean =>
  item?.type === 'media' && (item.mediaSubType === 'image' || item.mediaSubType === 'video' || item.mediaSubType === 'slideshow');

export const DEFAULT_SLIDE_SECONDS = 8;

/** A slideshow entry's data for a list of images. Repeats unless told otherwise. */
export function newSlideshowData(
  paths: string[],
  options: { role?: MediaRole; groups?: Pick<ScreenGroupEntity, 'id' | 'enabled' | 'data'>[]; seconds?: number } = {},
): MediaItemData {
  const role = options.role ?? 'content';
  const sources: MediaSource[] = paths.map((path) => ({ id: newId('m'), name: fileLabel(path), path, type: 'image', offset: 0 }));
  const version: MediaVersion = {
    id: newId('m'),
    name: 'Default',
    duration: 0,
    sources,
    regions: [],
    assignments: defaultScreens(options.groups ?? [], role).map((screen) => ({
      role: screen,
      sourceId: sources[0]?.id ?? null,
      frame: defaultMediaFrame(),
    })),
    loop: true,
    slideshow: { seconds: options.seconds ?? DEFAULT_SLIDE_SECONDS, transition: 'fade' },
  };
  return { role, versionId: version.id, versions: [version] };
}

/** The length of a slideshow version: every image for its seconds. */
export const slideshowDuration = (version: MediaCue): number =>
  version.slideshow ? version.sources.length * Math.max(0.5, version.slideshow.seconds) : 0;

/** Which image a slideshow shows at `time`, and how far into it. */
export function slideAt(version: MediaCue, time: number): { index: number; offset: number } {
  const count = version.sources.length;
  const seconds = Math.max(0.5, version.slideshow?.seconds ?? DEFAULT_SLIDE_SECONDS);
  if (!count) return { index: -1, offset: 0 };
  const index = Math.min(count - 1, Math.max(0, Math.floor(time / seconds)));
  return { index, offset: time - index * seconds };
}

/** Where a slideshow jumps for one step back (-1) or ahead (+1) from `time`; ahead wraps round. */
export function slideStepTime(version: MediaCue, time: number, delta: -1 | 1): number {
  const count = version.sources.length;
  const seconds = Math.max(0.5, version.slideshow?.seconds ?? DEFAULT_SLIDE_SECONDS);
  const { index } = slideAt(version, time);
  return delta < 0 ? Math.max(0, index - 1) * seconds : ((index + 1) % Math.max(1, count)) * seconds;
}

/** What ◀ and ▶ step by: a slideshow's images, a video's sections, else ten seconds. */
export type StepUnit = 'slide' | 'section' | 'seconds';
export const SEEK_STEP_SECONDS = 10;

/**
 * Where ◀ (-1) and ▶ (+1) take the clock from `time`, and what they step by. `undefined` when
 * there is nothing that way. Stepping back from just past a start goes to the one before, as a
 * player's "previous" does, so pressing twice is never stuck on the same spot.
 */
export function stepTarget(version: MediaCue, time: number, delta: -1 | 1): { time: number | undefined; unit: StepUnit } {
  if (version.slideshow) {
    const count = version.sources.length;
    if (count < 2) return { time: undefined, unit: 'slide' };
    const { index } = slideAt(version, time);
    if (delta < 0 && index === 0) return { time: undefined, unit: 'slide' };
    return { time: slideStepTime(version, time, delta), unit: 'slide' };
  }
  const starts = [...new Set(version.regions.filter((r) => r.kind === 'section').map((r) => r.start))].sort((a, b) => a - b);
  if (starts.length > 0) {
    const target = delta < 0 ? starts.filter((start) => start < time - 1).at(-1) : starts.find((start) => start > time + 0.05);
    return { time: target ?? (delta < 0 && time > 1 ? 0 : undefined), unit: 'section' };
  }
  const end = Math.max(0, version.duration);
  const target = Math.min(end, Math.max(0, time + delta * SEEK_STEP_SECONDS));
  return { time: Math.abs(target - time) < 0.05 ? undefined : target, unit: 'seconds' };
}

/** The regions as armed right now: the runtime arming (layer bar, timeline) over the saved one. */
export const armedRegions = (version: MediaCue, enabled: Record<string, boolean> | undefined) =>
  enabled ? version.regions.map((region) => (region.id in enabled ? { ...region, enabled: enabled[region.id] } : region)) : version.regions;

/** Where each image of a slideshow starts, for ticks on its scrubber. */
export const slideStarts = (version: MediaCue): number[] => {
  const seconds = Math.max(0.5, version.slideshow?.seconds ?? DEFAULT_SLIDE_SECONDS);
  return version.slideshow ? version.sources.map((_, index) => index * seconds) : [];
};

/** Screen groups a new entry shows on: the enabled ones whose windows show that role's layer. */
export function defaultScreens(groups: Pick<ScreenGroupEntity, 'id' | 'enabled' | 'data'>[], role: MediaRole): string[] {
  const fitting = groups.filter((group) => {
    if (!group.enabled) return false;
    const data = normaliseScreenGroupData(group.data);
    return data.kind !== 'stage' && (role === 'background' ? data.layers.background : data.layers.media);
  });
  return fitting.length ? fitting.map((group) => screenRole(group.id)) : [ALL_SCREENS];
}

/** A fresh entry's data for one file. */
export function newMediaItemData(
  kind: 'image' | 'video',
  path: string,
  options: { role?: MediaRole; groups?: Pick<ScreenGroupEntity, 'id' | 'enabled' | 'data'>[]; name?: string } = {},
): MediaItemData {
  const role = options.role ?? 'content';
  const source: MediaSource = { id: newId('m'), name: fileLabel(path), path, type: kind, offset: 0 };
  const version: MediaVersion = {
    id: newId('m'),
    name: options.name ?? 'Default',
    duration: 0,
    sources: [source],
    regions: [],
    assignments: defaultScreens(options.groups ?? [], role).map((screen) => ({
      role: screen,
      sourceId: source.id,
      frame: defaultMediaFrame(),
    })),
    audioSourceId: kind === 'video' ? source.id : undefined,
    // A content video is heard on the operator computer, as media items always were; a
    // background loop stays silent.
    audioEnabled: kind === 'video' && role === 'content',
    loop: role === 'background',
  };
  return { role, versionId: version.id, versions: [version] };
}

const fileLabel = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '') || path;

const LEGACY_VERSION = 'legacy';
const LEGACY_SOURCE = 'legacy-source';

/**
 * The entry's media data: stored, or read from the fields of an entry saved before versions.
 * Undefined for anything that is not an image or video entry.
 */
export function mediaItemDataOf(item: ShowItem | undefined): MediaItemData | undefined {
  if (!item || !isVisualMediaItem(item)) return undefined;
  if (item.media && item.media.versions.length > 0) return item.media;
  if (!item.mediaPath || item.mediaSubType === 'slideshow') return undefined;
  const kind = item.mediaSubType as 'image' | 'video';
  const frame: MediaFrame = {
    ...defaultMediaFrame(item.mediaObjectFit ?? 'cover'),
    scale: item.mediaZoom ?? 100,
    blur: item.mediaBlur ?? 0,
  };
  return {
    role: 'content',
    versionId: LEGACY_VERSION,
    versions: [
      {
        id: LEGACY_VERSION,
        name: 'Default',
        duration: 0,
        sources: [{ id: LEGACY_SOURCE, name: fileLabel(item.mediaPath), path: item.mediaPath, type: kind, offset: 0 }],
        regions: [],
        assignments: [{ role: ALL_SCREENS, sourceId: LEGACY_SOURCE, frame }],
        audioSourceId: kind === 'video' ? LEGACY_SOURCE : undefined,
        audioEnabled: false,
        loop: kind === 'video' && item.mediaLoop !== false,
      },
    ],
  };
}

export const activeVersionOf = (data: MediaItemData): MediaVersion =>
  data.versions.find((version) => version.id === data.versionId) ?? data.versions[0];

/** The assignment a window of `groupId` uses: its group's own, else the all-screens one. */
export function assignmentFor(version: MediaCue, groupId: number | undefined): MediaAssignment | undefined {
  const own = groupId !== undefined ? version.assignments.find((a) => a.role === screenRole(groupId)) : undefined;
  return own ?? version.assignments.find((a) => a.role === ALL_SCREENS);
}

/** Whether a version shows on a screen group (or, for `undefined`, on windows without one). */
export const showsOn = (version: MediaCue, groupId: number | undefined): boolean => {
  const assignment = assignmentFor(version, groupId);
  return !!assignment && assignment.sourceId !== null;
};

/** The screen groups a version names explicitly, and whether it shows everywhere. */
export function screensOf(version: MediaCue): { all: boolean; groupIds: number[] } {
  return {
    all: version.assignments.some((a) => a.role === ALL_SCREENS && a.sourceId !== null),
    groupIds: version.assignments
      .filter((a) => a.sourceId !== null)
      .map((a) => groupIdOfRole(a.role))
      .filter((id): id is number => id !== undefined),
  };
}

/** Turn a screen group on or off for a version; a new group copies the framing of the first one. */
export function toggleScreen(version: MediaVersion, role: string, on: boolean): MediaVersion {
  const existing = version.assignments.find((a) => a.role === role);
  if (!on) return { ...version, assignments: version.assignments.filter((a) => a.role !== role) };
  if (existing) return version;
  const template = version.assignments[0];
  const sourceId = template?.sourceId ?? version.sources[0]?.id ?? null;
  const frame = template ? structuredClone(template.frame) : defaultMediaFrame();
  const assignments = [...version.assignments, { role, sourceId, frame }];
  // Choosing screens explicitly replaces "all screens".
  return { ...version, assignments: role === ALL_SCREENS ? assignments : assignments.filter((a) => a.role !== ALL_SCREENS) };
}

/** Whether any version of the data plays a video. */
export const hasVideo = (version: MediaCue): boolean => version.sources.some((source) => source.type === 'video');

/** Whether a version runs on a clock (a video or a slideshow), so it can play, pause and end. */
export const hasClock = (version: MediaCue): boolean => hasVideo(version) || !!version.slideshow;

/** A copy of a version under a new name, with fresh ids so both can be edited apart. */
export function duplicateVersion(version: MediaVersion, name: string): MediaVersion {
  return { ...structuredClone(version), id: newId('m'), name };
}

/** The label of an entry: its own, else its file. */
export const mediaItemLabel = (item: ShowItem): string => {
  if (item.label) return item.label;
  const data = mediaItemDataOf(item);
  const path = data ? activeVersionOf(data).sources[0]?.path : item.mediaPath;
  return path ? fileLabel(path) : '';
};

/** The first file of an entry's played version. */
export const mediaItemPath = (item: ShowItem): string | undefined => {
  const data = mediaItemDataOf(item);
  return data ? activeVersionOf(data).sources[0]?.path : item.mediaPath;
};
