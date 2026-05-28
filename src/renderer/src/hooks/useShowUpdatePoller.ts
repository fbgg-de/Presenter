import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setCurrentShow, useGetShow } from '@/store/showSlice';
import { loadShowSongs } from '@/store/songsSlice';
import { useGetShowsQuery } from '@/api/shows.api';
import type { Show } from '@/api/shows.api';

const POLL_INTERVAL_MS = 30_000;

const normalizeOrderSig = (show: Show | null | undefined): string => {
  const normalized = (show?.order ?? []).map((item) => {
    const entries = Object.entries(item as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  });
  return JSON.stringify(normalized);
};

/**
 * Polls the server every 30 s for changes to the currently loaded show.
 * When the server version of the show's order differs from the local snapshot
 * (i.e. what was last loaded from the server), the returned `updateAvailable`
 * flag is set to `true`.
 *
 * Calling `reloadShow()` applies the server version and resets the flag.
 * Calling `dismiss()` clears the flag without reloading.
 */
export const useShowUpdatePoller = () => {
  const dispatch = useAppDispatch();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { serverSnapshot } = useAppSelector((s) => s.show);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const { data: polledShowsData } = useGetShowsQuery(
    { limit: 9999, page: 0 },
    { pollingInterval: POLL_INTERVAL_MS, skip: !currentShow || isShowSelectorOpen },
  );

  useEffect(() => {
    if (!currentShow || !polledShowsData) return;
    const polledShow: Show | undefined = polledShowsData.shows?.find((s: Show) => s.title === currentShow.title);
    if (!polledShow) return;

    const polledSig = normalizeOrderSig(polledShow);
    const snapshotSig = normalizeOrderSig(serverSnapshot ?? currentShow);
    if (polledSig !== snapshotSig) {
      setUpdateAvailable(true);
    }
  }, [polledShowsData, currentShow, serverSnapshot]);

  const reloadShow = async () => {
    setUpdateAvailable(false);
    if (!currentShow || !polledShowsData) return;
    const polled: Show | undefined = polledShowsData.shows?.find((s: Show) => s.title === currentShow.title);
    if (polled) {
      dispatch(setCurrentShow(polled));
      await dispatch(loadShowSongs(polled));
    }
  };

  const dismiss = () => setUpdateAvailable(false);

  return { updateAvailable, reloadShow, dismiss };
};

