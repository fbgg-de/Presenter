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
export const lyricAt = (cue: MediaCue, time: number, mapping?: Record<string, string>) =>
  cue.regions
    .filter((s) => s.kind !== 'pause' && (mapping ? !!mapping[s.id] : s.kind === 'section') && contains(s, time))
    .sort((a, b) => b.start - a.start || b.id.localeCompare(a.id))[0];

/** Immutable deterministic clock used by the operator and every output. */
export function advanceCue(cue: MediaCue, previous: CueTransport, seconds: number): CueTransport {
  const t = { ...previous, bypass: [...previous.bypass], enabled: { ...previous.enabled } };
  if (!t.playing || !Number.isFinite(seconds) || seconds <= 0 || cue.duration <= 0) return t;
  let remaining = seconds;
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
    else {
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
    case 'stop':
      return { ...initialTransport(t.session), revision: t.revision, enabled: t.enabled };
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
      const s = cue.regions.find((s) => s.id === command.id && (s.kind === 'pause' || isLoop(s)));
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
