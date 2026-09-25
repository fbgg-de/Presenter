import { useMemo } from 'react';
import { useAppSelector } from '@/store';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { lookInputFor, type LookInput } from '@/look/resolveLook';

/**
 * The look of the active show item, for the operator view — group monitors, layer bar,
 * inspector and slide markers. `itemIndex` asks for another entry (one opened in the agenda).
 *
 * The presentation windows get theirs from usePresentationSync, which also falls back to the
 * offline caches; this one reads the live queries.
 */
export function useActiveLook(itemIndex?: number) {
  const { globalStyleId } = useGetSettings('globalStyleId');
  const { currentShow } = useGetShow();
  // Only the entry: following the live slide re-rendered the inspector on every slide change.
  const index = useAppSelector((state) => itemIndex ?? state.presentation.activeItemIndex);
  const { songs } = useGetSongs();
  const { data: styles } = useGetStylesQuery();

  const item = currentShow?.order?.[index];
  const song = item?.type === 'song' && item.songNumber != null ? songs[item.songNumber] : undefined;
  const orderName = useAppSelector((state) => (song ? selectCurrentSongOrder(state, song.songNumber) : 'Default'));

  // Lyric blocks without the copyright slide — the indices the presentation navigates.
  const allBlocks = useMemo(() => (song ? song.getBlocks(orderName) : []), [song, orderName]);
  const blocks = useMemo(() => allBlocks.filter((block) => !block.copyright), [allBlocks]);
  // The credits slide's index among the slides the operator steps through, if the song has one.
  const copyrightIndex = allBlocks.findIndex((block) => block.copyright);

  const input = useMemo<LookInput>(
    () =>
      lookInputFor({
        globalStyleId,
        show: currentShow,
        item,
        styles,
      }),
    [globalStyleId, currentShow, item, styles],
  );

  return { input, item, song, blocks, copyrightIndex: copyrightIndex >= 0 ? copyrightIndex : undefined };
}
