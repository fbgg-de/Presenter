/**
 * Audio items, heard on the operator computer only (the default output device).
 *
 * Players live here, outside React, so a pad keeps playing while the operator moves through songs,
 * opens an editor or switches shows — until it is paused, stopped or faded out. The agenda card of
 * an audio item *loads* its player; the layer bar lists every player that is playing or paused
 * part-way, so it can be stopped from anywhere.
 *
 * Fades are computed from the elapsed time, not counted in ticks: a throttled timer in a window in
 * the background still ends the fade on time.
 */
import { useSyncExternalStore } from 'react';

export type AudioStatus = 'loading' | 'ready' | 'error' | 'blocked';

export interface AudioTrackState {
  key: string;
  label: string;
  url: string;
  status: AudioStatus;
  playing: boolean;
  currentTime: number;
  duration: number;
  /** The volume the track plays at (0–1); during a fade the element is quieter. */
  volume: number;
  loop: boolean;
  /** 0–1 progress of a running fade out, else undefined. */
  fade?: number;
}

interface Track {
  state: AudioTrackState;
  el: HTMLAudioElement;
  fadeTimer?: ReturnType<typeof setInterval>;
}

const FADE_TICK_MS = 40;

const tracks = new Map<string, Track>();
/** Keys whose agenda card is open: such a track stays loaded even when stopped. */
const holders = new Map<string, number>();
let focusedKey: string | undefined;
let snapshot: AudioTrackState[] = [];
const listeners = new Set<() => void>();
/** Hide in the layer bar's Audio row: every player silent, still running. */
let muted = false;
const mutedListeners = new Set<() => void>();

const publish = () => {
  snapshot = Array.from(tracks.values(), (track) => track.state);
  listeners.forEach((fn) => fn());
};

