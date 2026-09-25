/**
 * Screen groups.
 *
 * A screen group is a logical output — "Audience", "Stage", "Stream", "LED wall" — that
 * physical windows are assigned to. Groups belong to the account, so they travel between
 * devices; which window is in which group is local to the machine and lives on the window
 * config (`WindowConfig.screenGroupId`), exactly like the rest of the window rig.
 *
 * Themes, backgrounds and media cues address groups instead of single windows, so renaming
 * or replacing a beamer never breaks an assignment.
 *
 * Dependency-free on purpose: the presentation bridge imports this module.
 */

export type ScreenGroupKind = 'audience' | 'stage' | 'stream' | 'wall' | 'custom';

export const SCREEN_GROUP_KINDS: ScreenGroupKind[] = ['audience', 'stage', 'stream', 'wall', 'custom'];

/** Which kinds of content a group's windows show. */
export interface ScreenGroupLayers {
  /** Style backgrounds (colour, image, video) and media-cue video. */
  background: boolean;
  /** Song text. */
  slides: boolean;
  /** Media items from the show (images, videos, colours). */
  media: boolean;
  /** Bible verse items. */
  bibleVerses: boolean;
  /** Stage-monitor overlays; which layers is decided on each layer's “Show on”. */
  overlays: boolean;
}

/** The designed layouts a stage screen can show; see `presentation/StageScreen.tsx`. */
export type StageLayoutKind = 'band' | 'speaker' | 'countdown' | 'lyrics';

export const STAGE_LAYOUT_KINDS: StageLayoutKind[] = ['band', 'speaker', 'countdown', 'lyrics'];

/** How a Stage group's windows are drawn. Only switches — nothing is positioned by hand. */
export interface StageLayoutSettings {
  layout: StageLayoutKind;
  /** The arrangement as a row of sections along the bottom, the current one highlighted. */
  roadmap: boolean;
  /** The next section beside (Band) or next to (Speaker) the current one. */
  next: boolean;
  /** The song's key in the header. */
  key: boolean;
  /** Wall clock in the header. */
  clock: boolean;
  /** Flip horizontally, for a teleprompter glass. */
  mirror: boolean;
  textSize: 'normal' | 'large' | 'huge';
}

export const DEFAULT_STAGE_LAYOUT: StageLayoutSettings = {
  layout: 'band',
  roadmap: true,
  next: true,
  key: true,
  clock: true,
  mirror: false,
  textSize: 'large',
};

/** How a group's windows lay out the text: whole slides, or a few lines at a time for a stream. */
export interface ScreenGroupDisplay {
  mode: 'normal' | 'stream';
  /** Stream mode: how many lines are shown at once. */
  lines: number;
}

export interface ScreenGroupData {
  kind: ScreenGroupKind;
  layers: ScreenGroupLayers;
  /** Stage-kind groups only: the stage screen layout. */
  stage?: StageLayoutSettings;
  display: ScreenGroupDisplay;
  /** Languages the group's windows show; empty lets the theme decide. */
  languages: string[];
  /** A see-through window background, for keying a stream over video. */
  transparent: boolean;
}

export const DEFAULT_DISPLAY_BY_KIND: Record<ScreenGroupKind, ScreenGroupDisplay> = {
  audience: { mode: 'normal', lines: 2 },
  stage: { mode: 'normal', lines: 2 },
  stream: { mode: 'stream', lines: 2 },
  wall: { mode: 'normal', lines: 2 },
  custom: { mode: 'normal', lines: 2 },
};

export interface ScreenGroupEntity {
  id: number;
  name: string;
  enabled: boolean;
  sort_order: number;
  data: ScreenGroupData;
  created_at?: string;
  updated_at?: string;
}

/**
 * What a new group of each kind shows — the operator can change every one of these.
 *
 * Every kind shows the song text. An LED wall used to start without it, on the idea that a wall
 * behind the band carries imagery rather than lyrics; in practice it is a second audience screen
 * and starting it blank reads as a broken output, not as a setting.
 */
