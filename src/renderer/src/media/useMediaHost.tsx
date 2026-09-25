/**
 * Plays the agenda's image, video and slideshow entries as the operator moves through the show,
 * following each agenda group's playback settings (`groupPlayback.ts`).
 *
 * - Going to a media entry starts it (a background replaces the background; content joins the
 *   content, as many at once as the group allows). In a group that plays "all together", going to
 *   one content entry starts all of them.
 * - Entering an agenda group starts its first background entry per screen group; the others wait
 *   until they are clicked. A group without backgrounds keeps whatever runs.
 * - Leaving an agenda group does what the group says with its content and its backgrounds.
 * - Going to a song or verse ends content on the screen groups that show its text.
 * - Go starts the group's next content entry (or all of them); an entry that ends starts the next
 *   one when the group auto-advances.
 * - Edits of a running entry (framing, screens, loop…) apply live.
 *
 * Hosted once, beside presentation sync. The sound of videos plays here, on the operator computer.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Show, ShowGroup, ShowItem } from '@/api/shows.api';
import { normaliseScreenGroupData, type ScreenGroupEntity } from '@/screens/types';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { setWindowMediaResolver } from '@/utils/presentationBridge';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import { CueSource } from './CueMedia';
import { fadeLength, groupBackgroundSettings, groupMediaSettings } from './groupPlayback';
import { knownDuration, probeDuration } from './mediaDuration';
import {
  ALL_SCREENS,
  activeVersionOf,
  groupIdOfRole,
  isVisualMediaItem,
  mediaItemDataOf,
  mediaItemLabel,
  slideshowDuration,
  type MediaVersion,
} from './mediaItem';
import {
  coverContent,
  endGroupPlaybacks,
  getPlaybacks,
  mediaForScreen,
  onPlaybackEnded,
  screenKeyOf,
  setFollowMasterByDefault,
  startPlayback,
  tickPlaybacks,
  updatePlayback,
  usePlaybacks,
  type PlaybackEntry,
  type ScreenKey,
} from './playback';
import { defaultFrame } from './types';
import { useGetSettings } from '@/store/settingsSlice';

/** The key a playing entry is known by. Entries saved without an id fall back to their position and file. */
export const playbackKeyOf = (item: ShowItem, index: number): string =>
  item.id ?? `item:${index}:${item.mediaPath ?? item.media?.versionId ?? ''}`;

/** Whether an entry runs on the screens right now — started from its card, it need not be the live entry. */
export const useEntryRunning = (item: ShowItem | undefined, index: number): boolean => {
  const playbacks = usePlaybacks();
  return !!item && playbacks.some((p) => p.endsAt === undefined && p.key === playbackKeyOf(item, index));
};

const agendaGroupOf = (item: ShowItem) => item.groupId ?? DEFAULT_GROUP_ID;
const showGroupOf = (show: Show | null | undefined, agendaGroupId: string): ShowGroup | undefined =>
  show?.groups?.find((group) => group.id === agendaGroupId);

/** Every screen key of the account: each enabled group, and windows without one. */
const allScreenKeys = (groups: ScreenGroupEntity[]): ScreenKey[] => [
  ...groups.filter((group) => group.enabled).map((group) => screenKeyOf(group.id)),
  screenKeyOf(undefined),
];

/** The screens a version shows on. */
export function screenKeysOf(version: MediaVersion, groups: ScreenGroupEntity[]): ScreenKey[] {
  const keys = new Set<ScreenKey>();
  for (const assignment of version.assignments) {
    if (assignment.sourceId === null) continue;
    if (assignment.role === ALL_SCREENS) allScreenKeys(groups).forEach((key) => keys.add(key));
    const id = groupIdOfRole(assignment.role);
    if (id !== undefined && groups.some((group) => group.id === id && group.enabled)) keys.add(screenKeyOf(id));
  }
  return [...keys];
}

/** The version with URLs for its files and a known length. */
function playableVersion(version: MediaVersion): MediaVersion {
  const sources = version.sources.map((source) => ({ ...source, path: resolveMediaUrl(source.path) || source.path }));
  if (version.slideshow) return { ...version, sources, duration: slideshowDuration(version) };
  const video = sources.find((source) => source.type === 'video');
  const duration = version.duration > 0 ? version.duration : video ? (knownDuration(video.path) ?? 0) : 0;
  return { ...version, sources, duration };
}

