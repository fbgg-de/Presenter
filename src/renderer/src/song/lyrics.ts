import { LANGUAGE_CODE_REGEX, SONG_BLOCK_SEPARATOR, SONG_TRANSLATION_LINE_REGEX, type TBlocks } from '.';

/**
 * Block lyrics as the editor sees them: a list of pages, each holding a list of *lyric lines*,
 * each lyric line holding one text per language.
 *
 * This is a lossless view over the stored format, not a new one. A block is persisted as a flat
 * `string[]` in which an untagged line is the primary (default-language) line and every
 * `[XX] …` line directly after it is a translation of that same line — which is exactly how
 * `filterLinesByLanguage` in `presentation/index.tsx` regroups them for display. Parsing here
 * only makes that grouping explicit so the editor can keep a line and its translations together.
 *
 * The primary text is keyed by `PRIMARY_LANGUAGE_KEY` (the empty string) rather than by the
 * song's first language code. Parsing therefore never needs to know the song's language list,
 * and changing which language is the default becomes one explicit swap
 * (see {@link swapPrimaryLanguage}) instead of a reinterpretation of stored data.
 */

/** Key under which a lyric line holds its untagged, default-language text. */
export const PRIMARY_LANGUAGE_KEY = '';

/** One lyric line: the default-language text plus a text per translated language. */
export type LyricLine = {
  /** Stable across edits so React keys and drag-and-drop survive re-renders. */
  id: string;
  /** Language code (uppercase) → text; `PRIMARY_LANGUAGE_KEY` holds the untagged text. */
  texts: Record<string, string>;
};

/** A page of lyric lines. Blocks split into several pages at `---` separators. */
export type LyricPage = {
  id: string;
  lines: LyricLine[];
};

let idCounter = 0;
/** Ids only need to be unique within one editing session — they are never persisted. */
export const nextLyricId = (prefix: string): string => `${prefix}-${++idCounter}`;

export const createLyricLine = (texts: Record<string, string> = {}): LyricLine => ({
  id: nextLyricId('line'),
  texts: { [PRIMARY_LANGUAGE_KEY]: '', ...texts },
});

export const createLyricPage = (lines: LyricLine[] = [createLyricLine()]): LyricPage => ({
  id: nextLyricId('page'),
  lines,
});

/**
 * Parse a stored block into pages of lyric lines.
 *
 * A translation line attaches to the line above it. Two translations of the same language in a
 * row cannot belong to the same lyric line, so the second one starts a new line — which is what
 * keeps a block of untagged-free content (an all-translations block) from collapsing into one row.
 */
export const parseBlockLines = (raw: string[], primaryLanguage?: string): LyricPage[] => {
  const primary = primaryLanguage?.toUpperCase();
  const pages: LyricPage[] = [];
  let lines: LyricLine[] = [];
  let current: LyricLine | null = null;

  const endPage = () => {
    if (current) {
      lines.push(current);
      current = null;
    }
    pages.push(createLyricPage(lines.length > 0 ? lines : [createLyricLine()]));
    lines = [];
  };

  for (const line of raw) {
    if (line === SONG_BLOCK_SEPARATOR) {
      endPage();
      continue;
    }

    const match = line.match(SONG_TRANSLATION_LINE_REGEX);
    const tag = match ? match[1].toUpperCase() : undefined;
    const text = match ? match[2] : line;

    // The default language occupies the primary slot whether it says so with a tag or, in a
    // song written before tags were explicit, by carrying none.
    const key = !tag || tag === primary ? PRIMARY_LANGUAGE_KEY : tag;

    // An anchor always opens a new lyric line. So does a translation with nowhere to attach,
    // or one whose language the line above already holds — that second one is what stops a
    // run of same-language lines collapsing into a single row.
    if (key === PRIMARY_LANGUAGE_KEY || !current || current.texts[key] !== undefined) {
      if (current) lines.push(current);
      current = createLyricLine({ [key]: text });
      continue;
    }

    current.texts[key] = text;
  }

  endPage();

  return pages;
};

