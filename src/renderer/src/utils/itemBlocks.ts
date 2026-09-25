/**
 * The navigable blocks of a show item, independent of its type: a song's sections for its
 * arrangement, a Bible verse's pages. Keyboard, remote and companion navigation and the operator
 * view all count through here, so a verse split with `---` steps page by page like a song.
 */
import type { ShowItem } from '@/api/shows.api';
import { SONG_BLOCK_SEPARATOR } from '@/song';

export interface ItemBlock {
  name: string;
  lines: string[];
}

interface BlockSource {
  getBlocks: (order: string) => { name: string; copyright: boolean }[];
}

/**
 * A verse's text split into pages at lines holding only `---`, named like split song blocks:
 * "Psalm 23", "Psalm 23 (2)". Empty pages are dropped; a verse without text shows its reference.
 */
export const versePages = (item: ShowItem): ItemBlock[] => {
  const name = item.bibleRef || item.label || '';
  const pages: string[][] = [[]];
  for (const line of (item.label || item.bibleRef || '').split('\n')) {
    if (line.trim() === SONG_BLOCK_SEPARATOR) pages.push([]);
    else pages[pages.length - 1].push(line);
  }
  const filled = pages.filter((page) => page.some((line) => line.trim()));
  return (filled.length ? filled : [[name]]).map((lines, index) => ({ name: index === 0 ? name : `${name} (${index + 1})`, lines }));
};

/**
 * How many blocks the item steps through. Songs count every block of the arrangement including
 * the copyright slide (as navigation always has); verses count their pages; media has none.
 */
export const navigableBlockCount = (item: ShowItem | undefined, song: BlockSource | undefined, orderName: string): number => {
  if (song) return song.getBlocks(orderName).length;
  if (item?.type === 'bible_verse') return versePages(item).length;
  return 0;
};
