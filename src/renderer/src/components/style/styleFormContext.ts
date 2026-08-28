import { createContext, type Dispatch, type SetStateAction } from 'react';
import type { StyleData, LanguageStyleEntry } from '@/api/styles.api';
import type { useI18nContext } from '@/i18n/i18n-react';
import { MAIN_LANGUAGE_SLOT, normaliseLanguageEntries } from '@/utils/languageSlots';

/** A cascade-overridable style property: a value plus whether this style sets it at all. */
export type PropState<T> = { enabled: boolean; value: T };

/**
 * Everything a style form section needs from the editor that owns the draft.
 *
 * The sections are pure views over this: they read and write style properties and nothing
 * else, so the same section renders identically whether it was reached from the category
 * nav or from a search result.
 */
export type StyleFormCtx = {
  LL: ReturnType<typeof useI18nContext>['LL'];
  styleData: StyleData;
  setStyleData: Dispatch<SetStateAction<StyleData>>;
  setIsDirty: (dirty: boolean) => void;
  getProp: <T>(key: keyof StyleData) => PropState<T>;
  updateProp: <K extends keyof StyleData>(key: K, value: StyleData[K]) => void;
  togglePropEnabled: (key: keyof StyleData, enabled: boolean) => void;
  /** Open the media browser to pick a background image / video. */
  handlePickImage: () => void;
  handlePickVideo: () => void;

  /** Custom-CSS section: the read-only "settings as CSS" viewer. */
  showGeneratedCss: boolean;
  setShowGeneratedCss: Dispatch<SetStateAction<boolean>>;
  generatedCssCopied: boolean;
  setGeneratedCssCopied: Dispatch<SetStateAction<boolean>>;
};

/**
 * Read the slot entries of a draft, always with the main-language slot present and in slot
 * order, so the form never has to deal with a gap or a missing slot 1.
 */
export const readLanguageEntries = (ctx: StyleFormCtx): LanguageStyleEntry[] => {
  // A style saved before slots existed still keys its entries by language code; normalising
  // here means the form never sees that shape.
  const entries = normaliseLanguageEntries(ctx.getProp<LanguageStyleEntry[]>('languageStyles').value || []);
  const withMain = entries.some((entry) => entry.slot === MAIN_LANGUAGE_SLOT) ? entries : [{ slot: MAIN_LANGUAGE_SLOT }, ...entries];

  return [...withMain].sort((a, b) => a.slot - b.slot);
};

/** Patch one slot in place, creating the list if this style had none. */
export const patchLanguageEntry = (ctx: StyleFormCtx, slot: number, patch: Partial<LanguageStyleEntry>): void => {
  const entries = readLanguageEntries(ctx);
  const index = entries.findIndex((entry) => entry.slot === slot);
  const updated = [...entries];
  if (index === -1) updated.push({ slot, ...patch });
  else updated[index] = { ...updated[index], ...patch };
  ctx.updateProp('languageStyles', { enabled: true, value: updated });
};

/** One level of the cascade that supplies a value when this style does not set it. */
export type InheritedSource = {
  /** Human-readable level name, e.g. "App default" or the global style's name. */
  source: string;
  value: unknown;
};

/**
 * Answers "what applies here if I leave this alone?" for a property row.
 *
 * Provided by the style editor, which is the only place that knows where the style being
 * edited sits in the cascade. Sources come back in cascade order, so the **last** one is what
 * actually shows. Several keys can be passed for a row that toggles more than one property
 * together (font family and its fallbacks); the first key with a value wins.
 *
 * Null outside the editor, in which case a row simply shows the plain "Inherited" caption.
 */
export const StyleInheritanceContext = createContext<((keys: (keyof StyleData)[]) => InheritedSource[]) | null>(null);
