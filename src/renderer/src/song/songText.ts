import { SONG_BLOCK_SEPARATOR, SONG_TRANSLATION_LINE_REGEX } from '.';
import { parseBlockLines, serialiseBlockLines, type LyricPage } from './lyrics';

/**
 * A whole song as one text, for quick edits across blocks.
 *
 *   # Verse 1
 *   Großer Gott, wir loben dich,
 *   [en] Holy God, we praise thy name,
 *   ---
 *   Vor dir neigt die Erde sich
 *
 *   # Chorus
 *   …
 *
 * `# Name` starts a block, `---` starts a new page inside it, and `[xx]` tags a translation of the
 * line above — the same syntax as a single block's plain text, with the default language written
 * untagged so the text reads like lyrics. Blank lines at the start and end of a block are
 * formatting between blocks; inside a block they stay, since an empty line is spacing on screen.
 * A heading needs a space after `#`, so a lyric such as “#1 in my heart” is still a lyric line.
 */

export type SongTextBlock = { name: string; pages: LyricPage[] };

export type SongTextProblem =
  | { kind: 'duplicate'; line: number; name: string }
  | { kind: 'empty_name'; line: number }
  | { kind: 'unknown_language'; line: number; code: string };

export type SongTextResult = {
  blocks: SongTextBlock[];
  /** Nothing may be applied while this is not empty. */
  problems: SongTextProblem[];
  slides: number;
  /** Old block name → new name, for headings that were renamed in place. */
  renames: Record<string, string>;
  /** Blocks that existed before and are gone from the text. */
  removed: string[];
};

/** `#` on its own, or `# ` followed by a name. `#word` is not a heading. */
const HEADING_REGEX = /^#(?:\s+(.*?))?\s*$/;

/** The song as text. The default language is written without a tag. */
export const blocksToSongText = (blocks: SongTextBlock[], languages: string[]): string => {
  // An empty first code makes the serialiser write primary lines bare, translations stay tagged.
  const view = languages.length > 0 ? ['', ...languages.slice(1)] : [];
  return blocks.map((block) => [`# ${block.name}`, ...serialiseBlockLines(block.pages, view)].join('\n')).join('\n\n');
};

/**
 * Parse the text back into blocks.
 *
 * `previousNames` are the block names before the edit, in order. A heading whose text changed at
 * the same position, where neither the old nor the new name appears elsewhere, is a rename — so
 * arrangements can follow it instead of losing the block.
 */
export const songTextToBlocks = (text: string, languages: string[], fallbackName: string, previousNames: string[] = []): SongTextResult => {
  const known = new Set(languages.map((code) => code.toUpperCase()));
  const problems: SongTextProblem[] = [];
  const sections: { name: string; body: string[] }[] = [];
  let current: { name: string; body: string[] } | null = null;

  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((row, index) => {
      const line = index + 1;
      const heading = row.match(HEADING_REGEX);

      if (heading) {
        const name = (heading[1] ?? '').trim();
        if (!name) problems.push({ kind: 'empty_name', line });
        else if (sections.some((section) => section.name === name)) problems.push({ kind: 'duplicate', line, name });
        current = { name, body: [] };
        sections.push(current);
        return;
      }

      // Lyrics before the first heading still belong somewhere.
      if (!current) {
        if (row.trim() === '') return;
        current = { name: fallbackName, body: [] };
        sections.push(current);
      }

      if (row.trim() === SONG_BLOCK_SEPARATOR) {
        current.body.push(SONG_BLOCK_SEPARATOR);
        return;
      }

      const tag = row.match(SONG_TRANSLATION_LINE_REGEX);
      if (tag && !known.has(tag[1].toUpperCase())) problems.push({ kind: 'unknown_language', line, code: tag[1] });

      current.body.push(row);
    });

  let slides = 0;
  const blocks = sections.map(({ name, body }) => {
    const lines = [...body];
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    const pages = parseBlockLines(lines, languages[0]);
    slides += pages.length;
    return { name, pages };
  });

  const names = blocks.map((block) => block.name);
  const renames: Record<string, string> = {};
  previousNames.forEach((old, index) => {
    const next = names[index];
    if (next !== undefined && next !== old && !names.includes(old) && !previousNames.includes(next)) renames[old] = next;
  });
  const removed = previousNames.filter((old) => !names.includes(old) && renames[old] === undefined);

  return { blocks, problems, slides, renames, removed };
};

/** Apply renames to an arrangement and drop blocks that no longer exist. */
export const followBlockChanges = (order: string[], renames: Record<string, string>, names: string[]): string[] =>
  order.map((name) => renames[name] ?? name).filter((name) => names.includes(name));
