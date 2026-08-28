import type { PresentationLine } from './types';

/**
 * Filter lines by allowed languages and reorder them within each semantic group.
 *
 * A "semantic group" is one primary line plus the translations that follow it. Which line is
 * primary depends on how the song was written:
 *
 *   - Songs saved before tagging became explicit mark the primary line by carrying no tag.
 *   - Songs where every line is tagged mark it with `primaryLanguage`, the song's own first
 *     language, which the control window sends along with the content.
 *
 * Both are accepted, so a library part-way through being tagged renders correctly either way.
 *
 * When `languages` is given, lines outside it are dropped and the rest are emitted in that
 * order. An explicitly tagged primary line can be dropped like any other — that is what makes
 * "show only the translation" possible, which was not expressible while the primary line was
 * the untagged anchor and had to be emitted to hold the group together. An *untagged* primary
 * line is always emitted: there is no name to filter it by.
 *
 * When no filter is provided all lines pass through unchanged.
 */
export const filterLinesByLanguage = (lines: PresentationLine[], languages?: string[], primaryLanguage?: string): PresentationLine[] => {
  if (!languages || languages.length === 0) return lines;

  const primary = primaryLanguage?.toUpperCase();
  const isAnchor = (line: PresentationLine) => !line.language || (!!primary && line.language.toUpperCase() === primary);

  // Split into semantic groups: [{primary?, translations[]}]
  type Group = { primary?: PresentationLine; translations: PresentationLine[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    if (isAnchor(line)) {
      // A new anchor line starts a new group
      if (current) groups.push(current);
      current = { primary: line, translations: [] };
    } else {
      // Translation — attach to current group or start an orphan group
      if (!current) current = { translations: [] };
      const langUp = line.language!.toUpperCase();
      if (languages.includes(langUp)) {
        current.translations.push(line);
      }
      // else: language not in filter list — skip
    }
  }
  if (current) groups.push(current);

  // Re-emit each group with lines in `languages` order within the group
  const result: PresentationLine[] = [];
  for (const group of groups) {
    // Build a map: lang -> line for quick lookup. The anchor is reachable both by its own tag
    // and by '' so either spelling in the filter list finds it.
    const byLang = new Map<string, PresentationLine>();
    if (group.primary) {
      byLang.set('', group.primary);
      if (group.primary.language) byLang.set(group.primary.language.toUpperCase(), group.primary);
    }
    for (const t of group.translations) {
      if (t.language) byLang.set(t.language.toUpperCase(), t);
    }

    // Emit in the order specified by `languages`.
    // '' (empty string / no-language tag) represents the primary/default line.
    const emitted = new Set<PresentationLine>();
    for (const lang of languages) {
      const line = byLang.get(lang.toUpperCase());
      if (line && !emitted.has(line)) {
        result.push(line);
        emitted.add(line);
      }
    }
    // An untagged anchor has no name in the filter list, so it would otherwise vanish along
    // with its whole group. A tagged one was offered above and its absence here is deliberate.
    if (group.primary && !group.primary.language && !emitted.has(group.primary)) result.push(group.primary);
  }

  return result;
};
