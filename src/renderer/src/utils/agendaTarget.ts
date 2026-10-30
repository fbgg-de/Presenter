import type { ShowItem } from '@/api/shows.api';
import type { ISong } from '@/song';
import { mediaItemLabel } from '@/media/mediaItem';

/** What an agenda entry is called on a Companion button and the remote. */
export const itemTitle = (item: ShowItem | undefined, songs: Record<number, ISong>): string => {
  if (!item) return '';
  if (item.type === 'song')
    return (item.songNumber != null ? songs[item.songNumber]?.title : undefined) ?? item.label ?? `#${item.songNumber ?? ''}`;
  if (item.type === 'bible_verse') return item.bibleRef || item.label || '';
  return mediaItemLabel(item);
};

/**
 * Which agenda entry a `set_item` means. By id first — the same entry even after the agenda was
 * reordered — then by title, so a button made last week still finds "Ankündigungen" in this
 * week's show (where it has a new id), then by position. ProPresenter's API resolves items the
 * same way (name, index or UUID). Returns null when nothing matches.
 */
export function findAgendaIndex(
  order: ShowItem[],
  songs: Record<number, ISong>,
  target: { index?: unknown; id?: unknown; title?: unknown } | undefined,
): number | null {
  if (!target) return null;
  if (typeof target.id === 'string' && target.id) {
    const byId = order.findIndex((item) => item.id === target.id);
    if (byId >= 0) return byId;
  }
  if (typeof target.title === 'string' && target.title.trim()) {
    const wanted = target.title.trim().toLocaleLowerCase();
    const byTitle = order.findIndex((item) => itemTitle(item, songs).trim().toLocaleLowerCase() === wanted);
    if (byTitle >= 0) return byTitle;
  }
  const index = typeof target.index === 'string' && target.index.trim() ? Number(target.index) : target.index;
  if (typeof index === 'number' && Number.isFinite(index) && order.length > 0) {
    return Math.max(0, Math.min(Math.floor(index), order.length - 1));
  }
  return null;
}

const normalise = (text: string | null | undefined): string =>
  (text ?? '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Take planned durations from a ChurchTools agenda: a song entry matches an agenda song by title,
 * any entry matches an agenda entry by title. Each agenda entry is used once, in order, so two
 * "Lobpreis" blocks pair up with the two in the agenda. Headers and entries without a duration
 * are skipped; show entries without a match keep what they had.
 */
export function matchAgendaDurations(
  order: ShowItem[],
  songs: Record<number, ISong>,
  agenda: { title: string; type: string; duration: number; songTitle: string | null }[],
): { order: ShowItem[]; matched: number } {
  const used = new Set<number>();
  let matched = 0;
  const next = order.map((item) => {
    const title = normalise(itemTitle(item, songs));
    if (!title) return item;
    const hit = agenda.findIndex(
      (entry, i) =>
        !used.has(i) &&
        entry.type !== 'header' &&
        entry.duration > 0 &&
        (normalise(entry.title) === title || (item.type === 'song' && normalise(entry.songTitle) === title)),
    );
    if (hit < 0) return item;
    used.add(hit);
    matched++;
    return { ...item, plannedDuration: agenda[hit].duration };
  });
  return { order: next, matched };
}
