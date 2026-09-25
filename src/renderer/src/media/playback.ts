/**
 * Media playing on the screens: every image and video entry that was started, each with its own
 * clock, on its own screen groups.
 *
 * Rules (see `groupPlayback.ts` for the settings behind them):
 * - One background per screen group is visible; the last one started covers older ones there.
 * - Content: as many per screen group as its agenda group allows at once; starting one more
 *   covers the oldest there. Several are stacked by start or by agenda order.
 * - An entry covered on all of its screens ends.
 * - A background keeps running until another background covers it or it is ended.
 * - Content ends where text takes over (see `coverContent`) and when its agenda group is left.
 * - Ending fades out, then the entry is gone.
 *
 * Players live outside React, like the audio players, so they outlast the operator's navigation.
 * The windows receive packets (cue + transport + the time it was taken) and run the clock
 * themselves; see `mediaForScreen`.
 *
 * Speed: one **master speed** for the whole show, and per entry either following it (the default
 * — see the `videosFollowMasterSpeed` setting) or its own. Changing the master re-times every
 * follower at once; choosing an own speed for an entry detaches it from the master.
 */
import { useSyncExternalStore } from 'react';
import { MAX_RATE, MIN_RATE, advanceCue, clamp, commandCue, initialTransport } from './engine';
import { assignmentFor, hasClock, hasVideo, type MediaRole, type MediaVersion } from './mediaItem';
import type { CueCommand, CuePacket, CueTransport } from './types';

/** Screen key of a window: its screen group id, or `none` for a window without one. */
export type ScreenKey = string;
export const screenKeyOf = (groupId: number | undefined): ScreenKey => (groupId === undefined ? 'none' : String(groupId));

export interface PlaybackEntry {
  /** The agenda entry's id (or a stand-in for entries without one). */
  key: string;
  label: string;
  role: MediaRole;
  /** The agenda group the entry sits in. */
  agendaGroupId: string;
  /** The version played, with file paths already resolved to URLs. */
  cue: MediaVersion;
  /** The screens it shows on right now. */
  screens: ScreenKey[];
  /** Its position in the agenda, for stacking by agenda order. */
  agendaIndex: number;
  /** How several visible content entries of its agenda group are stacked. */
  stackBy?: 'lastStarted' | 'agendaOrder';
}

export interface Playback extends PlaybackEntry {
  transport: CueTransport;
  /** When `transport` was taken (Date.now()). */
  at: number;
  /** Stacking order: higher is on top. */
  order: number;
  /** Cleared by the operator: kept running, not shown. */
  hidden: boolean;
  /** Screens where a newer entry or the text took over. */
  covered: ScreenKey[];
  /** Set while fading out: when it is removed (Date.now()). */
  endsAt?: number;
  fadeMs: number;
  /** Plays at the master speed (videos only); false once an own speed was chosen for it. */
  followsMaster: boolean;
}

const playbacks = new Map<string, Playback>();
let orderCounter = 0;
let snapshot: Playback[] = [];
let lastTick = performance.now();
const listeners = new Set<() => void>();
/** Running-time readouts: told about four times a second while something plays (see `usePlaybackClock`). */
const clockListeners = new Set<() => void>();
let clock = 0;
/** The show-wide speed followers play at; runtime only, so a new service starts at 1×. */
let masterRate = 1;
/** Whether a newly started video follows the master (the `videosFollowMasterSpeed` setting). */
let followMasterByDefault = true;
const endedListeners = new Set<(playback: Playback) => void>();
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

const publish = () => {
  snapshot = Array.from(playbacks.values()).sort((a, b) => a.order - b.order);
  listeners.forEach((fn) => fn());
};
/**
 * Tell subscribers something outside the playback list changed (the master speed) while keeping
 * the list itself: `usePlaybacks` readers get the same array and skip rendering, `useMasterRate`
 * readers update. Publishing a fresh list for it re-rendered the whole operator view.
 */
const notify = () => listeners.forEach((fn) => fn());

export const subscribePlaybacks = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getPlaybacks = () => snapshot;

