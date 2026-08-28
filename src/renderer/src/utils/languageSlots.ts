import type { LanguageStyleEntry } from '@/api/styles.api';

/**
 * Language *slots* — the bridge between a song's languages and a style's typography.
 *
 * A style used to name languages outright: "lines tagged DE look like this". That only works
 * for a library where every song uses the same languages in the same roles, and it breaks the
 * moment one song is German-with-English and the next is English-with-German — the same style
 * would style the main lines of one and the translations of the other.
 *
 * Slots remove the coupling. The **song** decides the order of its languages; the **style**
 * decides how the first, second and third of them look and whether they are shown at all. A
 * style saying "second language: italic, 70% opacity" is then correct for every song, whatever
 * languages it happens to be written in.
 */

/** The song's own language — the lines a translation hangs off. */
export const MAIN_LANGUAGE_SLOT = 1;

/**
 * Which slot a line belongs to, or `undefined` when its language is not one the song lists.
 *
 * An untagged line is always the main language: that is how songs written before tagging
 * became explicit mark their primary lines, and they still render correctly.
 */
export const slotForLanguage = (language: string | undefined, songLanguages: string[] | undefined): number | undefined => {
  if (!language) return MAIN_LANGUAGE_SLOT;

  const index = (songLanguages ?? []).findIndex((code) => code.toUpperCase() === language.toUpperCase());

  return index >= 0 ? index + 1 : undefined;
};

/**
 * Read a style's language entries, tolerating ones written before slots existed.
 *
 * Styles used to key these by language code, with `language: ''` for the main text and the rest
 * in display order. Migration 21 converts them, but a style can still arrive unconverted — a
 * database that has not been migrated yet, or an older style imported afterwards — and the
 * entries then have no `slot` at all. Left alone they all collapse onto slot `undefined`, which
 * renders as a row of blank language labels rather than anything recognisable as a problem.
 *
 * The rule here is the migration's: position *is* the slot, because the old list was already
 * stored in display order.
 */
export const normaliseLanguageEntries = (entries: LanguageStyleEntry[] | undefined): LanguageStyleEntry[] => {
  if (!entries?.length) return [];

  let next = MAIN_LANGUAGE_SLOT + 1;

  return entries.map((entry) => {
    if (typeof entry.slot === 'number') return entry;

    const legacy = entry as LanguageStyleEntry & { language?: string };

    return { ...entry, slot: legacy.language === '' || legacy.language === undefined ? MAIN_LANGUAGE_SLOT : next++ };
  });
};

/** The style's entry for a slot, if it defines one. */
export const entryForSlot = (entries: LanguageStyleEntry[] | undefined, slot: number | undefined): LanguageStyleEntry | undefined =>
  slot === undefined ? undefined : normaliseLanguageEntries(entries).find((entry) => entry.slot === slot);

/**
 * The slots a style shows, in ascending order.
 *
 * A slot is shown unless it says otherwise, so adding an entry purely to restyle a language
 * never hides it by accident. A style with no entries at all returns nothing, which callers
 * read as "this style has no opinion" rather than "show none".
 */
export const visibleSlots = (entries: LanguageStyleEntry[] | undefined): number[] =>
  normaliseLanguageEntries(entries)
    .filter((entry) => entry.visible !== false)
    .map((entry) => entry.slot)
    // Nothing should reach here without a slot, but a bad one would become a duplicate React
    // key and a blank row on screen — cheap to rule out at the source.
    .filter((slot) => typeof slot === 'number')
    .sort((a, b) => a - b);

/**
 * The language codes a style wants shown for one particular song, in slot order.
 *
 * Slots the song has no language for drop out — a style configured for three languages simply
 * shows two when the song only has two. Returns `undefined` when the style expresses no
 * preference, meaning every language is shown.
 */
export const languagesForStyle = (
  entries: LanguageStyleEntry[] | undefined,
  songLanguages: string[] | undefined,
  showAll?: boolean,
): string[] | undefined => {
  if (showAll || !entries || entries.length === 0) return undefined;

  return (
    visibleSlots(entries)
      .map((slot) => (songLanguages ?? [])[slot - 1])
      // A slot the song has no language for drops out; an *empty* code does not. That is how a
      // song with untagged main lines names its first slot, and the line filter reads it as the
      // untagged anchor — dropping it would stop a style from hiding anything on such a song.
      .filter((code): code is string => code !== undefined)
  );
};
