/**
 * How a media version and a song in the same agenda group follow each other.
 *
 * A version's timeline sections are mapped to the song's slides (`MediaLyricBinding.map`, keyed by
 * region id, valued by a lyric occurrence id or `clear`). With "lyrics follow the video" the song's
 * slide changes as the video plays into a mapped section; with "video follows the lyrics" moving
 * to a slide seeks the video to its section.
 *
 * The mapping belongs to one arrangement. When the song's slides change (another order, edited
 * lyrics) the signature no longer matches and nothing follows until the mapping is confirmed.
 *
 * Dependency-free on purpose.
 */
import { contains, lyricAt, lyricOccurrences } from './engine';
import type { MediaCue, MediaCueBinding, MediaLyricBinding, MediaRegion } from './types';

type Blocks = { name: string; lines?: unknown }[];

export const emptyLyricBinding = (songItemId: string, blocks: Blocks): MediaLyricBinding => ({
  songItemId,
  arrangement: lyricOccurrences(blocks).signature,
  map: {},
  followLyrics: true,
  followVideo: true,
});

/** The binding in the shape the timeline editor works with. */
export const timelineBinding = (version: MediaCue): MediaCueBinding => ({
  cueId: version.id,
  arrangement: version.lyrics?.arrangement,
  lyrics: version.lyrics?.map ?? {},
  followLyrics: version.lyrics?.followLyrics ?? true,
  followVideo: version.lyrics?.followVideo ?? true,
});

/** The timeline editor's binding written back onto the version. */
export const withTimelineBinding = (version: MediaCue, binding: MediaCueBinding): MediaCue => ({
  ...version,
  lyrics: version.lyrics
    ? {
        ...version.lyrics,
        arrangement: binding.arrangement,
        map: binding.lyrics,
        followLyrics: binding.followLyrics,
        followVideo: binding.followVideo,
      }
    : undefined,
});

/** Runtime arming by region id (`CueTransport.enabled`) over the saved `enabled` flag. */
type Armed = Record<string, boolean> | undefined;
const isArmed = (region: MediaRegion, armed: Armed) => armed?.[region.id] ?? region.enabled !== false;

/** The mapping without the regions that are disarmed — a wrongly placed one is switched off that way. */
const armedMap = (version: MediaCue, map: Record<string, string | 'clear'>, armed: Armed) =>
  Object.fromEntries(
    Object.entries(map).filter(([id]) => {
      const region = version.regions.find((r) => r.id === id);
      return !region || isArmed(region, armed);
    }),
  );

/** Whether the mapping was made for these slides. */
export const mappingMatches = (lyrics: MediaLyricBinding | undefined, blocks: Blocks): boolean =>
  !!lyrics && lyrics.arrangement === lyricOccurrences(blocks).signature;

/**
 * Disarmed regions (`armed`, the transport's runtime arming) are left out in both directions.
 *
 * Lyrics follow the video: the slide the video is at, as an index into `blocks`; -1 for a section
 * mapped to "clear"; undefined when no mapped section is playing or nothing may follow.
 */
export function slideForTime(version: MediaCue, time: number, blocks: Blocks, armed?: Armed): number | undefined {
  const lyrics = version.lyrics;
  if (!lyrics?.followVideo || !mappingMatches(lyrics, blocks)) return undefined;
  const map = armedMap(version, lyrics.map, armed);
  const section = lyricAt(version, time, map);
  const target = section && map[section.id];
  if (!target) return undefined;
  if (target === 'clear') return -1;
  return lyricOccurrences(blocks).blocks.find((block) => block.id === target)?.index;
}

/**
 * Video follows the lyrics: the section to seek to for the slide at `blockIndex`. The section the
 * video is already in wins, then the next one after the current time, then the first.
 */
export function sectionForSlide(
  version: MediaCue,
  blockIndex: number,
  time: number,
  blocks: Blocks,
  armed?: Armed,
): MediaRegion | undefined {
  const lyrics = version.lyrics;
  if (!lyrics?.followLyrics || !mappingMatches(lyrics, blocks)) return undefined;
  const id = lyricOccurrences(blocks).blocks[blockIndex]?.id;
  if (!id) return undefined;
  const matches = version.regions
    .filter((region) => region.kind !== 'pause' && lyrics.map[region.id] === id && isArmed(region, armed))
    .sort((a, b) => a.start - b.start);
  return matches.find((region) => contains(region, time)) ?? matches.find((region) => region.start >= time) ?? matches[0];
}
