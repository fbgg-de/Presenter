/**
 * What a presentation window is sent for one show item at one slide, built from plain inputs.
 *
 * The broadcast (`usePresentationSync`) and the operator preview both go through here, so the
 * preview cannot drift from what the windows actually receive. Parsing the item (`itemContentParts`)
 * is separate from placing it at a slide (`contentForItem`), because the broadcast keeps the parsed
 * lyrics memoised while the slide changes on every arrow key.
 */
import { SONG_TRANSLATION_LINE_REGEX, inferSongLanguages, resolvePrimaryLanguage } from '@/song';
import type { ShowItem } from '@/api/shows.api';
import type { ResolvedStyle } from '@/utils/styleUtils';
import { resolveNextLinePreview } from '@/utils/styleUtils';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import { versePages } from '@/utils/itemBlocks';
import type { ContentType, PresentationBlock, PresentationContent, PresentationLine } from './types';

/** The part of a song the content needs. */
export interface ContentSong {
  title: string;
  authors?: string;
  copyright?: string;
  account?: number;
  languages?: string[];
  getBlocks: (order: string) => { name: string; lines: string[]; copyright: boolean }[];
}

export interface ItemContentParts {
  contentType: ContentType;
  blocks: PresentationBlock[];
  title?: string;
  copyright?: string;
  authors?: string;
  licenseNumber?: number;
  songLanguages?: string[];
}

/**
 * Parse song block lines to extract language tags.
 * Lines like "[EN] Some text" are tagged with the language.
 * Lines without tags are considered universal (no language).
 */
export const parseSongLines = (rawLines: string[]): PresentationLine[] =>
  rawLines.map((line) => {
    const match = line.match(SONG_TRANSLATION_LINE_REGEX);
    return match ? { text: match[2], language: match[1].toUpperCase() } : { text: line };
  });

/** The item's type, slides and song details — everything that does not change with the slide. */
export function itemContentParts(item: ShowItem | undefined, song: ContentSong | undefined, orderName: string): ItemContentParts {
  let contentType: ContentType = 'empty';
  let blocks: PresentationBlock[] = [];
  let title: string | undefined;
  let copyright: string | undefined;
  let authors: string | undefined;
  let songLanguages: string[] | undefined;

  if (item) {
    switch (item.type) {
      case 'song': {
        contentType = 'song';
        if (song) {
          title = song.title;
          authors = song.authors;
          copyright = song.copyright;

          const songBlocks = song.getBlocks(orderName);
          // The song's languages, in its own order — slot 1, slot 2, slot 3 for any style
          // that wants to describe them positionally. The anchor is resolved from the song's
          // own content rather than trusting the declared list alone, so a song whose list has
          // drifted from its lyrics still groups its translations correctly, and the resolved
          // anchor is put first so slot 1 always means what it says.
          const declared = song.languages ?? [];
          const allLines = songBlocks.flatMap((b) => b.lines ?? []);
          const anchor = resolvePrimaryLanguage(allLines, declared[0]);
          // A song that has not recorded its languages yet still has them written into its
          // lyrics. Without this fallback every translation resolves to no slot at all, and a
          // style's per-language typography silently does nothing.
          songLanguages = declared.length
            ? anchor
              ? [anchor, ...declared.filter((code) => code.toUpperCase() !== anchor.toUpperCase())]
              : declared
            : inferSongLanguages(allLines);
          blocks = songBlocks.filter((b) => !b.copyright).map((b) => ({ name: b.name, lines: parseSongLines(b.lines || []) }));
        }
        break;
      }

      case 'bible_verse': {
        contentType = 'bible_verse';
        const verseText = item.label || item.bibleRef || '';
        const segments = item.bibleFormattedSegments || [];
        // One block per page: a line with only `---` starts the next one, like song blocks.
        blocks = versePages(item).map((page) => ({
          name: page.name,
          lines: page.lines.map((text) => {
            const lineStart = verseText.indexOf(text);
            const lineEnd = lineStart + text.length;
            const isBold = segments.some((s) => s.bold && s.start <= lineEnd && s.end >= lineStart);
            return { text, bold: isBold };
          }),
        }));
        break;
      }

      case 'media':
        // Only colour entries are drawn as the item. Images and videos play in their own media
        // layers, and audio on the operator's computer — the screens keep the group's look, with
        // no text, like a song between slides.
        contentType = item.mediaSubType === 'color' ? 'media' : 'song';
        break;
    }
  }

  const licenseNumber = song ? (song.account ?? undefined) : undefined;
  return { contentType, blocks, title, copyright, authors, licenseNumber, songLanguages };
}

