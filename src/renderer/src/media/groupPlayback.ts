/**
 * How an agenda group plays its media entries. One settings sheet per group, stored with the show.
 *
 * The defaults are what the app did before the settings existed: one content entry per screen
 * group at a time, no auto-advance, content fades out when the group is left, and a background
 * keeps running until another one replaces it.
 *
 * "At once" and the top layer count per screen group, so a video on LED left and a slideshow on
 * LED right never compete for a slot.
 *
 * Dependency-free on purpose.
 */

export interface GroupMediaSettings {
  /** One entry after another, or all of them together when the group is started with Go. */
  mode: 'sequence' | 'together';
  /** Sequence: start the next content entry when one ends. */
  autoAdvance: boolean;
  /** Content entries visible at once per screen group; 0 means no limit. */
  maxAtOnce: number;
  /** Which of several visible entries is on top. */
  topLayer: 'lastStarted' | 'agendaOrder';
  /** What content does when the group is left. */
  onLeave: 'keep' | 'fade' | 'stop';
  /** Going to a song starts the media entries mapped to it. */
  startWithSong: boolean;
}

export interface GroupBackgroundSettings {
  /** How a background replaces the one before it. */
  transition: 'cut' | 'fade';
  /** What the group's background does when the group is left. */
  onLeave: 'keep' | 'fade' | 'hide';
}

export const DEFAULT_GROUP_MEDIA: GroupMediaSettings = {
  mode: 'sequence',
  autoAdvance: false,
  maxAtOnce: 1,
  topLayer: 'lastStarted',
  onLeave: 'fade',
  startWithSong: false,
};

export const DEFAULT_GROUP_BACKGROUNDS: GroupBackgroundSettings = { transition: 'fade', onLeave: 'keep' };

type GroupLike = { media?: Partial<GroupMediaSettings>; backgrounds?: Partial<GroupBackgroundSettings> } | undefined | null;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function groupMediaSettings(group: GroupLike): GroupMediaSettings {
  const raw = group?.media ?? {};
  const max = Number(raw.maxAtOnce);
  return {
    mode: pick(raw.mode, ['sequence', 'together'] as const, DEFAULT_GROUP_MEDIA.mode),
    autoAdvance: typeof raw.autoAdvance === 'boolean' ? raw.autoAdvance : DEFAULT_GROUP_MEDIA.autoAdvance,
    maxAtOnce: Number.isInteger(max) && max >= 0 ? max : DEFAULT_GROUP_MEDIA.maxAtOnce,
    topLayer: pick(raw.topLayer, ['lastStarted', 'agendaOrder'] as const, DEFAULT_GROUP_MEDIA.topLayer),
    onLeave: pick(raw.onLeave, ['keep', 'fade', 'stop'] as const, DEFAULT_GROUP_MEDIA.onLeave),
    startWithSong: typeof raw.startWithSong === 'boolean' ? raw.startWithSong : DEFAULT_GROUP_MEDIA.startWithSong,
  };
}

export function groupBackgroundSettings(group: GroupLike): GroupBackgroundSettings {
  const raw = group?.backgrounds ?? {};
  return {
    transition: pick(raw.transition, ['cut', 'fade'] as const, DEFAULT_GROUP_BACKGROUNDS.transition),
    onLeave: pick(raw.onLeave, ['keep', 'fade', 'hide'] as const, DEFAULT_GROUP_BACKGROUNDS.onLeave),
  };
}

/** A fade length for "fade" settings: the operator's hide transition, or half a second without one. */
export const fadeLength = (hideTransitionMs: number): number => (hideTransitionMs > 0 ? hideTransitionMs : 500);