const update = (track: Track, patch: Partial<AudioTrackState>) => {
  track.state = { ...track.state, ...patch };
  publish();
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSnapshot = () => snapshot;

/** Silence every player (and those loaded later) without stopping them. */
export function setAudioMuted(value: boolean): void {
  if (muted === value) return;
  muted = value;
  tracks.forEach((track) => {
    track.el.muted = value;
  });
  mutedListeners.forEach((fn) => fn());
}

const subscribeMuted = (fn: () => void) => {
  mutedListeners.add(fn);
  return () => {
    mutedListeners.delete(fn);
  };
};
export const useAudioMuted = () =>
  useSyncExternalStore(
    subscribeMuted,
    () => muted,
    () => muted,
  );

/** Every loaded player. */
export const useAudioTracks = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** One player's state, or undefined when it is not loaded. */
export const useAudioTrack = (key: string | undefined) =>
  useSyncExternalStore(
    subscribe,
    () => (key ? tracks.get(key)?.state : undefined),
    () => (key ? tracks.get(key)?.state : undefined),
  );

/** The players the layer bar lists: playing, fading, or paused part-way. */
export const activeAudioTracks = (states: AudioTrackState[]) => states.filter((s) => s.playing || s.currentTime > 0);

/** The key an agenda entry's player is stored under. */
export const audioKeyOf = (item: { id?: string; mediaPath?: string }) => item.id ?? `path:${item.mediaPath ?? ''}`;

const cancelFade = (track: Track) => {
  if (track.fadeTimer === undefined) return;
  clearInterval(track.fadeTimer);
  track.fadeTimer = undefined;
  track.el.volume = track.state.volume;
};

/** Drop a stopped player nobody holds. */
const releaseIfIdle = (key: string) => {
  const track = tracks.get(key);
  if (!track || holders.has(key) || track.state.playing || track.state.currentTime > 0) return;
  cancelFade(track);
  track.el.pause();
  track.el.removeAttribute('src');
  track.el.load?.();
  tracks.delete(key);
  publish();
};

const createTrack = (key: string, label: string, url: string, volume: number, loop: boolean): Track => {
  const el = new Audio();
  el.preload = 'metadata';
  el.muted = muted;
  el.volume = volume;
  el.loop = loop;
  const track: Track = {
    el,
    state: { key, label, url, status: 'loading', playing: false, currentTime: 0, duration: 0, volume, loop },
  };
  el.addEventListener('loadedmetadata', () => update(track, { duration: Number.isFinite(el.duration) ? el.duration : 0 }));
  el.addEventListener('canplay', () => track.state.status !== 'ready' && update(track, { status: 'ready' }));
  el.addEventListener('error', () => update(track, { status: 'error', playing: false }));
  el.addEventListener('play', () => update(track, { playing: true }));
  el.addEventListener('pause', () => update(track, { playing: false }));
  el.addEventListener('timeupdate', () => update(track, { currentTime: el.currentTime }));
  el.addEventListener('ended', () => {
    cancelFade(track);
    el.currentTime = 0;
    update(track, { playing: false, currentTime: 0, fade: undefined });
    releaseIfIdle(key);
  });
  el.src = url;
  return track;
};

export interface AudioSource {
  key: string;
  label: string;
  url: string;
  volume?: number;
  loop?: boolean;
}

/** Load (or refresh) a player without starting it. A changed file replaces a stopped player only. */
export function loadAudio({ key, label, url, volume = 1, loop = false }: AudioSource): void {
  const track = tracks.get(key);
  if (!track) {
    tracks.set(key, createTrack(key, label, url, volume, loop));
    publish();
    return;
  }
  if (track.state.url !== url) {
    if (track.state.playing) return;
    cancelFade(track);
    track.el.pause();
    tracks.set(key, createTrack(key, label, url, volume, loop));
    publish();
    return;
  }
  if (track.state.label !== label) update(track, { label });
  if (track.state.loop !== loop) setAudioLoop(key, loop);
  if (track.state.volume !== volume) setAudioVolume(key, volume);
}

/**
 * An agenda card holds its player while it is open, and focuses it: Space then plays and pauses
 * that player. Returns the release.
 */
export function holdAudio(source: AudioSource): () => void {
  loadAudio(source);
  holders.set(source.key, (holders.get(source.key) ?? 0) + 1);
  focusedKey = source.key;
  return () => {
    const count = (holders.get(source.key) ?? 1) - 1;
    if (count > 0) holders.set(source.key, count);
    else holders.delete(source.key);
    if (focusedKey === source.key && count <= 0) focusedKey = undefined;
    releaseIfIdle(source.key);
  };
}

export function playAudio(key: string): void {
  const track = tracks.get(key);
  if (!track) return;
  cancelFade(track);
  update(track, { fade: undefined, status: track.state.status === 'blocked' ? 'ready' : track.state.status });
  void track.el.play()?.catch?.(() => update(track, { status: 'blocked', playing: false }));
}

export function pauseAudio(key: string): void {
  const track = tracks.get(key);
  if (!track) return;
  cancelFade(track);
  track.el.pause();
  update(track, { playing: false, fade: undefined });
}

export function toggleAudio(key: string): void {
  const track = tracks.get(key);
  if (!track) return;
  if (track.state.playing && track.state.fade === undefined) pauseAudio(key);
  else playAudio(key);
}

export function stopAudio(key: string): void {
  const track = tracks.get(key);
  if (!track) return;
  cancelFade(track);
  track.el.pause();
  track.el.currentTime = 0;
  update(track, { playing: false, currentTime: 0, fade: undefined });
  releaseIfIdle(key);
}

export function seekAudio(key: string, time: number): void {
  const track = tracks.get(key);
  if (!track) return;
  track.el.currentTime = Math.max(0, time);
  update(track, { currentTime: track.el.currentTime });
}

export function setAudioVolume(key: string, volume: number): void {
  const track = tracks.get(key);
  if (!track) return;
  const value = Math.min(1, Math.max(0, volume));
  if (track.fadeTimer === undefined) track.el.volume = value;
  update(track, { volume: value });
}

export function setAudioLoop(key: string, loop: boolean): void {
  const track = tracks.get(key);
  if (!track) return;
  track.el.loop = loop;
  update(track, { loop });
}

/** Lower the volume to silence over `seconds`, then stop. A track that is not playing just stops. */
export function fadeOutAudio(key: string, seconds: number): void {
  const track = tracks.get(key);
  if (!track) return;
  if (!track.state.playing || seconds <= 0) {
    stopAudio(key);
    return;
  }
  if (track.fadeTimer !== undefined) return;
  const from = track.el.volume;
  const started = Date.now();
  const durationMs = seconds * 1000;
  update(track, { fade: 0 });
  track.fadeTimer = setInterval(() => {
    const progress = Math.min(1, (Date.now() - started) / durationMs);
    if (progress >= 1) {
      stopAudio(key);
      return;
    }
    // Equal steps in loudness rather than in amplitude: the ear hears a linear ramp end abruptly.
    track.el.volume = from * (1 - progress) ** 2;
    update(track, { fade: progress });
  }, FADE_TICK_MS);
}

export function fadeOutAllAudio(seconds: number): void {
  for (const key of Array.from(tracks.keys())) fadeOutAudio(key, seconds);
}

export function stopAllAudio(): void {
  for (const key of Array.from(tracks.keys())) stopAudio(key);
}

/** Retry a player whose file failed to load. */
export function reloadAudio(key: string): void {
  const track = tracks.get(key);
  if (!track) return;
  const { label, url, volume, loop } = track.state;
  cancelFade(track);
  track.el.pause();
  tracks.set(key, createTrack(key, label, url, volume, loop));
  publish();
}

/** The audio item open in the operator view and where it is, for the J/K/L keys. */
export function focusedAudio(): { key: string; time: number } | undefined {
  const track = focusedKey ? tracks.get(focusedKey) : undefined;
  return focusedKey && track ? { key: focusedKey, time: track.state.currentTime } : undefined;
}

/**
 * The play/pause key: the audio item open in the operator view, if there is one. Returns whether
 * it handled the key.
 */
export function toggleFocusedAudio(): boolean {
  if (!focusedKey || !tracks.has(focusedKey)) return false;
  toggleAudio(focusedKey);
  return true;
}