/**
 * The first semantic group of the next slide — its first primary line plus the translations that
 * follow it — when the style shows the next-line preview.
 */
export function nextBlockPreviewLines(
  parts: ItemContentParts,
  blockIndex: number,
  style: ResolvedStyle,
  nextLinePreviewSetting: boolean,
): PresentationLine[] | undefined {
  if (!resolveNextLinePreview(style, nextLinePreviewSetting).enabled) return undefined;
  if (parts.contentType !== 'song' || parts.blocks.length === 0) return undefined;
  const next = parts.blocks[blockIndex + 1];
  if (!next || next.lines.length === 0) return undefined;
  const primary = parts.songLanguages?.[0]?.toUpperCase();
  const isAnchor = (line: PresentationLine) => !line.language || (!!primary && line.language.toUpperCase() === primary);
  const group: PresentationLine[] = [];
  for (const line of next.lines) {
    if (isAnchor(line) && group.length > 0) break; // stop at the second anchor line
    group.push(line);
  }
  return group;
}

export interface ContentPlacement {
  item?: ShowItem;
  songNumber?: number;
  blockIndex: number;
  lineIndex: number;
  style: ResolvedStyle;
  isBlack: boolean;
  hideText: boolean;
  nextLinePreview: boolean;
  transitionMode?: 'cut' | 'fade';
  transitionDuration?: number;
  showLicenseNumber?: boolean;
  /** Label in front of the license number, e.g. "License". */
  licenseLabel: string;
}

/** The content for one slide of a parsed item, as every window starts from before its group applies. */
export function contentForItem(parts: ItemContentParts, at: ContentPlacement): PresentationContent {
  const item = at.item;
  return {
    contentType: parts.contentType,
    displayMode: 'normal',
    activeBlockIndex: at.blockIndex,
    activeLineIndex: at.lineIndex,
    blocks: parts.blocks,
    songLanguages: parts.songLanguages,
    style: at.style,
    isBlack: at.isBlack,
    hideText: at.hideText,
    title: parts.title,
    songNumber: at.songNumber,
    songKey: item ? item.key || parseOrderKey(item.order).key : undefined,
    copyright: parts.copyright,
    authors: parts.authors,
    showLicenseNumber: at.showLicenseNumber,
    license: parts.licenseNumber ? `${at.licenseLabel}: #${parts.licenseNumber}` : undefined,
    showCopyright:
      parts.contentType === 'song' && (!!parts.copyright || !!parts.authors || !!parts.title) && at.blockIndex >= parts.blocks.length,
    mediaSubType: item?.mediaSubType === 'color' ? 'color' : undefined,
    mediaPath: undefined,
    mediaColor: item?.mediaColor,
    mediaObjectFit: item?.mediaObjectFit,
    mediaObjectPosition: item?.mediaObjectPosition,
    mediaZoom: item?.mediaZoom,
    mediaBlur: item?.mediaBlur,
    mediaAutoplay: item?.mediaAutoplay,
    mediaLoop: item?.mediaLoop,
    bibleRef: item?.bibleRef,
    bibleTranslation: item?.bibleTranslation,
    nextBlockPreviewLines: nextBlockPreviewLines(parts, at.blockIndex, at.style, at.nextLinePreview),
    transitionMode: at.transitionMode,
    transitionDuration: at.transitionDuration,
  };
}
