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
export const isAnchorLine = (line: PresentationLine, primaryLanguage?: string): boolean => {
  const primary = primaryLanguage?.toUpperCase();
  return !line.language || (!!primary && line.language.toUpperCase() === primary);
};

/**
 * Where the `activeLineIndex`-th lyric line of a block sits in the flat list a stream window
 * renders — the anchor lines are the steps, translations ride along with the line above them.
 *
 * `filteredBlocks` are the blocks as that window shows them, so the position accounts for lines
 * its language filter dropped. A window showing only a translation has no anchor left to count;
 * there every visible line is a step of its own.
 */
export const streamFlatIndex = (
  filteredBlocks: PresentationLine[][],
  activeBlockIndex: number,
  activeLineIndex: number,
  primaryLanguage?: string,
): number => {
  let flat = 0;
  for (let b = 0; b < activeBlockIndex && b < filteredBlocks.length; b++) flat += filteredBlocks[b].length;

  const block = filteredBlocks[activeBlockIndex];
  if (!block) return flat;

  let anchors = 0;
  for (let i = 0; i < block.length; i++) {
    if (!isAnchorLine(block[i], primaryLanguage)) continue;
    if (anchors === activeLineIndex) return flat + i;
    anchors++;
  }
  if (anchors === 0 && activeLineIndex < block.length) return flat + activeLineIndex;
  return flat;
};

export const filterLinesByLanguage = (lines: PresentationLine[], languages?: string[], primaryLanguage?: string): PresentationLine[] => {
  if (!languages || languages.length === 0) return lines;

  const isAnchor = (line: PresentationLine) => isAnchorLine(line, primaryLanguage);

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

  // Nothing matched at all: the filter names languages this song is not written in — a screen
  // group set to "EN" in front of a German-only song, or a theme whose language slots do not
  // line up with it. Dropping every line would put a blank slide on the beamer while the stage
  // monitor and any unfiltered output still show the text, so the anchor lines stand in. Hiding
  // single lines stays possible; emptying a whole block does not.
  if (result.length === 0 && lines.length > 0) {
    const anchors = lines.filter(isAnchor);
    return anchors.length ? anchors : lines;
  }

  return result;
};
