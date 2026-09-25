/**
 * Resolve the look of one presentation window.
 *
 * Theme: DEFAULT → account → show → agenda group. Songs and single items carry no theme — the
 * group they sit in decides how they look. At every level the theme's base is merged first and
 * then its variant for the window's screen group, so a Stage variant of the show theme still
 * loses to the group's theme.
 *
 * A theme brings a colour, never an image or video: pictures and videos behind the text are
 * background entries of the agenda (see `media/playback.ts`). Background fields that older
 * themes still store are ignored here.
 */
import type { StyleData, StyleEntity } from '@/api/styles.api';
import { DEFAULT_STYLE, mergeStyles, resolveStyleData, type ResolvedStyle } from '@/utils/styleUtils';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';

export type LookLevelName = 'global' | 'show' | 'group';

/** The levels a theme can be set on, lowest to highest. */
export const THEME_LEVELS: LookLevelName[] = ['global', 'show', 'group'];

export interface LookLevel {
  styleId?: number | null;
}

export interface LookInput {
  levels: Partial<Record<LookLevelName, LookLevel>>;
  styles: StyleEntity[];
}

/**
 * Build the input from the objects the app already has in hand. The agenda group is looked up
 * from the show by the item's `groupId`, so every caller gets the group theme without knowing it.
 */
export function lookInputFor(args: {
  globalStyleId?: number | null;
  show?: {
    styleId?: number | null;
    groups?: Array<{ id: string; styleId?: number | null }> | null;
  } | null;
  item?: { groupId?: string } | null;
  styles?: StyleEntity[] | null;
}): LookInput {
  const groupId = args.item ? (args.item.groupId ?? DEFAULT_GROUP_ID) : undefined;
  const group = groupId !== undefined ? args.show?.groups?.find((g) => g.id === groupId) : undefined;
  return {
    levels: {
      global: { styleId: args.globalStyleId || undefined },
      show: { styleId: args.show?.styleId },
      group: { styleId: group?.styleId ?? undefined },
    },
    styles: args.styles ?? [],
  };
}

/** Resolved fields that describe a picture or video behind the text — no longer part of a look. */
const RETIRED_BACKGROUND_KEYS: (keyof ResolvedStyle)[] = [
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
  'backgroundZoom',
  'backgroundBlur',
  'backgroundVideo',
  'backgroundVideoAutoplay',
  'backgroundVideoLoop',
  'backgroundVideoVolume',
  'backgroundVideoSize',
  'backgroundVideoPosition',
  'backgroundVideoZoom',
  'backgroundVideoBlur',
  'backgroundVideoEaseIn',
  'backgroundVideoEaseOut',
  'suppressBackgroundImage',
  'suppressBackgroundVideo',
];

/** A style with only its colour left of the background. */
export function withoutBackgroundMedia(style: ResolvedStyle): ResolvedStyle {
  const next: ResolvedStyle = { ...style };
  for (const key of RETIRED_BACKGROUND_KEYS) delete next[key];
  return next;
}

const themeAt = (input: LookInput, level: LookLevelName): StyleEntity | undefined => {
  const id = input.levels[level]?.styleId;
  return id ? input.styles.find((s) => s.id === id && s.enabled) : undefined;
};

const variantOf = (theme: StyleEntity, groupKey: string | undefined): StyleData | undefined =>
  groupKey !== undefined ? theme.data?.variants?.[groupKey] : undefined;

/** The theme for a screen group (or the broadcast theme without one). */
export function resolveTheme(input: LookInput, groupKey?: string): ResolvedStyle {
  let result: ResolvedStyle = { ...DEFAULT_STYLE };
  for (const level of THEME_LEVELS) {
    const theme = themeAt(input, level);
    if (!theme) continue;
    result = mergeStyles(result, resolveStyleData(theme.data));
    const variant = variantOf(theme, groupKey);
    if (variant) result = mergeStyles(result, resolveStyleData(variant));
  }
  return withoutBackgroundMedia(result);
}

export interface ResolvedLook {
  style: ResolvedStyle;
}

export function resolveLook(input: LookInput, groupKey?: string): ResolvedLook {
  return { style: resolveTheme(input, groupKey) };
}

/** The level the theme comes from and its name; undefined when the default look applies. */
export function themeSource(input: LookInput): { level?: LookLevelName; name?: string; id?: number } {
  const level = [...THEME_LEVELS].reverse().find((l) => !!themeAt(input, l));
  const theme = level ? themeAt(input, level) : undefined;
  return { level, name: theme?.name, id: theme?.id };
}

/**
 * Whether any theme in play has a screen-group variant. When none does, every window can share
 * the broadcast look and the per-window resolution is skipped.
 */
export function lookVariesByGroup(input: LookInput): boolean {
  return THEME_LEVELS.some((level) => {
    const variants = themeAt(input, level)?.data?.variants;
    return !!variants && Object.keys(variants).length > 0;
  });
}
