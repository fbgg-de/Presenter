/**
 * Shortcuts over the playing media entries, for keys, the mobile control page and companion
 * commands, which name no entry: they act on the top content entry, else the top background.
 */
import type { CueCommand } from './types';
import { advanceCue } from './engine';
import { focusedAudio, playAudio, seekAudio } from './audioPlayers';
import { hasClock } from './mediaItem';
import { commandPlayback, endPlayback, getPlaybacks, type Playback } from './playback';

/** The entry a play/pause key means. */
export function focusedPlayback(): Playback | undefined {
  const live = getPlaybacks().filter((p) => p.endsAt === undefined && hasClock(p.cue));
  const top = (role: Playback['role']) =>
    live.filter((p) => p.role === role && p.covered.length < p.screens.length).sort((a, b) => b.order - a.order)[0];
  return top('content') ?? top('background');
}

export function commandFocusedPlayback(command: CueCommand): boolean {
  const playback = focusedPlayback();
  return playback ? commandPlayback(playback.key, command) : false;
}

/** Play or pause the focused entry. Returns whether there was one. */
export const togglePlaybackKey = (): boolean => commandFocusedPlayback({ type: 'toggle' });

/** How far J jumps back. */
export const SHUTTLE_BACK_SECONDS = 5;

/**
 * J and L, as in an editing suite: back a few seconds, play (K, play/pause, is
 * `togglePlaybackKey`). They act on the audio item open in the operator view, else on the focused
 * media entry. Returns whether one was there.
 */
export function shuttle(action: 'back' | 'play'): boolean {
  const audio = focusedAudio();
  if (audio) {
    if (action === 'play') playAudio(audio.key);
    else seekAudio(audio.key, Math.max(0, audio.time - SHUTTLE_BACK_SECONDS));
    return true;
  }
  const playback = focusedPlayback();
  if (!playback) return false;
  if (action === 'play') return commandPlayback(playback.key, { type: 'play' });
  const time = advanceCue(playback.cue, playback.transport, Math.max(0, (Date.now() - playback.at) / 1000)).time;
  return commandPlayback(playback.key, { type: 'seek', time: Math.max(0, time - SHUTTLE_BACK_SECONDS) });
}

export function stopFocusedPlayback(fadeMs: number): boolean {
  const playback = focusedPlayback();
  if (!playback) return false;
  endPlayback(playback.key, fadeMs);
  return true;
}