export function playbackEntryFor(
  item: ShowItem,
  index: number,
  groups: ScreenGroupEntity[],
  show?: Show | null,
): PlaybackEntry | undefined {
  const data = mediaItemDataOf(item);
  if (!data) return undefined;
  const version = activeVersionOf(data);
  if (!version) return undefined;
  return {
    key: playbackKeyOf(item, index),
    label: mediaItemLabel(item),
    role: data.role,
    agendaGroupId: agendaGroupOf(item),
    agendaIndex: index,
    stackBy: groupMediaSettings(showGroupOf(show, agendaGroupOf(item))).topLayer,
    cue: playableVersion(version),
    screens: screenKeysOf(version, groups),
  };
}

/** Screen groups that show the text of a song or verse, and windows without a group. */
function textScreens(groups: ScreenGroupEntity[], type: ShowItem['type']): ScreenKey[] {
  const keys = groups
    .filter((group) => group.enabled)
    .filter((group) => {
      const layers = normaliseScreenGroupData(group.data).layers;
      return type === 'bible_verse' ? layers.bibleVerses : layers.slides;
    })
    .map((group) => screenKeyOf(group.id));
  return [...keys, screenKeyOf(undefined)];
}

/**
 * Start one entry, with its agenda group's settings. `fadeMs` is the operator's fade; a group
 * whose backgrounds cut replaces them without one.
 */
export async function startItem(show: Show, index: number, groups: ScreenGroupEntity[], fadeMs: number) {
  const item = show.order[index];
  if (!isVisualMediaItem(item)) return;
  const data = mediaItemDataOf(item);
  const version = data && activeVersionOf(data);
  const video = version?.sources.find((source) => source.type === 'video');
  const url = video ? resolveMediaUrl(video.path) : undefined;
  // A video's length is read before it starts: loops, pauses and its end are measured against it.
  if (version && !version.slideshow && version.duration <= 0 && url) await probeDuration(url);
  const entry = playbackEntryFor(item, index, groups, show);
  if (!entry || !data) return;
  const group = showGroupOf(show, entry.agendaGroupId);
  const backgroundFade = groupBackgroundSettings(group).transition === 'cut' ? 0 : fadeLength(fadeMs);
  startPlayback(entry, {
    autoplay: item.mediaAutoplay !== false,
    fadeMs: entry.role === 'background' ? backgroundFade : fadeMs,
    maxAtOnce: groupMediaSettings(group).maxAtOnce,
  });
}

/** The content entries of an agenda group, in agenda order. */
export const groupContentIndexes = (show: Show, agendaGroupId: string): number[] =>
  show.order
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => agendaGroupOf(item) === agendaGroupId && mediaItemDataOf(item)?.role === 'content')
    .map(({ index }) => index);

/** The background entries of an agenda group, in agenda order. */
export const groupBackgroundIndexes = (show: Show, agendaGroupId: string): number[] =>
  show.order
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => agendaGroupOf(item) === agendaGroupId && mediaItemDataOf(item)?.role === 'background')
    .map(({ index }) => index);

/**
 * Go: the next content entry of the agenda group — after the one started last, else the first —
 * or, for a group that plays all together, every one not running yet. Returns whether anything started.
 */
/**
 * Which agenda entries Go would put on screen next — none when there is nothing left.
 *
 * Split out so the button can *say* what it will start. An operator pressing a button called
 * "Go" during a service should not have to remember the group's stacking rules to know what
 * lands on the beamer, and a label worked out separately from the action would eventually lie.
 */
export function nextMediaIndexes(show: Show, agendaGroupId: string): number[] {
  const indexes = groupContentIndexes(show, agendaGroupId);
  if (!indexes.length) return [];
  const running = getPlaybacks().filter((p) => p.endsAt === undefined && p.role === 'content' && p.agendaGroupId === agendaGroupId);
  const runningKeys = new Set(running.map((p) => p.key));
  if (groupMediaSettings(showGroupOf(show, agendaGroupId)).mode === 'together') {
    return indexes.filter((index) => !runningKeys.has(playbackKeyOf(show.order[index], index)));
  }
  const last = [...running].sort((a, b) => b.order - a.order)[0];
  const lastIndex = last ? indexes.find((index) => playbackKeyOf(show.order[index], index) === last.key) : undefined;
  const next = lastIndex === undefined ? indexes[0] : indexes.find((index) => index > lastIndex);
  return next === undefined ? [] : [next];
}

