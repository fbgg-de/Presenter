import type { SongListItem } from '@/api/songs.api';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Build once per library response, not once per row on every keystroke. */
export const indexLibrarySongs = (songs: SongListItem[]) =>
  songs.map((song) => ({ song, text: normalize(`${song.title}\n${song.songNumber}\n${song.authors ?? ''}`) }));

export function searchLibrarySongs(index: ReturnType<typeof indexLibrarySongs>, query: string): SongListItem[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return index.filter(({ text }) => terms.every((term) => text.includes(term))).map(({ song }) => song);
}

/** Do not silently renumber to a truncated decimal, exponent, or unsafe integer. */
export function parseCcliNumber(input: string, minimum: number): number | undefined {
  if (!/^\d+$/.test(input.trim())) return undefined;
  const number = Number(input.trim());
  return Number.isSafeInteger(number) && number >= minimum ? number : undefined;
}