export const DEFAULT_LAYERS_BY_KIND: Record<ScreenGroupKind, ScreenGroupLayers> = {
  audience: { background: true, slides: true, media: true, bibleVerses: true, overlays: false },
  stage: { background: false, slides: true, media: false, bibleVerses: true, overlays: true },
  stream: { background: false, slides: true, media: true, bibleVerses: true, overlays: false },
  wall: { background: true, slides: true, media: true, bibleVerses: true, overlays: false },
  custom: { background: true, slides: true, media: true, bibleVerses: true, overlays: true },
};

export const emptyScreenGroupData = (kind: ScreenGroupKind): ScreenGroupData => ({
  kind,
  layers: { ...DEFAULT_LAYERS_BY_KIND[kind] },
  display: { ...DEFAULT_DISPLAY_BY_KIND[kind] },
  languages: [],
  transparent: false,
});

/** Fill whatever a stored group is missing, so nothing downstream has to guard each field. */
export function normaliseScreenGroupData(raw: unknown): ScreenGroupData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<ScreenGroupData>;
  const kind = SCREEN_GROUP_KINDS.includes(data.kind as ScreenGroupKind) ? (data.kind as ScreenGroupKind) : 'custom';
  const lines = Number(data.display?.lines);
  return {
    kind,
    layers: { ...DEFAULT_LAYERS_BY_KIND[kind], ...(data.layers ?? {}) },
    ...(kind === 'stage' ? { stage: { ...DEFAULT_STAGE_LAYOUT, ...(data.stage ?? {}) } } : {}),
    display: {
      mode: data.display?.mode === 'stream' || data.display?.mode === 'normal' ? data.display.mode : DEFAULT_DISPLAY_BY_KIND[kind].mode,
      lines: Number.isInteger(lines) && lines > 0 ? lines : DEFAULT_DISPLAY_BY_KIND[kind].lines,
    },
    languages: Array.isArray(data.languages) ? data.languages.filter((code): code is string => typeof code === 'string') : [],
    transparent: data.transparent === true,
  };
}

/** The enabled group a window belongs to, or undefined when it has none. */
export function groupForWindow(groups: ScreenGroupEntity[], groupId: number | undefined): ScreenGroupEntity | undefined {
  if (groupId === undefined) return undefined;
  const group = groups.find((g) => g.id === groupId);
  return group && group.enabled ? group : undefined;
}

/**
 * The group a new window, or one whose group was deleted, joins: the first enabled Audience
 * group, else the first enabled group of any kind.
 */
export function defaultGroupForWindows(groups: ScreenGroupEntity[]): ScreenGroupEntity | undefined {
  const enabled = [...groups].filter((g) => g.enabled).sort((a, b) => a.sort_order - b.sort_order);
  return enabled.find((g) => normaliseScreenGroupData(g.data).kind === 'audience') ?? enabled[0];
}

/** The stage layout a window in `groupId` draws, or undefined when it is not in an enabled Stage group. */
export function stageLayoutForGroup(groups: ScreenGroupEntity[], groupId: number | undefined): StageLayoutSettings | undefined {
  if (groupId === undefined) return undefined;
  const group = groups.find((g) => g.id === groupId);
  return group && group.enabled ? normaliseScreenGroupData(group.data).stage : undefined;
}

/**
 * The layers a window in `groupId` shows. `undefined` means the window has no (enabled) group
 * and shows everything, which is how every window behaved before groups existed.
 */
export function layersForGroup(groups: ScreenGroupEntity[], groupId: number | undefined): ScreenGroupLayers | undefined {
  if (groupId === undefined) return undefined;
  const group = groups.find((g) => g.id === groupId);
  return group && group.enabled ? normaliseScreenGroupData(group.data).layers : undefined;
}
