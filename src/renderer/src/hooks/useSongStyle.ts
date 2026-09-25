/**
 * The look a song has on screen while it is being edited: the theme of the agenda group it sits in
 * when it is part of the open show, else the show's and the account's. Used for the block preview
 * and for warning about lines that would not fit.
 */
import { useMemo } from 'react';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { lookInputFor, resolveLook } from '@/look/resolveLook';
import type { ResolvedStyle } from '@/utils/styleUtils';

export function useSongStyle(songNumber: number): ResolvedStyle {
  const { globalStyleId } = useGetSettings('globalStyleId');
  const { currentShow } = useGetShow();
  const { data: styles } = useGetStylesQuery();

  return useMemo(() => {
    const item = currentShow?.order.find((entry) => entry.type === 'song' && entry.songNumber === songNumber);
    return resolveLook(lookInputFor({ globalStyleId, show: currentShow, item, styles })).style;
  }, [songNumber, currentShow, globalStyleId, styles]);
}
