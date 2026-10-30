/**
 * Song files from other presentation programs, so a church can bring its library along:
 *
 * - **OpenLyrics** (`.xml`) — the open format OpenLP exports and many others read.
 * - **ChordPro** (`.cho`, `.chopro`, `.chordpro`, `.crd`) — chord sheets; the chords are dropped.
 * - **FreeShow** (`.show`) — FreeShow's own JSON (freeshow.app/docs/format-show).
 *
 * SongBeamer (`.sng`) and CCLI SongSelect (`.txt`) have their own parsers (SngSong, CcliSong).
 * Every parser returns a Song like those do: blocks of lines, `---` between pages, translations as
 * `[XX] line` after the line they translate. Files that name their languages tag every line, so the
 * import does not have to guess (useImportLanguage leaves fully tagged songs alone).
 *
 * The OpenLyrics reader works on the tags directly instead of a DOM, so the same code runs in the
 * browser and in node tests; the format is plain enough for that.
 */
import { Song, SONG_BLOCK_SEPARATOR, type ISong } from '@/song';

/** What a file may say beyond the song itself; sent along when the song is created. */
export type ImportedSong = ISong & { ccliNumber?: string; key?: string };

export const OPENLYRICS_EXTENSIONS = ['.xml'];
export const CHORDPRO_EXTENSIONS = ['.cho', '.chopro', '.chordpro', '.crd'];
export const FREESHOW_EXTENSIONS = ['.show'];

const finish = (song: Song, names: string[], order: string[]): ImportedSong => {
  song.initialOrder = order.length ? order : names;
  song.order = { Default: song.initialOrder };
  return song as ImportedSong;
};

/** "de", "de-DE" → "DE". */
const languageCode = (lang: string | undefined | null): string | undefined => {
  const code = (lang ?? '').trim().split(/[-_]/)[0].toUpperCase();
  return /^[A-Z]{2,5}$/.test(code) ? code : undefined;
};

/**
 * One block from pages of the main language plus pages of its translations: each line, then its
 * translations as `[XX] …`. With a known main language its lines are tagged too.
 */
const interleave = (main: { lang?: string; pages: string[][] }, translations: { lang?: string; pages: string[][] }[]): string[] => {
  const lines: string[] = [];
  main.pages.forEach((page, p) => {
    if (p > 0) lines.push(SONG_BLOCK_SEPARATOR);
    page.forEach((line, l) => {
      lines.push(main.lang ? `[${main.lang}] ${line}` : line);
      for (const t of translations) {
        const text = t.pages[p]?.[l];
        if (t.lang && text !== undefined && text !== '') lines.push(`[${t.lang}] ${text}`);
      }
    });
  });
  return lines;
};

/** A name used twice gets numbers, in order of appearance: Verse, Verse → Verse 1, Verse 2. */
const numberDuplicates = (names: string[]): string[] => {
  const total = new Map<string, number>();
  for (const n of names) total.set(n, (total.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if ((total.get(n) ?? 0) < 2) return n;
    const i = (seen.get(n) ?? 0) + 1;
    seen.set(n, i);
    return `${n} ${i}`;
  });
};

// ── OpenLyrics ────────────────────────────────────────────────────────────────

const decodeXml = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, entity: string) => {
    const e = entity.toLowerCase();
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? '';
  });

const xmlAttr = (attrs: string, name: string): string | undefined => {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match ? decodeXml(match[1] ?? match[2] ?? '') : undefined;
};

const xmlTexts = (xml: string, tag: string): { attrs: string; inner: string }[] =>
  Array.from(xml.matchAll(new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g')), (m) => ({
    attrs: m[1] ?? '',
    inner: m[2] ?? '',
  }));