export async function goMedia(show: Show, agendaGroupId: string, groups: ScreenGroupEntity[], fadeMs: number): Promise<boolean> {
  const next = nextMediaIndexes(show, agendaGroupId);
  for (const index of next) await startItem(show, index, groups, fadeMs);
  return next.length > 0;
}

/** Switch to the n-th background entry (1-based) of an agenda group. */
export async function switchBackground(show: Show, agendaGroupId: string, n: number, groups: ScreenGroupEntity[], fadeMs: number) {
  const index = groupBackgroundIndexes(show, agendaGroupId)[n - 1];
  if (index === undefined) return false;
  await startItem(show, index, groups, fadeMs);
  return true;
}

/** The first background entry per screen group of an agenda group, in agenda order. */
async function startGroupBackgrounds(show: Show, agendaGroupId: string, groups: ScreenGroupEntity[], fadeMs: number, skipIndex: number) {
  const claimed = new Set<ScreenKey>();
  const running = getPlaybacks().filter((p) => p.role === 'background' && p.endsAt === undefined && p.agendaGroupId === agendaGroupId);
  running.forEach((p) => p.screens.filter((s) => !p.covered.includes(s)).forEach((s) => claimed.add(s)));
  for (const index of groupBackgroundIndexes(show, agendaGroupId)) {
    if (index === skipIndex) continue;
    const version = activeVersionOf(mediaItemDataOf(show.order[index])!);
    const screens = screenKeysOf(version, groups).filter((key) => !claimed.has(key));
    if (!screens.length) continue;
    screens.forEach((key) => claimed.add(key));
    await startItem(show, index, groups, fadeMs);
  }
}

/** What a group does with its media when the operator leaves it. */
function leaveGroup(show: Show, agendaGroupId: string, fadeMs: number) {
  const group = showGroupOf(show, agendaGroupId);
  const media = groupMediaSettings(group).onLeave;
  if (media !== 'keep') endGroupPlaybacks(agendaGroupId, 'content', media === 'fade' ? fadeLength(fadeMs) : 0);
  const backgrounds = groupBackgroundSettings(group).onLeave;
  if (backgrounds !== 'keep') endGroupPlaybacks(agendaGroupId, 'background', backgrounds === 'fade' ? fadeLength(fadeMs) : 0);
}