/** Called when an entry reaches its end by itself (not looping, not held at a pause). */
export const onPlaybackEnded = (fn: (playback: Playback) => void) => {
  endedListeners.add(fn);
  return () => {
    endedListeners.delete(fn);
  };
};
export const getMasterRate = () => masterRate;
/** The master speed, re-rendering on change. */
export const useMasterRate = () => useSyncExternalStore(subscribePlaybacks, getMasterRate, getMasterRate);
/** Kept in step with the setting by the media host. */
export const setFollowMasterByDefault = (follow: boolean) => {
  followMasterByDefault = follow;
};

/** Give a playback a speed without touching anything else about it — re-anchored at now. */
const retime = (playback: Playback, rate: number) => {
  playback.transport = commandCue(playback.cue, playback.transport, { type: 'rate', rate });
  playback.at = Date.now();
};

/**
 * Set the master speed: every video following it is re-timed in one step (one publish, so every
 * window gets all of them in the same round and they stay together).
 */
export function setMasterRate(rate: number): void {
  if (!Number.isFinite(rate)) return;
  const next = Math.round(clamp(rate, MIN_RATE, MAX_RATE) * 100) / 100;
  if (next === masterRate) return;
  tickPlaybacks();
  masterRate = next;
  let retimed = false;
  for (const playback of playbacks.values()) {
    if (!playback.followsMaster || !hasVideo(playback.cue)) continue;
    retime(playback, masterRate);
    retimed = true;
  }
  if (retimed) publish();
  else notify();
}

/** Attach an entry to the master speed (it takes the master's speed now) or detach it (keeps its speed). */
export function setPlaybackFollowsMaster(key: string, follows: boolean): void {
  const playback = playbacks.get(key);
  if (!playback || playback.followsMaster === follows) return;
  tickPlaybacks();
  playback.followsMaster = follows;
  if (follows && hasVideo(playback.cue)) retime(playback, masterRate);
  publish();
}

/**
 * Every started entry, bottom to top. Refreshes when an entry starts, ends or changes state — not
 * as its time runs: that re-rendered the whole layer bar, preview and monitors four times a second
 * while a video played. Readouts of the running time add `usePlaybackClock`.
 */
export const usePlaybacks = () => useSyncExternalStore(subscribePlaybacks, getPlaybacks, getPlaybacks);

export const subscribePlaybackClock = (fn: () => void) => {
  clockListeners.add(fn);
  return () => {
    clockListeners.delete(fn);
  };
};
const subscribeNothing = () => () => {};
/**
 * Re-renders about four times a second while anything plays, for readouts of the running time
 * (entries are advanced in place, so read their transport after this). `enabled` false subscribes
 * to nothing, for a component that only sometimes shows a time.
 */
export const usePlaybackClock = (enabled = true) =>
  useSyncExternalStore(enabled ? subscribePlaybackClock : subscribeNothing, () => (enabled ? clock : 0));

