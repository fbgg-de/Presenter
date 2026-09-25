import { useMemo } from 'react';
import { useAppSelector } from '@/store';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { lookInputFor, lookVariesByGroup, resolveLook } from '@/look/resolveLook';
import { contentForItem, itemContentParts } from '@/presentation/itemContent';
import { applyScreenGroup } from '@/presentation/groupContent';
import { usePlaybacks } from '@/media/playback';
import { previewMedia } from '@/media/previewMedia';
import type { PresentationContent } from '@/presentation/types';

/**
 * The content a screen group's windows would show for one slide of one show item — built by the
 * same functions as the real broadcast, but for any item and slide and without sending anything.
 * Black and hidden text are left out — a preview is for looking at the slide itself — unless
 * `live` asks for them (the Program monitor).
 */
export function usePreviewContent(
  itemIndex: number,
  blockIndex: number,
  groupId: number | undefined,
  /** The Program monitor: black and hidden text as the screens have them. */
  live?: { isBlack: boolean; hideText: boolean },
): { content: PresentationContent | undefined; slideCount: number; slideName?: string } {
  const { LL } = useI18nContext();
  const { globalStyleId, nextLinePreview, showLicenseNumber, offlineMode, cachedStyles } = useGetSettings(
    'globalStyleId',
    'nextLinePreview',
    'showLicenseNumber',
    'offlineMode',
    'cachedStyles',
  );
  const { currentShow } = useGetShow();
  const { songs } = useGetSongs();
  const { data: fetchedStyles } = useGetStylesQuery(undefined, { skip: offlineMode });
  const { data: groups = [] } = useGetScreenGroupsQuery();
  const styles = offlineMode ? (cachedStyles as typeof fetchedStyles) : fetchedStyles;
  const playbacks = usePlaybacks();

  const item = currentShow?.order?.[itemIndex];
  const song = item?.type === 'song' && item.songNumber != null ? songs[item.songNumber] : undefined;
  const orderName = useAppSelector((state) => (song ? selectCurrentSongOrder(state, song.songNumber) : 'Default'));

  const parts = useMemo(() => itemContentParts(item, song, orderName), [item, song, orderName]);

  const input = useMemo(
    () =>
      lookInputFor({
        globalStyleId,
        show: currentShow,
        item,
        styles,
      }),
    [globalStyleId, currentShow, item, styles],
  );

  // A media entry previewed plays on a clock of its own, started when it was picked.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new clock per entry and group only
  const startedAt = useMemo(() => Date.now(), [itemIndex, groupId, item?.media?.versionId]);
  const media = useMemo(
    () => previewMedia({ show: currentShow, itemIndex, groupId, groups, playbacks, startedAt }),
    [currentShow, itemIndex, groupId, groups, playbacks, startedAt],
  );

  const content = useMemo(() => {
    if (!item) return undefined;
    const groupKey = groupId !== undefined && lookVariesByGroup(input) ? String(groupId) : undefined;
    const style = resolveLook(input, groupKey).style;
    const base = contentForItem(parts, {
      item,
      songNumber: item.songNumber,
      blockIndex,
      lineIndex: 0,
      style,
      isBlack: live?.isBlack ?? false,
      hideText: live?.hideText ?? false,
      nextLinePreview,
      transitionMode: 'cut',
      showLicenseNumber,
      licenseLabel: LL.AUTH.LICENSE(),
    });
    return applyScreenGroup(base, groups, groupId, { media });
  }, [item, input, groupId, parts, blockIndex, nextLinePreview, showLicenseNumber, groups, media, LL, live?.isBlack, live?.hideText]);

  return { content, slideCount: parts.blocks.length, slideName: parts.blocks[blockIndex]?.name };
}