/** True when a lyric line carries no text in any language. */
export const isLyricLineEmpty = (line: LyricLine): boolean => Object.values(line.texts).every((text) => text.trim() === '');

/**
 * Serialise pages back into the stored flat form.
 *
 * `languages` fixes the order translations are written in; anything a line carries that is not
 * in the list is appended afterwards so a language removed from the song does not silently
 * delete text that is still there. Trailing empty lyric lines are dropped — they are editor
 * scaffolding, not content — but empty lines between filled ones stay, since a blank line is
 * meaningful spacing on screen.
 */
export const serialiseBlockLines = (pages: LyricPage[], languages: string[]): string[] => {
  const translationOrder = languages.slice(1).map((code) => code.toUpperCase());
  // Every line is written with its language spelled out, the default one included. A song with
  // no language list at all still writes its primary lines bare, which is what songs saved
  // before the list existed look like and what keeps them readable by anything older.
  const primaryCode = languages[0]?.toUpperCase();
  const writePrimary = (text: string) => (primaryCode && text.trim() !== '' ? `[${primaryCode}] ${text}` : text);
  const result: string[] = [];

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) result.push(SONG_BLOCK_SEPARATOR);

    // Drop scaffolding at the end of the page, keep gaps in the middle.
    const lines = [...page.lines];
    while (lines.length > 0 && isLyricLineEmpty(lines[lines.length - 1])) lines.pop();

    // Languages emitted for the previous lyric line, so the anchor rule below can tell
    // whether re-parsing would split this line off on its own. Null at the start of a page,
    // where there is nothing above to merge into.
    let previous: string[] | null = null;

    for (const line of lines) {
      const primary = line.texts[PRIMARY_LANGUAGE_KEY] ?? '';
      const extras = Object.keys(line.texts).filter((code) => code !== PRIMARY_LANGUAGE_KEY && line.texts[code].trim() !== '');
      const ordered = [
        ...translationOrder.filter((code) => extras.includes(code)),
        ...extras.filter((code) => !translationOrder.includes(code)),
      ];

      // A line with no primary text of its own would be swallowed by the line above on the
      // next parse, so it gets an empty untagged line as an anchor — but only when it needs
      // one. Parsing already starts a new lyric line when a translation repeats a language
      // the line above has, and nothing can be merged into at the start of a page. Skipping
      // the anchor in those two cases keeps blank rows off the screen.
      const wouldMergeUpwards = previous !== null && !previous.includes(ordered[0]);

      if (primary.trim() !== '' || ordered.length === 0 || wouldMergeUpwards) result.push(writePrimary(primary));

      for (const code of ordered) result.push(`[${code}] ${line.texts[code]}`);

      previous = ordered;
    }
  });

  return result;
};

/**
 * Every language tag used anywhere in the song, in first-seen order.
 * Seeds the language list of songs saved before the list was stored.
 */
export const detectSongLanguages = (blocks: TBlocks): string[] => {
  const found: string[] = [];

  for (const lines of Object.values(blocks)) {
    for (const line of lines) {
      const match = line.match(SONG_TRANSLATION_LINE_REGEX);
      const code = match?.[1].toUpperCase();
      if (code && !found.includes(code)) found.push(code);
    }
  }

  return found;
};

/**
 * Move a language into or out of the primary (untagged) slot across every page.
 *
 * Storage marks the default language by the *absence* of a tag, so promoting a translation to
 * default is a rewrite of the block, not a display setting: the promoted language loses its tag
 * and the outgoing default gains one. `from` is the code the untagged text currently belongs to
 * — pass `undefined` for a song that never had a language list, whose untagged text is then
 * simply left where it is.
 */
export const swapPrimaryLanguage = (pages: LyricPage[], from: string | undefined, to: string): LyricPage[] => {
  const target = to.toUpperCase();
  const outgoing = from?.toUpperCase();

  if (!outgoing || outgoing === target) return pages;

  return pages.map((page) => ({
    ...page,
    lines: page.lines.map((line) => {
      const texts = { ...line.texts };
      const primary = texts[PRIMARY_LANGUAGE_KEY] ?? '';
      const promoted = texts[target] ?? '';

      delete texts[target];
      texts[PRIMARY_LANGUAGE_KEY] = promoted;
      texts[outgoing] = primary;

      return { ...line, texts };
    }),
  }));
};