export function useMediaHost({
  show,
  activeItemIndex,
  groups,
  backgroundVisible,
  contentVisible = true,
  fadeMs,
}: {
  show: Show | null;
  activeItemIndex: number;
  groups: ScreenGroupEntity[];
  backgroundVisible: boolean;
  /** The media layer as a whole (Hide in the layer bar). */
  contentVisible?: boolean;
  fadeMs: number;
}) {
  const playbacks = usePlaybacks();
  const { videosFollowMasterSpeed } = useGetSettings('videosFollowMasterSpeed');
  useEffect(() => setFollowMasterByDefault(videosFollowMasterSpeed !== false), [videosFollowMasterSpeed]);
  const latest = useRef({ show, groups, fadeMs });
  latest.current = { show, groups, fadeMs };

  useEffect(() => {
    const timer = setInterval(tickPlaybacks, 30);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setWindowMediaResolver((groupId) => {
      const media = mediaForScreen(getPlaybacks(), groupId, { backgroundVisible, contentVisible });
      return media.background || media.contents.length ? media : undefined;
    });
    return () => setWindowMediaResolver(undefined);
  }, [backgroundVisible, contentVisible]);

  // Auto-advance: an entry that ends starts the next one of its group, when the group says so.
  useEffect(
    () =>
      onPlaybackEnded((ended) => {
        const { show: current, groups: screenGroups, fadeMs: fade } = latest.current;
        if (!current || ended.role !== 'content') return;
        const settings = groupMediaSettings(showGroupOf(current, ended.agendaGroupId));
        if (settings.mode !== 'sequence' || !settings.autoAdvance) return;
        const indexes = groupContentIndexes(current, ended.agendaGroupId);
        const at = indexes.find((index) => playbackKeyOf(current.order[index], index) === ended.key);
        const next = at === undefined ? undefined : indexes.find((index) => index > at);
        if (next !== undefined) void startItem(current, next, screenGroups, fade);
      }),
    [],
  );

  // Read video lengths ahead, so starting an entry does not wait for it.
  useEffect(() => {
    for (const item of show?.order ?? []) {
      const data = mediaItemDataOf(item);
      for (const version of data?.versions ?? []) {
        if (version.slideshow) continue;
        for (const source of version.sources) {
          const url = source.type === 'video' && version.duration <= 0 ? resolveMediaUrl(source.path) : undefined;
          if (url) void probeDuration(url);
        }
      }
    }
  }, [show?.order]);

  // Navigation.
  const showKey = show?.title ?? '';
  const previous = useRef<{ showKey: string; index: number; agendaGroupId: string } | undefined>(undefined);
  useEffect(() => {
    const { show: current, groups: screenGroups, fadeMs: fade } = latest.current;
    const item = current?.order?.[activeItemIndex];
    if (!current || !item) return;
    const agendaGroupId = agendaGroupOf(item);
    const before = previous.current;
    previous.current = { showKey, index: activeItemIndex, agendaGroupId };
    if (before && before.showKey === showKey && before.index === activeItemIndex) return;
    const enteredGroup = !before || before.showKey !== showKey || before.agendaGroupId !== agendaGroupId;

    void (async () => {
      if (before && enteredGroup) {
        if (before.showKey === showKey) leaveGroup(current, before.agendaGroupId, fade);
        else endGroupPlaybacks(before.agendaGroupId, 'content', fade);
      }
      const data = mediaItemDataOf(item);
      if (data) {
        // Starting the clicked background first keeps the group from starting another one there.
        if (data.role === 'content' && groupMediaSettings(showGroupOf(current, agendaGroupId)).mode === 'together') {
          await startItem(current, activeItemIndex, screenGroups, fade);
          await goMedia(current, agendaGroupId, screenGroups, fade);
        } else {
          await startItem(current, activeItemIndex, screenGroups, fade);
        }
        if (enteredGroup) await startGroupBackgrounds(current, agendaGroupId, screenGroups, fade, activeItemIndex);
        return;
      }
      if (enteredGroup) await startGroupBackgrounds(current, agendaGroupId, screenGroups, fade, -1);
      if (item.type === 'song' || item.type === 'bible_verse') coverContent(textScreens(screenGroups, item.type), fade);
    })();
    // Only navigation starts or ends entries; edits are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKey, activeItemIndex]);

  // Edits of running entries.
  useEffect(() => {
    if (!show) return;
    for (const playback of getPlaybacks()) {
      if (playback.endsAt !== undefined) continue;
      const index = show.order.findIndex((item, i) => isVisualMediaItem(item) && playbackKeyOf(item, i) === playback.key);
      if (index < 0) continue;
      const entry = playbackEntryFor(show.order[index], index, groups, show);
      if (!entry) continue;
      const changed =
        JSON.stringify([entry.cue, entry.screens, entry.role, entry.label, entry.agendaGroupId, entry.agendaIndex, entry.stackBy]) !==
        JSON.stringify([
          playback.cue,
          playback.screens,
          playback.role,
          playback.label,
          playback.agendaGroupId,
          playback.agendaIndex,
          playback.stackBy,
        ]);
      if (changed) updatePlayback(entry);
    }
  }, [show, groups]);

  return playbacks;
}

/** The sound of playing videos, on this computer. */
export function MediaAudio() {
  const playbacks = usePlaybacks();
  const audible = useMemo(
    () => playbacks.filter((p) => p.cue.audioEnabled && p.cue.audioSourceId && p.cue.sources.some((s) => s.id === p.cue.audioSourceId)),
    [playbacks],
  );
  if (!audible.length) return null;
  return (
    <div
      data-testid="media-audio"
      style={{ position: 'fixed', width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}
    >
      {audible.map((p) => {
        const source = p.cue.sources.find((s) => s.id === p.cue.audioSourceId)!;
        return (
          <CueSource
            key={`${p.transport.session}/${source.id}/${source.path}`}
            source={source}
            packet={{ cue: p.cue, transport: p.transport, at: p.at }}
            frame={defaultFrame()}
            audible
            audioOnly
            volume={p.cue.volume ?? 1}
            fadeEndsAt={p.endsAt}
            fadeMs={p.fadeMs}
          />
        );
      })}
    </div>
  );
}