const session = (key: string) => `${key}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Advance every clock to now. */
export function tickPlaybacks(): void {
  const now = performance.now();
  const seconds = Math.max(0, (now - lastTick) / 1000);
  lastTick = now;
  let anyPlaying = false;
  const ended: Playback[] = [];
  let changed = false;
  for (const playback of playbacks.values()) {
    if (!playback.transport.playing) continue;
    anyPlaying = true;
    const before = playback.transport;
    playback.transport = advanceCue(playback.cue, playback.transport, seconds);
    playback.at = Date.now();
    const t = playback.transport;
    // Reaching a hold or moving between loops is a state change for the transport buttons.
    if (
      t.playing !== before.playing ||
      t.pausedAt !== before.pausedAt ||
      t.activeLoop !== before.activeLoop ||
      t.nextLoop !== before.nextLoop ||
      t.exitLoop !== before.exitLoop
    )
      changed = true;
    if (!t.playing && !t.pausedAt && playback.cue.duration > 0 && t.time >= playback.cue.duration - 1e-6 && playback.endsAt === undefined) {
      ended.push(playback);
    }
  }
  if (ended.length || changed) publish();
  if (anyPlaying && Date.now() - clock >= 250) {
    clock = Date.now();
    clockListeners.forEach((fn) => fn());
  }
  for (const playback of ended) endedListeners.forEach((fn) => fn(playback));
}

const isOver = (playback: Playback) => playback.screens.length > 0 && playback.screens.every((s) => playback.covered.includes(s));

function scheduleRemoval(playback: Playback, fadeMs: number) {
  playback.endsAt = Date.now() + Math.max(0, fadeMs);
  playback.fadeMs = Math.max(0, fadeMs);
  clearTimeout(removalTimers.get(playback.key));
  removalTimers.set(
    playback.key,
    setTimeout(() => {
      removalTimers.delete(playback.key);
      const current = playbacks.get(playback.key);
      if (current && current.endsAt !== undefined) {
        playbacks.delete(playback.key);
        publish();
      }
    }, fadeMs + 50),
  );
}

/**
 * Make room on `screens` for an entry of `role`: of the other visible entries there, only
 * `keep` stay (the newest); older ones are covered. Entries covered everywhere end.
 * `keep` 0 covers them all, `Infinity` none.
 */
function cover(role: MediaRole, screens: ScreenKey[], exceptKey: string | undefined, fadeMs: number, keep = 0) {
  const touched = new Set<Playback>();
  for (const screen of screens) {
    const visible = Array.from(playbacks.values())
      .filter(
        (p) =>
          p.key !== exceptKey && p.role === role && p.endsAt === undefined && p.screens.includes(screen) && !p.covered.includes(screen),
      )
      .sort((a, b) => b.order - a.order);
    for (const other of visible.slice(keep)) {
      other.covered = [...other.covered, screen];
      touched.add(other);
    }
  }
  for (const other of touched) if (isOver(other)) scheduleRemoval(other, fadeMs);
}

/**
 * Start an entry, or bring it back on top when it already runs. `autoplay` starts a video's clock
 * from the beginning; an entry that is already running keeps its position.
 */
export function startPlayback(entry: PlaybackEntry, options: { autoplay: boolean; fadeMs: number; maxAtOnce?: number }): void {
  tickPlaybacks();
  const existing = playbacks.get(entry.key);
  const video = hasClock(entry.cue);
  if (existing && existing.cue.id === entry.cue.id) {
    clearTimeout(removalTimers.get(entry.key));
    Object.assign(existing, entry, { covered: [], hidden: false, endsAt: undefined, order: ++orderCounter, fadeMs: options.fadeMs });
    existing.cue = entry.cue;
    const ended = !existing.transport.playing && existing.transport.time >= entry.cue.duration && entry.cue.duration > 0;
    if (options.autoplay && video && (ended || (!existing.transport.playing && existing.transport.time === 0))) {
      existing.transport = commandCue(entry.cue, existing.transport, { type: 'play' });
      existing.at = Date.now();
    }
  } else {
    let transport = initialTransport(session(entry.key));
    const followsMaster = followMasterByDefault;
    // A follower starts at the master speed, so it joins the others rather than catching up.
    if (followsMaster && hasVideo(entry.cue) && masterRate !== 1)
      transport = commandCue(entry.cue, transport, { type: 'rate', rate: masterRate });
    if (options.autoplay && video) transport = commandCue(entry.cue, transport, { type: 'play' });
    playbacks.set(entry.key, {
      ...entry,
      transport,
      at: Date.now(),
      order: ++orderCounter,
      hidden: false,
      covered: [],
      fadeMs: options.fadeMs,
      followsMaster,
    });
  }
  // A background always replaces; content keeps as many others as its group allows at once.
  const max = entry.role === 'background' ? 1 : (options.maxAtOnce ?? 1);
  cover(entry.role, entry.screens, entry.key, options.fadeMs, max === 0 ? Infinity : max - 1);
  publish();
}

/**
 * Apply an edit of a running entry (framing, screens, loop, sound…) without restarting it. A
 * changed file list or timeline pauses it where it is, so nothing jumps on screen mid-edit.
 */
export function updatePlayback(entry: PlaybackEntry): void {
  const playback = playbacks.get(entry.key);
  if (!playback) return;
  tickPlaybacks();
  const structural =
    playback.cue.id !== entry.cue.id ||
    JSON.stringify([playback.cue.sources, playback.cue.regions, playback.cue.duration]) !==
      JSON.stringify([entry.cue.sources, entry.cue.regions, entry.cue.duration]);
  if (structural) {
    playback.transport = {
      ...commandCue(entry.cue, playback.transport, { type: 'pause' }),
      time: Math.min(playback.transport.time, entry.cue.duration || playback.transport.time),
      activeLoop: undefined,
      nextLoop: undefined,
      exitLoop: false,
      bypass: [],
    };
    // A new file needs a new session, or the windows keep the old element.
    if (JSON.stringify(playback.cue.sources) !== JSON.stringify(entry.cue.sources)) {
      playback.transport = { ...playback.transport, session: session(entry.key) };
    }
    playback.at = Date.now();
  }
  Object.assign(playback, {
    label: entry.label,
    role: entry.role,
    cue: entry.cue,
    screens: entry.screens,
    agendaGroupId: entry.agendaGroupId,
    agendaIndex: entry.agendaIndex,
    stackBy: entry.stackBy,
  });
  playback.covered = playback.covered.filter((screen) => entry.screens.includes(screen));
  publish();
}

export function commandPlayback(key: string, command: CueCommand): boolean {
  const playback = playbacks.get(key);
  if (!playback) return false;
  tickPlaybacks();
  // An own speed for this entry: it stops following the master.
  if (command.type === 'rate') playback.followsMaster = false;
  playback.transport = commandCue(playback.cue, playback.transport, command);
  playback.at = Date.now();
  publish();
  return true;
}

export function setPlaybackHidden(key: string, hidden: boolean): void {
  const playback = playbacks.get(key);
  if (!playback || playback.hidden === hidden) return;
  playback.hidden = hidden;
  publish();
}

/** Fade an entry out and remove it. */
export function endPlayback(key: string, fadeMs: number): void {
  const playback = playbacks.get(key);
  if (!playback || playback.endsAt !== undefined) return;
  tickPlaybacks();
  scheduleRemoval(playback, fadeMs);
  publish();
}

/** End every entry of an agenda group and role (the group was left). */
export function endGroupPlaybacks(agendaGroupId: string, role: MediaRole, fadeMs: number): void {
  for (const playback of Array.from(playbacks.values())) {
    if (playback.role === role && playback.agendaGroupId === agendaGroupId) endPlayback(playback.key, fadeMs);
  }
}

export function endAllPlaybacks(fadeMs: number, role?: MediaRole): void {
  for (const playback of Array.from(playbacks.values())) if (!role || playback.role === role) endPlayback(playback.key, fadeMs);
}

/** Text takes over these screens: content there is covered, and ends where nothing is left. */
export function coverContent(screens: ScreenKey[], fadeMs: number): void {
  if (!screens.length) return;
  const before = snapshot;
  cover('content', screens, undefined, fadeMs);
  if (before === snapshot) publish();
}

/** Remove everything at once (show closed, tests). */
export function resetPlaybacks(): void {
  for (const timer of removalTimers.values()) clearTimeout(timer);
  removalTimers.clear();
  playbacks.clear();
  publish();
}

export const packetOf = (playback: Playback, groupId: number | undefined, visible: boolean): CuePacket => ({
  cue: playback.cue,
  transport: playback.transport,
  at: playback.at,
  assignment: assignmentFor(playback.cue, groupId),
  visible,
  fadeMs: playback.fadeMs,
});

export interface ScreenMedia {
  background?: CuePacket;
  /** Content entries, bottom to top. */
  contents: CuePacket[];
}

/**
 * What one window shows: the top background that shows on its screen group and is not covered
 * there, and every uncovered content entry, stacked. An entry fading out is still delivered —
 * invisible — so the window can fade it instead of cutting.
 */
export function mediaForScreen(
  list: Playback[],
  groupId: number | undefined,
  options: { backgroundVisible: boolean; contentVisible?: boolean },
): ScreenMedia {
  const key = screenKeyOf(groupId);
  const shownHere = (p: Playback) => p.screens.includes(key) && !p.covered.includes(key) && !!assignmentFor(p.cue, groupId)?.sourceId;
  const visible = (p: Playback) =>
    p.endsAt === undefined && !p.hidden && (p.role === 'background' ? options.backgroundVisible : options.contentVisible !== false);

  const backgrounds = list.filter((p) => p.role === 'background' && shownHere(p)).sort((a, b) => b.order - a.order);
  const background = backgrounds.find((p) => p.endsAt === undefined) ?? backgrounds[0];

  const contents = list
    .filter((p) => p.role === 'content' && shownHere(p))
    .sort((a, b) => (a.stackBy === 'agendaOrder' && b.stackBy === 'agendaOrder' ? a.agendaIndex - b.agendaIndex : a.order - b.order));

  return {
    background: background ? packetOf(background, groupId, visible(background)) : undefined,
    contents: contents.map((p) => packetOf(p, groupId, visible(p))),
  };
}
