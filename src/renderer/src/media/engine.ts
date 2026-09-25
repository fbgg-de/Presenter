import type { CueCommand, CueTransport, MediaCue, MediaRegion, LyricOccurrence } from './types';

const EPS = 1e-7;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const milliseconds = (n: number) => Math.round(n * 1000) / 1000;
export const contains = (s: MediaRegion, t: number) => t >= s.start && t < s.end;
export const isEnabled = (s: MediaRegion, t: CueTransport) => t.enabled[s.id] ?? s.enabled !== false;
export const isLoop = (s: Partial<MediaRegion>) => s.kind === 'section' && s.loop === true;
const ordered = (a: MediaRegion, b: MediaRegion) => a.start - b.start || a.id.localeCompare(b.id);
const clearQueue = (t: CueTransport) => {
  delete t.nextLoop;
  t.exitLoop = false;
};
const release = (t: CueTransport) => {
  delete t.activeLoop;
  clearQueue(t);
};
const loops = (cue: MediaCue, t: CueTransport) =>
  cue.regions.filter((s) => isLoop(s) && s.end > s.start && isEnabled(s, t) && !t.bypass.includes(s.id)).sort(ordered);
const activateInside = (cue: MediaCue, t: CueTransport) => {
  if (!t.activeLoop) t.activeLoop = loops(cue, t).find((s) => contains(s, t.time))?.id;
};
export const initialTransport = (session: string): CueTransport => ({
  session,
  revision: 0,
  time: 0,
  playing: false,
  exitLoop: false,
  bypass: [],
  enabled: {},
});
/** The speeds offered in the transport. Anything between the limits is accepted. */
export const PLAYBACK_RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
export const MIN_RATE = 0.25;
export const MAX_RATE = 4;
/** A transport's speed, always finite and inside the limits. */
export const rateOf = (t: Pick<CueTransport, 'rate'>): number =>
  typeof t.rate === 'number' && Number.isFinite(t.rate) ? clamp(t.rate, MIN_RATE, MAX_RATE) : 1;

export const lyricAt = (cue: MediaCue, time: number, mapping?: Record<string, string>) =>
  cue.regions
    .filter((s) => s.kind !== 'pause' && (mapping ? !!mapping[s.id] : s.kind === 'section') && contains(s, time))
    .sort((a, b) => b.start - a.start || b.id.localeCompare(a.id))[0];

/**
 * How a playing media element follows the clock — the same rule in every window, so several
 * crops of one video on different screens stay together.
 *
 * Small drift is pulled in by playing a few percent faster or slower (proportional to the drift,
 * at most ±10 %), which is invisible; a seek is a visible stutter, so it is kept for real jumps —
 * a seek on the operator side, a loop wrapping, a window that fell far behind.
 *
 * A seek takes the decoder a while (commonly 0.1–0.4 s) during which the clock moves on, so it
 * aims `leadSeconds` of wall time ahead — the element's measured seek time — and lands on time
 * instead of behind, where the gentle nudge would need seconds to catch up.
 */
export const SYNC_HARD_SEEK = 0.5;
export const SYNC_DEADBAND = 0.02;
const SYNC_GAIN = 0.5;
const SYNC_MAX_NUDGE = 0.1;
export function followClock(target: number, current: number, rate: number, leadSeconds = 0): { seek?: number; playbackRate: number } {
  const drift = target - current;
  if (Math.abs(drift) > SYNC_HARD_SEEK) return { seek: target + leadSeconds * rate, playbackRate: rate };
  if (Math.abs(drift) <= SYNC_DEADBAND) return { playbackRate: rate };
  return { playbackRate: rate * (1 + clamp(drift * SYNC_GAIN, -SYNC_MAX_NUDGE, SYNC_MAX_NUDGE)) };
}

