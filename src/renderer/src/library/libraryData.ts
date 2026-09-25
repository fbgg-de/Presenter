/**
 * Library entries as data: what is saved when a group or media entry goes into the library, how
 * an entry becomes part of a show again, and what the library shows about an entry.
 *
 * Adding copies: the group and every entry get new ids, and a media version mapped to a song of
 * the group follows the copy of that song. Nothing added ever points back at the library or at
 * the show it came from.
 *
 * Dependency-free on purpose (types only), so the tests can bundle it alone.
 */
import type { ShowGroup, ShowItem } from '@/api/shows.api';
import type { LibraryData, PastGroup } from '@/api/library.api';

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_GROUP_ID = 'default';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** An agenda group and its entries, as saved. */
export function groupLibraryData(group: ShowGroup, order: ShowItem[]): LibraryData {
  const items = order.filter((item) => (item.groupId ?? DEFAULT_GROUP_ID) === group.id);
  return { group: clone({ ...group, collapsed: false }), items: clone(items) };
}

/** One media entry, as saved. */
export const mediaLibraryData = (item: ShowItem): LibraryData => ({ items: [clone({ ...item, groupId: undefined })] });

/** The media file paths an entry uses, for the missing-file check. */
export function mediaPathsOf(items: ShowItem[]): string[] {
  const paths = new Set<string>();
  for (const item of items) {
    if (item.type !== 'media') continue;
    for (const version of item.media?.versions ?? []) for (const source of version.sources) paths.add(source.path);
    if (!item.media && item.mediaPath) paths.add(item.mediaPath);
  }
  return [...paths];
}

export interface LibrarySummary {
  songs: number;
  videos: number;
  images: number;
  slideshows: number;
  audio: number;
  verses: number;
}

export function summariseItems(items: ShowItem[]): LibrarySummary {
  const summary: LibrarySummary = { songs: 0, videos: 0, images: 0, slideshows: 0, audio: 0, verses: 0 };
  for (const item of items) {
    if (item.type === 'song') summary.songs++;
    else if (item.type === 'bible_verse') summary.verses++;
    else if (item.mediaSubType === 'video') summary.videos++;
    else if (item.mediaSubType === 'image') summary.images++;
    else if (item.mediaSubType === 'slideshow') summary.slideshows++;
    else if (item.mediaSubType === 'audio') summary.audio++;
  }
  return summary;
}

/**
 * Fresh copies of saved entries: new ids for every entry, and song mappings pointing at the copies
 * of their songs. `groupId` is the group they join.
 */
export function copyItems(items: ShowItem[], groupId: string): ShowItem[] {
  const idMap = new Map<string, string>();
  const copies = items.map((item) => {
    const copy = clone(item);
    const id = newId('i_');
    if (item.id) idMap.set(item.id, id);
    return { ...copy, id, groupId };
  });
  for (const copy of copies) {
    for (const version of copy.media?.versions ?? []) {
      const songItemId = version.lyrics?.songItemId;
      if (!version.lyrics || !songItemId) continue;
      // A mapping to a song that did not come along is dropped: it would follow nothing.
      if (idMap.has(songItemId)) version.lyrics.songItemId = idMap.get(songItemId);
      else delete version.lyrics;
    }
  }
  return copies;
}

/** A saved group as a new group of a show, with a name no other group of the show has. */
export function copyGroup(data: LibraryData, existing: ShowGroup[], fallbackName: string): { group: ShowGroup; items: ShowItem[] } {
  const source = data.group ?? { id: DEFAULT_GROUP_ID, name: fallbackName };
  const taken = new Set(existing.map((group) => group.name));
  const base = source.name || fallbackName;
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  const group: ShowGroup = { ...clone(source), id: newId('g_'), name, collapsed: false };
  return { group, items: copyItems(data.items, group.id) };
}

/**
 * Add a copied group to a show: after the group `afterGroupId` (its block of entries), else at the
 * end. Keeps every group's entries contiguous, as the agenda expects.
 */
export function insertGroup(
  order: ShowItem[],
  groups: ShowGroup[],
  copy: { group: ShowGroup; items: ShowItem[] },
  afterGroupId?: string,
): { order: ShowItem[]; groups: ShowGroup[] } {
  const at = afterGroupId !== undefined ? groups.findIndex((group) => group.id === afterGroupId) : -1;
  const nextGroups = at >= 0 ? [...groups.slice(0, at + 1), copy.group, ...groups.slice(at + 1)] : [...groups, copy.group];
  const position = new Map(nextGroups.map((group, index) => [group.id, index]));
  const rank = (item: ShowItem) => position.get(item.groupId ?? DEFAULT_GROUP_ID) ?? nextGroups.length;
  // A stable sort by group keeps the order inside every group.
  const nextOrder = [...order, ...copy.items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
  return { order: nextOrder, groups: nextGroups };
}

export interface SongMediaSuggestion {
  showTitle: string;
  date: string;
  items: ShowItem[];
}

/**
 * What a song was used with last time: the media entries of its agenda group in the most recent
 * past show that had it. Entries whose files are already in the show are left out.
 */
export function songMediaSuggestion(pastGroups: PastGroup[], songNumber: number, showItems: ShowItem[]): SongMediaSuggestion | undefined {
  const inShow = new Set(mediaPathsOf(showItems));
  const past = [...pastGroups]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((entry) => entry.items.some((item) => item.type === 'song' && item.songNumber === songNumber));
  if (!past) return undefined;
  const items = past.items.filter((item) => {
    if (item.type !== 'media' || item.mediaSubType === 'color') return false;
    const paths = mediaPathsOf([item]);
    return paths.length > 0 && !paths.every((path) => inShow.has(path));
  });
  return items.length ? { showTitle: past.showTitle, date: past.date, items } : undefined;
}
