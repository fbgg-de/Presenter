export type RegionKind = 'section' | 'pause';
export interface MediaRegion {
  id: string;
  kind: RegionKind;
  name: string;
  start: number;
  end: number;
  enabled?: boolean;
  nameFromBlock?: boolean;
  /** A section may map lyrics and loop at the same time. */
  loop?: boolean;
}
export interface MediaSource {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video';
  /** Source time = cue time + offset. Negative offsets delay this source. */
  offset: number;
}
export interface MediaFrame {
  crop: { x: number; y: number; w: number; h: number };
  x: number;
  y: number;
  scale: number;
  fit: 'contain' | 'cover' | 'fill';
  blur: number;
}
export interface MediaAssignment {
  role: string;
  /** null explicitly suppresses inherited media. */
  sourceId: string | null;
  frame: MediaFrame;
}
export interface MediaCue {
  id: string;
  name: string;
  duration: number;
  sources: MediaSource[];
  regions: MediaRegion[];
  assignments: MediaAssignment[];
  audioSourceId?: string;
  audioEnabled?: boolean;
  waveformSourceId?: string;
}
export interface LyricOccurrence {
  id: string;
  name: string;
  index: number;
}
export interface MediaCueBinding {
  cueId: string;
  /** Arrangement signature prevents silent rebinding after edits. */
  arrangement?: string;
  lyrics: Record<string, string | 'clear'>;
  followLyrics: boolean;
  followVideo: boolean;
}
export interface CueTransport {
  session: string;
  revision: number;
  time: number;
  playing: boolean;
  activeLoop?: string;
  nextLoop?: string;
  exitLoop: boolean;
  pausedAt?: string;
  bypass: string[];
  /** Runtime overrides, separate from saved preparation defaults. */
  enabled: Record<string, boolean>;
}
export interface CuePacket {
  cue: MediaCue;
  transport: CueTransport;
  at: number;
  assignment?: MediaAssignment;
  visible?: boolean;
}
export type CueCommand =
  | { type: 'play' | 'pause' | 'toggle' | 'stop' | 'exit' | 'cancel' }
  | { type: 'seek'; time: number; navigate?: boolean }
  | { type: 'enable'; id: string; enabled: boolean }
  | { type: 'enter' | 'queue'; id: string };

export const defaultFrame = (): MediaFrame => ({ crop: { x: 0, y: 0, w: 1, h: 1 }, x: 50, y: 50, scale: 100, fit: 'contain', blur: 0 });
export const mediaId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `cue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export interface CueOutputStatus {
  session: string;
  revision: number;
  role: string;
  sources: Record<string, string>;
}