/** Immutable deterministic clock used by the operator and every output. */
export function advanceCue(cue: MediaCue, previous: CueTransport, seconds: number): CueTransport {
  const t = { ...previous, bypass: [...previous.bypass], enabled: { ...previous.enabled } };
  if (!t.playing || !Number.isFinite(seconds) || seconds <= 0 || cue.duration <= 0) return t;
  // Wall-clock seconds in, media seconds consumed: everything below works in media time.
  let remaining = seconds * rateOf(t);
  const pauses = cue.regions.filter((s) => s.kind === 'pause' && isEnabled(s, t)).sort(ordered);
  const hold = (s: MediaRegion) => {
    t.time = s.start;
    t.playing = false;
    t.pausedAt = s.id;
  };
  const land = (time: number) => {
    t.time = time;
    const p = pauses.find((s) => Math.abs(s.start - time) < EPS);
    if (p) hold(p);
  };
  // Each pass either consumes time, stops, activates a loop or resolves a boundary.
  while (t.playing && remaining > EPS) {
    const loop = cue.regions.find((s) => s.id === t.activeLoop && isLoop(s) && s.end > s.start && isEnabled(s, t));
    if (!loop && t.activeLoop) release(t);
    const entry = loop ? undefined : loops(cue, t).find((s) => s.start >= t.time - EPS);
    const boundary = loop?.end ?? entry?.start ?? cue.duration;
    const target = Math.min(cue.duration, t.time + remaining, boundary);
    const point = pauses.find((s) => s.start > t.time + EPS && s.start <= target + EPS);
    if (point) {
      hold(point);
      break;
    }
    remaining -= Math.max(0, target - t.time);
    t.time = target;
    if (t.time < boundary - EPS) break;
    if (loop) {
      const next = cue.regions.find((s) => s.id === t.nextLoop && isLoop(s) && s.end > s.start && isEnabled(s, t));
      if (next) {
        t.activeLoop = next.id;
        clearQueue(t);
        land(next.start);
      } else if (t.exitLoop) {
        release(t);
        t.bypass = cue.regions.filter((s) => isLoop(s) && s.start < t.time && contains(s, t.time)).map((s) => s.id);
      } else {
        land(loop.start);
        // Long suspended frames can span thousands of tiny loops; skip only event-free laps.
        if (t.playing && !pauses.some((s) => s.start >= loop.start && s.start <= loop.end)) remaining %= loop.end - loop.start;
      }
    } else if (entry) t.activeLoop = entry.id;
    else if (cue.loop) {
      release(t);
      t.bypass = [];
      land(0);
      if (t.playing && !pauses.length) remaining %= cue.duration;
    } else {
      t.playing = false;
      t.time = cue.duration;
      break;
    }
  }
  t.bypass = t.bypass.filter((id) => cue.regions.some((s) => s.id === id && contains(s, t.time)));
  return t;
}

export function commandCue(cue: MediaCue, previous: CueTransport, command: CueCommand): CueTransport {
  const t = { ...previous, bypass: [...previous.bypass], enabled: { ...previous.enabled }, revision: previous.revision + 1 };
  const resume = () => {
    if (t.time >= cue.duration) {
      t.time = 0;
      release(t);
      t.bypass = [];
    }
    delete t.pausedAt;
    t.playing = true;
    activateInside(cue, t);
  };
  switch (command.type) {
    case 'play':
      resume();
      break;
    case 'pause':
      t.playing = false;
      delete t.pausedAt;
      break;
    case 'toggle':
      if (t.playing) {
        t.playing = false;
        delete t.pausedAt;
      } else resume();
      break;
    case 'stop': {
      // The chosen speed is the operator's intent for this entry: it survives Stop.
      const stopped: CueTransport = { ...initialTransport(t.session), revision: t.revision, enabled: t.enabled };
      if (t.rate !== undefined) stopped.rate = t.rate;
      return stopped;
    }
    case 'rate': {
      if (!Number.isFinite(command.rate)) return previous;
      const rate = Math.round(clamp(command.rate, MIN_RATE, MAX_RATE) * 100) / 100;
      if (rate === 1) delete t.rate;
      else t.rate = rate;
      break;
    }
    case 'seek': {
      if (!Number.isFinite(command.time)) return previous;
      const restart = command.navigate && !!t.pausedAt;
      t.time = clamp(command.time, 0, cue.duration);
      delete t.pausedAt;
      t.bypass = [];
      if (!cue.regions.some((s) => s.id === t.activeLoop && contains(s, t.time))) release(t);
      if (restart) resume();
      else if (t.playing) activateInside(cue, t);
      break;
    }
    case 'enable': {
      // Any region: a pause holds, a loop repeats, a section's lyric mapping counts — only while armed.
      const s = cue.regions.find((s) => s.id === command.id);
      if (!s) return previous;
      t.enabled[s.id] = command.enabled;
      t.bypass = t.bypass.filter((id) => id !== s.id);
      if (!command.enabled) {
        if (t.activeLoop === s.id) release(t);
        if (t.nextLoop === s.id) delete t.nextLoop;
      } else if (t.playing) activateInside(cue, t);
      break;
    }
    case 'enter':
    case 'queue': {
      const s = cue.regions.find((s) => s.id === command.id && isLoop(s));
      if (!s) return previous;
      if (command.type === 'queue') {
        if (!t.activeLoop || t.activeLoop === s.id) return previous;
        t.nextLoop = s.id;
        t.exitLoop = false;
      } else {
        const restart = !!t.pausedAt;
        t.time = s.start;
        t.activeLoop = s.id;
        delete t.pausedAt;
        clearQueue(t);
        if (restart) t.playing = true;
      }
      t.enabled[s.id] = true;
      t.bypass = t.bypass.filter((id) => id !== s.id);
      break;
    }
    case 'exit':
      if (t.activeLoop) {
        t.exitLoop = true;
        delete t.nextLoop;
      }
      break;
    case 'cancel':
      clearQueue(t);
      break;
  }
  return t;
}