/** Text of an element without its markup: comments and chords go, formatting tags keep their text. */
const plainText = (inner: string): string =>
  decodeXml(
    inner
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<comment\b[^>]*>[\s\S]*?<\/comment>/g, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();

const OPENLYRICS_PARTS: Record<string, string> = {
  v: 'Verse',
  c: 'Chorus',
  b: 'Bridge',
  p: 'Pre-Chorus',
  i: 'Intro',
  e: 'Ending',
  o: 'Other',
};

/** "v1" → "Verse 1", "c" → "Chorus", "v2a" → "Verse 2a"; anything else stays as written. */
const openLyricsName = (raw: string): string => {
  const match = /^([a-z])(\d*)([a-z]?)$/i.exec(raw.trim());
  const part = match ? OPENLYRICS_PARTS[match[1].toLowerCase()] : undefined;
  if (!match || !part) return raw.trim() || 'Verse';
  return `${part}${match[2] ? ` ${match[2]}` : ''}${match[3]}`;
};

export const OpenLyricsSong = (content: string): ImportedSong => {
  const song = new Song();
  const properties = /<properties\b[^>]*>([\s\S]*?)<\/properties>/.exec(content)?.[1] ?? '';
  const titles = xmlTexts(properties, 'title');
  song.title = plainText(titles[0]?.inner ?? '');
  song.authors = [
    ...new Set(
      xmlTexts(properties, 'author')
        .map((a) => plainText(a.inner))
        .filter(Boolean),
    ),
  ].join(', ');
  song.copyright = plainText(xmlTexts(properties, 'copyright')[0]?.inner ?? '');
  const ccli = plainText(xmlTexts(properties, 'ccliNo')[0]?.inner ?? '').replace(/\D/g, '');
  const key = plainText(xmlTexts(properties, 'key')[0]?.inner ?? '');

  const lyrics = /<lyrics\b[^>]*>([\s\S]*?)<\/lyrics>/.exec(content)?.[1] ?? '';
  // Verses by name; the same name in another language is a translation of it.
  const byName = new Map<string, { raw: string; versions: { lang?: string; pages: string[][] }[] }>();
  let mainLang: string | undefined;
  for (const verse of xmlTexts(lyrics, 'verse')) {
    const raw = xmlAttr(verse.attrs, 'name') ?? `v${byName.size + 1}`;
    const lang = languageCode(xmlAttr(verse.attrs, 'lang'));
    mainLang ??= lang;
    const pages = xmlTexts(verse.inner, 'lines')
      .map((lines) =>
        lines.inner
          .split(/<br\s*\/?>/)
          .map(plainText)
          .filter((line, i, all) => line !== '' || (i > 0 && i < all.length - 1)),
      )
      .filter((page) => page.length > 0);
    const entry = byName.get(raw.toLowerCase()) ?? { raw, versions: [] };
    entry.versions.push({ lang, pages });
    byName.set(raw.toLowerCase(), entry);
  }

  const names: string[] = [];
  const nameOf = new Map<string, string>();
  for (const [id, entry] of byName) {
    const main = entry.versions.find((v) => v.lang === mainLang) ?? entry.versions[0];
    const name = openLyricsName(entry.raw);
    song.blocks[name] = interleave(
      main,
      entry.versions.filter((v) => v !== main),
    );
    names.push(name);
    nameOf.set(id, name);
  }
  const verseOrder = plainText(xmlTexts(properties, 'verseOrder')[0]?.inner ?? '')
    .split(/\s+/)
    .map((token) => nameOf.get(token.toLowerCase()))
    .filter((name): name is string => !!name);
  const result = finish(song, names, verseOrder);
  if (ccli) result.ccliNumber = ccli;
  if (key) result.key = key;
  return result;
};

// ── ChordPro ──────────────────────────────────────────────────────────────────

const CHORDPRO_SECTIONS: Record<string, string> = {
  verse: 'Verse',
  sov: 'Verse',
  chorus: 'Chorus',
  soc: 'Chorus',
  bridge: 'Bridge',
  sob: 'Bridge',
};

/** A comment like "{c: Chorus}" or "{c: Strophe 2}" names the section that follows. */
const SECTION_COMMENT = /^(verse|chorus|bridge|pre-?chorus|intro|outro|ending|tag|refrain|strophe|vers|interlude)\b.*$/i;

export const ChordProSong = (content: string): ImportedSong => {
  const song = new Song();
  const extras: { ccliNumber?: string; key?: string } = {};
  const authors: string[] = [];
  /** Sections in order of appearance; `ref` is a repeat ({chorus}) of an earlier one. */
  const sections: { name: string; lines: string[]; ref?: number }[] = [];
  // A holder, not a `let`: the section is opened and closed inside the helpers below.
  const at: { section: { name: string; lines: string[] } | null; explicit: boolean; skipping: boolean } = {
    section: null,
    explicit: false,
    skipping: false,
  };

  const close = () => {
    const section = at.section;
    if (section && section.lines.some((l) => l.trim() !== '')) {
      while (section.lines[0]?.trim() === '') section.lines.shift();
      while (section.lines[section.lines.length - 1]?.trim() === '') section.lines.pop();
      sections.push(section);
    }
    at.section = null;
  };
  const open = (name: string, explicit: boolean) => {
    close();
    at.section = { name, lines: [] };
    at.explicit = explicit;
  };

  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#')) continue;
    const directive = /^\{\s*([a-z_-]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
    if (directive) {
      const name = directive[1].toLowerCase();
      const value = (directive[2] ?? '').trim();
      if (name === 'title' || name === 't') song.title ||= value;
      else if (['artist', 'composer', 'lyricist', 'subtitle', 'st'].includes(name)) value && authors.push(value);
      else if (name === 'copyright') song.copyright = value;
      else if (name === 'ccli') extras.ccliNumber = value.replace(/\D/g, '') || undefined;
      else if (name === 'key') extras.key = value;
      else if (name.startsWith('start_of_') || ['sov', 'soc', 'sob'].includes(name)) {
        const kind = name.replace('start_of_', '');
        if (kind === 'tab' || kind === 'grid' || name === 'sot' || name === 'sog') at.skipping = true;
        else open(value || CHORDPRO_SECTIONS[kind] || kind.charAt(0).toUpperCase() + kind.slice(1), true);
      } else if (name.startsWith('end_of_') || ['eov', 'eoc', 'eob', 'eot', 'eog'].includes(name)) {
        if (at.skipping) at.skipping = false;
        else close();
      } else if (name === 'chorus') {
        close();
        const last = [...sections].reverse().findIndex((s) => !s.ref && /chorus|refrain/i.test(s.name));
        if (last >= 0) sections.push({ name: '', lines: [], ref: sections.length - 1 - last });
      } else if (['comment', 'c', 'ci', 'comment_italic', 'cb', 'comment_box'].includes(name) && SECTION_COMMENT.test(value)) {
        open(value.replace(/:$/, ''), false);
      }
      continue;
    }
    if (at.skipping) continue;
    // Chords sit in brackets inside the lyrics; the words are what goes on screen.
    const text = rawLine
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text === '') {
      // Without explicit sections a blank line ends a verse.
      if (at.section && !at.explicit) close();
      else at.section?.lines.push('');
      continue;
    }
    if (!at.section) open('Verse', false);
    at.section?.lines.push(text);
  }
  close();

  const unique = numberDuplicates(sections.filter((s) => !s.ref).map((s) => s.name));
  const names: string[] = [];
  const order: string[] = [];
  let u = 0;
  const nameAt: string[] = [];
  sections.forEach((section, i) => {
    if (section.ref !== undefined) {
      order.push(nameAt[section.ref]);
      return;
    }
    const name = unique[u++];
    nameAt[i] = name;
    song.blocks[name] = section.lines;
    names.push(name);
    order.push(name);
  });
  song.authors = [...new Set(authors)].join(', ');
  return Object.assign(finish(song, names, order), extras);
};

// ── FreeShow ──────────────────────────────────────────────────────────────────

type FsLine = { text?: { value?: string }[] };
type FsItem = { type?: string; lines?: FsLine[]; language?: string };
type FsSlide = { group?: string | null; globalGroup?: string; children?: string[]; items?: FsItem[] };

const fsLines = (item: FsItem): string[] =>
  (item.lines ?? []).map((line) =>
    (line.text ?? [])
      .map((part) => part.value ?? '')
      .join('')
      .replace(/<[^>]+>/g, '')
      .trim(),
  );

export const FreeShowSong = (content: string): ImportedSong => {
  const parsed: unknown = JSON.parse(content);
  // Saved files are `[id, show]`; the documentation describes the show object itself.
  const show = (Array.isArray(parsed) ? parsed[1] : parsed) as {
    name?: string;
    meta?: Record<string, string>;
    slides?: Record<string, FsSlide>;
    layouts?: Record<string, { slides?: { id: string; disabled?: boolean }[] }>;
    settings?: { activeLayout?: string };
  };
  const song = new Song();
  const meta = show.meta ?? {};
  song.title = meta.title || show.name || '';
  song.authors = [...new Set([meta.artist, meta.author, meta.composer].filter(Boolean))].join(', ');
  song.copyright = meta.copyright ?? '';

  const slides = show.slides ?? {};
  /** One page of a slide: its main textbox, then the textboxes translated from it. */
  const pageOf = (slide: FsSlide | undefined) => {
    const texts = (slide?.items ?? []).filter((item) => (item.type ?? 'text') === 'text' && item.lines?.length);
    const main = texts.find((item) => !item.language) ?? texts[0];
    return { main: main ? fsLines(main) : [], translations: texts.filter((item) => item !== main && item.language) };
  };
  const parents = Object.entries(slides).filter(([, slide]) => slide.group !== null && slide.group !== undefined);
  const uniqueNames = numberDuplicates(parents.map(([, slide]) => (slide.group || slide.globalGroup || 'Verse').trim()));
  const nameOf = new Map<string, string>();
  const names: string[] = [];
  parents.forEach(([id, slide], i) => {
    const pages = [slide, ...(slide.children ?? []).map((child) => slides[child])].map(pageOf).filter((p) => p.main.length > 0);
    const langs = [...new Set(pages.flatMap((p) => p.translations.map((t) => languageCode(t.language)).filter(Boolean)))] as string[];
    song.blocks[uniqueNames[i]] = interleave(
      { pages: pages.map((p) => p.main) },
      langs.map((lang) => ({
        lang,
        pages: pages.map((p) => {
          const item = p.translations.find((t) => languageCode(t.language) === lang);
          return item ? fsLines(item) : [];
        }),
      })),
    );
    nameOf.set(id, uniqueNames[i]);
    names.push(uniqueNames[i]);
  });

  const layouts = show.layouts ?? {};
  const layout = layouts[show.settings?.activeLayout ?? ''] ?? Object.values(layouts)[0];
  const order = (layout?.slides ?? [])
    .filter((ref) => !ref.disabled)
    .map((ref) => nameOf.get(ref.id))
    .filter((name): name is string => !!name);
  const result = finish(song, names, order);
  const ccli = (meta.CCLI ?? '').replace(/\D/g, '');
  if (ccli) result.ccliNumber = ccli;
  if (meta.key) result.key = meta.key;
  return result;
};

/** Which parser a file goes to, by its extension; null for the formats with their own parsers. */
export const importerFor = (fileName: string): ((content: string) => ImportedSong) | null => {
  const name = fileName.toLowerCase();
  if (OPENLYRICS_EXTENSIONS.some((ext) => name.endsWith(ext))) return OpenLyricsSong;
  if (CHORDPRO_EXTENSIONS.some((ext) => name.endsWith(ext))) return ChordProSong;
  if (FREESHOW_EXTENSIONS.some((ext) => name.endsWith(ext))) return FreeShowSong;
  return null;
};
