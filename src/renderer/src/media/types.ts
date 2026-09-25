import { newId } from '@/utils/ids';
export type RegionKind = 'section' | 'pause';
/** How a region is drawn, once a looping section counts as its own kind. */
export type RegionLook = 'section' | 'loop' | 'pause';
/**
 * The colours for the three kinds of region, shared by the waveform editor and the layer bar so a
 * section looks the same wherever the operator meets it. A pause is orange: it is the one that
 * stops playback, and orange reads as "this holds" where the old salmon read as decoration.
 */
export const REGION_INK: Record<RegionLook, string> = { section: '#81b9ee', loop: '#c6a0ee', pause: '#ef8b57' };
/** Editor only: the region being edited. Nothing during a service is "selected", so the bar never uses it. */
export const REGION_HIGHLIGHT = '#e7bb69';
export const REGION_HIGHLIGHT_FILL = '#c59032';
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
  /** Sound of `audioSourceId` on the operator computer. */
  audioEnabled?: boolean;
  /** 0–1, for that sound. */
  volume?: number;
  /** Start again from the beginning at the end. */
  loop?: boolean;
  waveformSourceId?: string;
  /** How a version follows a song in its agenda group (the timeline editor, later). */
  lyrics?: MediaLyricBinding;
  /**
   * A slideshow: its sources are images shown one after another, each for `seconds`. The clock
   * decides which image shows, so pausing, stepping and looping work as for a video.
   */
  slideshow?: MediaSlideshow;
}
export interface MediaSlideshow {
  seconds: number;
  transition: 'cut' | 'fade';
}
/** The lyric mapping of a media version to a song entry of the same agenda group. */
export interface MediaLyricBinding {
  songItemId?: string;
  arrangement?: string;
  map: Record<string, string | 'clear'>;
  followLyrics: boolean;
  followVideo: boolean;
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
/** How a song's cue lines up with one arrangement: its lyric mapping and follow flags. */
export type SongCueMapping = Pick<MediaCueBinding, 'lyrics' | 'followLyrics' | 'followVideo'>;
/** The cue a song brings into every show: a library entry, mapped once per arrangement signature. */
export interface SongMediaCue {
  cueId: number;
  mappings: Record<string, SongCueMapping>;
}
/** A cue in the account library. Its `data.id` is replaced by `libraryCueKey(id)` when resolved. */
export interface MediaCueEntity {
  id: number;
  name: string;
  data: MediaCue;
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
  /**
   * Playback speed, 1 = normal (omitted when normal). The clock counts media time at this rate,
   * so every window, loop, hold and lyric mapping follows it without knowing about it.
   */
  rate?: number;
}
export interface CuePacket {
  cue: MediaCue;
  transport: CueTransport;
  at: number;
  assignment?: MediaAssignment;
  visible?: boolean;
  /** Milliseconds a change of `visible`, or this packet replacing another, takes to fade. */
  fadeMs?: number;
}
export type CueCommand =
  | { type: 'play' | 'pause' | 'toggle' | 'stop' | 'exit' | 'cancel' }
  | { type: 'seek'; time: number; navigate?: boolean }
  | { type: 'enable'; id: string; enabled: boolean }
  | { type: 'enter' | 'queue'; id: string }
  | { type: 'rate'; rate: number };

export const defaultFrame = (): MediaFrame => ({ crop: { x: 0, y: 0, w: 1, h: 1 }, x: 50, y: 50, scale: 100, fit: 'contain', blur: 0 });
export const mediaId = (): string => newId('cue');

export interface CueOutputStatus {
  session: string;
  revision: number;
  role: string;
  sources: Record<string, string>;
}
