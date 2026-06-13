/**
 * Parser for SongBeamer (.sng) files.
 *
 * SongBeamer file format:
 * - Lines starting with `#` are key=value metadata headers.
 * - A `---` line separates the header section from the body (first occurrence),
 *   and subsequent `---` lines separate individual verse blocks.
 * - `#LangCount=N` declares N parallel translation lines per lyric line.
 *   When N > 1, each lyric line is followed by (N-1) translation lines.
 * - `#Author` and `#Melody` are mapped to the `authors` field.
 * - `#Title` maps to `title`.
 * - `#BackgroundImage` maps to `background`.
 * - `#Copyright` maps to `copyright`.
 *
 * Design decision: each `---`-separated block becomes a named block (Verse 1,
 * Verse 2, …). Multi-language lines are kept as-is because the rest of the
 * application handles them via `SONG_TRANSLATION_LINE_REGEX` or presents them
 * sequentially. Both original and translated lines are stored in the same block
 * array with translated lines prefixed by `[lang]` notation when possible.
 */
import type { ISong } from '@/song';
import { Song } from '@/song';

/** Metadata keys recognised from SongBeamer `.sng` headers. */
interface SngHeaders {
  title?: string;
  author?: string;
  melody?: string;
  copyright?: string;
  backgroundImage?: string;
  langCount: number;
  /** CCLI song number, if present in the file via `#CCLI=<number>`. */
  ccli?: number;
}

/**
 * Parse a raw `.sng` file `content` into an {@link ISong}.
 *
 * @param content - Full UTF-8 text content of the `.sng` file.
 * @returns A populated {@link ISong} instance ready for use in the store.
 */
export const SngSong = (content: string): ISong => {
  const song = new Song();

  // Normalise line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // ── Parse header section (lines before first `---`) ──────────────────────
  const headers: SngHeaders = { langCount: 1 };
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') {
      bodyStartIndex = i + 1;
      break;
    }
    if (line.startsWith('#')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(1, eqIdx).trim().toLowerCase();
        const value = line.slice(eqIdx + 1).trim();
        switch (key) {
          case 'title':
            headers.title = value;
            break;
          case 'author':
            headers.author = value;
            break;
          case 'melody':
            headers.melody = value;
            break;
          case 'copyright':
            headers.copyright = value;
            break;
          case 'backgroundimage':
            headers.backgroundImage = value;
            break;
          case 'langcount':
            headers.langCount = Math.max(1, parseInt(value, 10) || 1);
            break;
          case 'ccli':
            headers.ccli = parseInt(value.replace(/\D/g, ''), 10) || undefined;
            break;
        }
      }
    }
  }

  // Populate song metadata
  song.title = headers.title ?? '';

  // Use CCLI number if present; otherwise fall back to a unique negative
  // timestamp (matching the behaviour of Song constructor for new songs).
  if (headers.ccli != null && !isNaN(headers.ccli)) {
    song.songNumber = headers.ccli;
  }

  const authorParts = [headers.author, headers.melody].filter(Boolean);
  song.authors = [...new Set(authorParts)].join(', ');

  song.copyright = headers.copyright ?? '';
  song.background = headers.backgroundImage ?? '';

  // ── Parse body section ────────────────────────────────────────────────────
  const bodyLines = lines.slice(bodyStartIndex);

  // Split body into raw blocks by `---` delimiter
  const rawBlocks: string[][] = [];
  let current: string[] = [];

  for (const line of bodyLines) {
    if (line === '---') {
      rawBlocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    rawBlocks.push(current);
  }

  // Convert raw block line arrays into cleaned lyric blocks.
  // When LangCount > 1, every group of `langCount` consecutive lines
  // represents one lyric line + translations. We interleave them as separate
  // entries so all languages are visible to the presenter.
  const blockOrder: string[] = [];
  let verseCounter = 1;

  for (const rawBlock of rawBlocks) {
    // Strip leading/trailing blank lines
    const trimmed = trimBlankLines(rawBlock);
    if (trimmed.length === 0) {
      continue;
    }

    const blockLines = headers.langCount > 1 ? interleaveLangLines(trimmed, headers.langCount) : trimmed;

    const blockName = `Verse ${verseCounter}`;
    verseCounter++;

    blockOrder.push(blockName);
    song.blocks[blockName] = blockLines;
  }

  song.initialOrder = blockOrder;
  song.order = { Default: blockOrder };

  return song;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove leading and trailing empty lines from a line array. */
function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length - 1;
  while (start <= end && lines[start].trim() === '') start++;
  while (end >= start && lines[end].trim() === '') end--;
  return lines.slice(start, end + 1);
}

/**
 * When a SongBeamer file has `LangCount > 1`, each lyric "row" consists of
 * `langCount` consecutive lines. We flatten them so all language lines are
 * stored sequentially. Empty-line separators between lyric rows are preserved.
 */
function interleaveLangLines(lines: string[], langCount: number): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      result.push('');
      i++;
      continue;
    }

    // Collect a group of `langCount` non-empty lines
    const group: string[] = [];
    while (i < lines.length && group.length < langCount) {
      if (lines[i].trim() === '' && group.length > 0) {
        // Blank line inside a group – end the group early
        break;
      }
      group.push(lines[i]);
      i++;
    }

    for (const l of group) {
      result.push(l);
    }
  }

  return result;
}