/** Stable within an unchanged arrangement; full signature requires explicit review after edits. */
export function lyricOccurrences(blocks: { name: string; lines?: unknown }[]): { signature: string; blocks: LyricOccurrence[] } {
  const seen = new Map<string, number>();
  const canonicalLines = (lines: unknown) =>
    Array.isArray(lines)
      ? lines.map((line) =>
          typeof line === 'string'
            ? line.trim()
            : line && typeof line === 'object' && 'text' in line
              ? `${'language' in line && line.language ? `[${line.language}] ` : ''}${line.text}`.trim()
              : '',
        )
      : [];
  return {
    signature: JSON.stringify(blocks.map((b) => ({ name: b.name, lines: canonicalLines(b.lines) }))),
    blocks: blocks.map((b, index) => {
      const n = (seen.get(b.name) ?? 0) + 1;
      seen.set(b.name, n);
      return { id: JSON.stringify([b.name, n]), name: `${b.name}${n > 1 ? ` · ${n}` : ''}`, index };
    }),
  };
}

export function validateCue(cue: MediaCue): string | undefined {
  if (!Number.isFinite(cue.duration) || cue.duration <= 0) return 'duration';
  const ids = new Set<string>();
  for (const r of cue.regions) {
    if (ids.has(r.id) || !r.id || !['section', 'pause'].includes(r.kind)) return 'regions';
    if (r.loop !== undefined && typeof r.loop !== 'boolean') return 'regions';
    ids.add(r.id);
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end > cue.duration || r.end - r.start < 0.001 - EPS)
      return 'regions';
  }
  const sources = new Set(cue.sources.map((s) => s.id));
  if (
    sources.size !== cue.sources.length ||
    cue.sources.some((s) => !s.id || !s.path.trim() || !['video', 'image'].includes(s.type) || !Number.isFinite(s.offset))
  )
    return 'sources';
  if (
    new Set(cue.assignments.map((a) => a.role)).size !== cue.assignments.length ||
    cue.assignments.some((a) => a.sourceId !== null && !sources.has(a.sourceId))
  )
    return 'assignments';
  for (const id of [cue.audioSourceId, cue.waveformSourceId])
    if (id && !cue.sources.some((s) => s.id === id && s.type === 'video')) return 'sources';
  if (cue.audioEnabled !== undefined && typeof cue.audioEnabled !== 'boolean') return 'sources';
  for (const a of cue.assignments) {
    const f = a.frame,
      c = f?.crop;
    if (!a.role.trim() || !f || !c || ![f.x, f.y, f.scale, f.blur, c.x, c.y, c.w, c.h].every(Number.isFinite)) return 'assignments';
    if (
      !['contain', 'cover', 'fill'].includes(f.fit) ||
      f.scale <= 0 ||
      f.scale > 1000 ||
      f.blur < 0 ||
      f.blur > 100 ||
      c.x < 0 ||
      c.y < 0 ||
      c.w <= 0 ||
      c.h <= 0 ||
      c.x + c.w > 1.000001 ||
      c.y + c.h > 1.000001
    )
      return 'assignments';
  }
  return undefined;
}