/** Plain-text form of a block for the raw editing mode: exactly what is stored, one line per row. */
export const pagesToRawText = (pages: LyricPage[], languages: string[]): string => serialiseBlockLines(pages, languages).join('\n');

/** Inverse of {@link pagesToRawText}. */
export const rawTextToPages = (text: string, primaryLanguage?: string): LyricPage[] => parseBlockLines(text.split('\n'), primaryLanguage);

/**
 * Editing view of a block: pages flattened into one list with the page breaks as items of
 * their own.
 *
 * Reordering is why this exists — with the break carried in the list, dragging a lyric line
 * past one moves it to the next page and the break itself can be dragged, both falling out of
 * a single `arrayMove` instead of needing index arithmetic across pages.
 */
export type LyricItem = { kind: 'line'; line: LyricLine } | { kind: 'break'; id: string };

/** Id a sortable list keys the item by. */
export const lyricItemId = (item: LyricItem): string => (item.kind === 'line' ? item.line.id : item.id);

export const pagesToItems = (pages: LyricPage[]): LyricItem[] =>
  pages.flatMap((page, index) => [
    ...(index > 0 ? [{ kind: 'break' as const, id: page.id }] : []),
    ...page.lines.map((line) => ({ kind: 'line' as const, line })),
  ]);

/**
 * `firstPageId` carries the opening page's id back in. Only pages after a break can recover
 * their id from the item list, so without it the first page would be re-keyed on every
 * conversion and React would remount it mid-drag.
 */
export const itemsToPages = (items: LyricItem[], firstPageId?: string): LyricPage[] => {
  const pages: LyricPage[] = [];
  let lines: LyricLine[] = [];
  let pageId = firstPageId ?? nextLyricId('page');

  for (const item of items) {
    if (item.kind === 'break') {
      pages.push({ id: pageId, lines });
      lines = [];
      pageId = item.id;
    } else {
      lines.push(item.line);
    }
  }

  pages.push({ id: pageId, lines });

  return pages;
};

/**
 * How many lyric lines carry text in a language, counting the untagged text under
 * `PRIMARY_LANGUAGE_KEY`. Removing a language deletes that text, so the editor asks first
 * when this is not zero.
 */
export const countLinesWithLanguage = (pages: LyricPage[], code: string): number => {
  const key = code === PRIMARY_LANGUAGE_KEY ? PRIMARY_LANGUAGE_KEY : code.toUpperCase();

  return pages.reduce((total, page) => total + page.lines.filter((line) => (line.texts[key] ?? '').trim() !== '').length, 0);
};

/**
 * Drop one language's text from every lyric line.
 *
 * Serialisation deliberately keeps languages that are missing from the song's list, so that an
 * out-of-sync list (an import, a song older than the list) cannot silently erase lyrics. Taking
 * a language off the song therefore has to remove its text here, explicitly.
 */
export const removeLanguageFromPages = (pages: LyricPage[], code: string): LyricPage[] => {
  const key = code.toUpperCase();

  return pages.map((page) => ({
    ...page,
    lines: page.lines.map((line) => {
      const texts = { ...line.texts };
      delete texts[key];
      return { ...line, texts };
    }),
  }));
};

/**
 * A rewrite of the stored lyrics implied by a change to the song's language list.
 *
 * Changing the list is not purely a display setting: the default language is the one stored
 * untagged, and a language taken off the song has to have its text removed. The language editor
 * emits these rather than touching blocks itself, so the song editor can apply the same change
 * to every block in one place.
 */
export type LyricEffect = { kind: 'promote'; from?: string; to: string } | { kind: 'drop'; code: string };

export const applyLyricEffects = (pages: LyricPage[], effects: LyricEffect[]): LyricPage[] =>
  effects.reduce(
    (acc, effect) =>
      effect.kind === 'promote' ? swapPrimaryLanguage(acc, effect.from, effect.to) : removeLanguageFromPages(acc, effect.code),
    pages,
  );

