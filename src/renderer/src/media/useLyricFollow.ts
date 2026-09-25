/**
 * Keeps a song and the media entries mapped to it in step (see `lyricFollow.ts`):
 *
 * - While a mapped entry plays and its song is the active item, the song's slide follows the video.
 * - When the operator moves to another slide of the song, the mapped entries seek to its section.
 * - Going to the song starts its mapped entries, when its agenda group says so ("start with song").
 *
 * Hosted beside the media host. `blocks` are the active song's slides without the copyright slide,
 * the same list the mapping was made against.
 */
import { useEffect, useRef } from 'react';
import type { Show } from '@/api/shows.api';
import type { ScreenGroupEntity } from '@/screens/types';
import { useAppDispatch } from '@/store';
import { setActiveBlockFromMedia, useGetPresentationSettings } from '@/store/presentationSlice';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import { advanceCue } from './engine';
import { groupMediaSettings } from './groupPlayback';
import { sectionForSlide, slideForTime } from './lyricFollow';
import { activeVersionOf, mediaItemDataOf } from './mediaItem';
import { commandPlayback, getPlaybacks, type Playback } from './playback';
import { playbackKeyOf, startItem } from './useMediaHost';

type Blocks = { name: string; lines?: unknown }[];

const FOLLOW_INTERVAL_MS = 100;

const clockOf = (playback: Playback) => advanceCue(playback.cue, playback.transport, Math.max(0, (Date.now() - playback.at) / 1000)).time;

/** The running entries mapped to a song entry. */
const boundTo = (songItemId: string | undefined) =>
  songItemId ? getPlaybacks().filter((p) => p.endsAt === undefined && p.cue.lyrics?.songItemId === songItemId) : [];

export function useLyricFollow({
  show,
  blocks,
  groups,
  fadeMs,
}: {
  show: Show | null;
  blocks: Blocks;
  groups: ScreenGroupEntity[];
  fadeMs: number;
}) {
  const dispatch = useAppDispatch();
  const { activeItemIndex, activeBlockIndex, blockChangeOrigin, blockChangeRevision } = useGetPresentationSettings(
    'activeItemIndex',
    'activeBlockIndex',
    'blockChangeOrigin',
    'blockChangeRevision',
  );
  const item = show?.order?.[activeItemIndex];
  const songItemId = item?.type === 'song' ? item.id : undefined;

  const latest = useRef({ show, blocks, groups, fadeMs, songItemId, activeBlockIndex });
  latest.current = { show, blocks, groups, fadeMs, songItemId, activeBlockIndex };

  // Lyrics follow the video.
  useEffect(() => {
    const timer = setInterval(() => {
      const { blocks: slides, songItemId: id, activeBlockIndex: current } = latest.current;
      for (const playback of boundTo(id)) {
        if (!playback.transport.playing) continue;
        const index = slideForTime(playback.cue, clockOf(playback), slides, playback.transport.enabled);
        if (index !== undefined && index !== current) {
          latest.current.activeBlockIndex = index;
          dispatch(setActiveBlockFromMedia(index));
          return;
        }
      }
    }, FOLLOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dispatch]);

  // The video follows the lyrics — only a slide change the operator made, never one the video made.
  useEffect(() => {
    if (blockChangeOrigin !== 'operator') return;
    const { blocks: slides, songItemId: id } = latest.current;
    for (const playback of boundTo(id)) {
      const section = sectionForSlide(playback.cue, activeBlockIndex, clockOf(playback), slides, playback.transport.enabled);
      if (section) commandPlayback(playback.key, { type: 'seek', time: section.start, navigate: true });
    }
    // A deliberate navigation revision triggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockChangeRevision]);

  // Start with the song.
  useEffect(() => {
    const { show: current, groups: screenGroups, fadeMs: fade, blocks: slides } = latest.current;
    if (!current || !songItemId || !item) return;
    const agendaGroupId = item.groupId ?? DEFAULT_GROUP_ID;
    const group = current.groups?.find((g) => g.id === agendaGroupId);
    if (!groupMediaSettings(group).startWithSong) return;
    void (async () => {
      for (let index = 0; index < current.order.length; index++) {
        const entry = current.order[index];
        if ((entry.groupId ?? DEFAULT_GROUP_ID) !== agendaGroupId) continue;
        const data = mediaItemDataOf(entry);
        if (!data || activeVersionOf(data).lyrics?.songItemId !== songItemId) continue;
        const key = playbackKeyOf(entry, index);
        const running = getPlaybacks().find((p) => p.key === key && p.endsAt === undefined);
        if (!running) await startItem(current, index, screenGroups, fade);
        const playback = getPlaybacks().find((p) => p.key === key && p.endsAt === undefined);
        const section =
          playback && sectionForSlide(playback.cue, latest.current.activeBlockIndex, clockOf(playback), slides, playback.transport.enabled);
        if (playback && section) commandPlayback(playback.key, { type: 'seek', time: section.start, navigate: true });
      }
    })();
    // Only going to the song starts its media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songItemId, show?.title]);
}