/**
 * Best guess at the language list of a song saved before the list was stored.
 *
 * Every tag actually present becomes a translation, and the default is the first of
 * `candidates` (the account default, then its pool) that the song does not already tag —
 * because the untagged lines have to belong to some language other than the tagged ones.
 */
export const seedSongLanguages = (blocks: TBlocks, candidates: string[]): string[] => {
  const detected = detectSongLanguages(blocks);

  // Nothing untagged means the song already spells out every language it uses, and the first
  // tag it reaches for is its default. Guessing a candidate here would invent a language the
  // song does not contain.
  if (!hasUntaggedLines(blocks)) return detected;

  const primary =
    candidates.map((code) => code.toUpperCase()).find((code) => LANGUAGE_CODE_REGEX.test(code) && !detected.includes(code)) ?? 'EN';

  return [primary, ...detected.filter((code) => code !== primary)];
};

/**
 * All of a song's text, grouped by the language tag it carries — `PRIMARY_LANGUAGE_KEY` holding
 * everything untagged. Feeds language detection, which needs a whole song's words rather than
 * a line's, and lets the review tool check a tag against what the text actually looks like.
 */
export const collectTextByLanguage = (blocks: TBlocks): Record<string, string> => {
  const collected: Record<string, string[]> = {};

  for (const lines of Object.values(blocks)) {
    for (const line of lines) {
      if (line === SONG_BLOCK_SEPARATOR || line.trim() === '') continue;

      const match = line.match(SONG_TRANSLATION_LINE_REGEX);
      const key = match ? match[1].toUpperCase() : PRIMARY_LANGUAGE_KEY;
      const text = match ? match[2] : line;

      (collected[key] ??= []).push(text);
    }
  }

  return Object.fromEntries(Object.entries(collected).map(([key, lines]) => [key, lines.join('\n')]));
};

/** True when any stored line still carries no language tag. */
export const hasUntaggedLines = (blocks: TBlocks): boolean =>
  Object.values(blocks).some((lines) =>
    lines.some((line) => line !== SONG_BLOCK_SEPARATOR && line.trim() !== '' && !SONG_TRANSLATION_LINE_REGEX.test(line)),
  );

/**
 * Write an explicit tag onto every untagged line, so a block no longer relies on the absence of
 * a tag to mark its default language.
 *
 * The reverse of nothing — once tagged, a line stays tagged. Lines that already carry a tag are
 * left exactly as they are, which makes this safe to run twice.
 */
export const tagUntaggedLines = (blocks: TBlocks, language: string): TBlocks => {
  const code = language.toUpperCase();
  const result: TBlocks = {};

  for (const [name, lines] of Object.entries(blocks)) {
    result[name] = lines.map((line) => {
      if (line === SONG_BLOCK_SEPARATOR || SONG_TRANSLATION_LINE_REGEX.test(line)) return line;
      // A blank line is spacing, not a lyric — tagging it would turn it into a stray empty
      // line of a language and change how the block groups.
      if (line.trim() === '') return line;

      return `[${code}] ${line}`;
    });
  }

  return result;
};

/**
 * Work out a song's languages, in slot order, from its lyrics alone.
 *
 * A song only records its language list once it has been through the editor or the language
 * review, so most of a library carries none — and without one a style's per-slot typography has
 * nothing to attach to, leaving every translation unstyled. Reading the tags off the content
 * gives the same answer the recorded list would.
 *
 * Untagged lines are the main language but do not name it, so an empty code holds slot 1 and the
 * tagged languages line up on 2, 3, … exactly where they will sit once the song is tagged.
 */
export const inferSongLanguages = (lines: string[]): string[] => {
  const tagged: string[] = [];
  let hasUntagged = false;

  for (const line of lines) {
    if (line === SONG_BLOCK_SEPARATOR || line.trim() === '') continue;

    const match = line.match(SONG_TRANSLATION_LINE_REGEX);

    if (!match) hasUntagged = true;
    else if (!tagged.includes(match[1].toUpperCase())) tagged.push(match[1].toUpperCase());
  }

  return hasUntagged ? ['', ...tagged] : tagged;
};
