import { useEffect, useRef, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setCurrentShow, useGetShow } from '@/store/showSlice';
import { loadShowSongs } from '@/store/songsSlice';
import { useGetShowsRevisionQuery, useLazyGetShowQuery } from '@/api/shows.api';
import { useGetSessionQuery } from '@/api/session.api';
import { useGetSettings } from '@/store/settingsSlice';
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
 * Polls the server every 30 s for changes to the currently loaded show and flags when
 * *someone else* changed it on the server.
 *
 * To keep the background poll cheap, it hits the lightweight `ShowsRevision` feed
 * (title + date only) rather than downloading every show's full `order` payload. The
 * full show is fetched **only when the server timestamp actually changes** — and then
 * its order is compared against our snapshot to tell our own save apart from a foreign
 * edit (so saving your own show never raises the banner).
 *
 * - `updateAvailable` — a newer, foreign version exists on the server.
 * - `updatedAt`        — the server timestamp of the loaded show (for relative display).
 * - `reloadShow()`     — apply the server version and reset the flag.
 * - `dismiss()`        — clear the flag without reloading.
 */
export const useShowUpdatePoller = () => {
  const dispatch = useAppDispatch();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { serverSnapshot } = useAppSelector((s) => s.show);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // The server timestamp last observed for the current show (avoids re-fetching the
  // full show unless it actually changed).
  const lastSeenDateRef = useRef<string | null>(null);
  const currentTitleRef = useRef<string | null>(null);

  const { offlineMode } = useGetSettings();
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const isAuthenticated = offlineMode || session?.isAuthenticated === true;

  const { data: revisionData } = useGetShowsRevisionQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skip: !currentShow || isShowSelectorOpen || !isAuthenticated,
  });
  const [fetchShow] = useLazyGetShowQuery();

  // Reset the baseline when the loaded show changes.
  useEffect(() => {
    if (currentShow?.title !== currentTitleRef.current) {
      currentTitleRef.current = currentShow?.title ?? null;
      lastSeenDateRef.current = null;
      setUpdateAvailable(false);
      setUpdatedAt(null);
    }
  }, [currentShow?.title]);

  useEffect(() => {
    if (!currentShow || !revisionData) return;
    const rev = revisionData.shows?.find((r) => r.title === currentShow.title);
    if (!rev) return;

    setUpdatedAt(rev.date ?? null);

    // Server timestamp unchanged since we last looked → nothing to do (cheap path).
    if (rev.date === lastSeenDateRef.current) return;
    lastSeenDateRef.current = rev.date ?? null;

    // Timestamp changed — fetch just this show and classify our own save vs a foreign edit.
    fetchShow({ title: currentShow.title })
      .unwrap()
      .then((data) => {
        const polledShow = data.shows?.[0];
        if (!polledShow) return;
        const polledSig = normalizeOrderSig(polledShow);
        const snapshotSig = normalizeOrderSig(serverSnapshot ?? currentShow);
        setUpdateAvailable(polledSig !== snapshotSig);
      })
      .catch(() => {});
  }, [revisionData, currentShow, serverSnapshot, fetchShow]);

  const reloadShow = async () => {
    setUpdateAvailable(false);
    if (!currentShow) return;
    const data = await fetchShow({ title: currentShow.title }).unwrap();
    const polled: Show | undefined = data.shows?.[0];
    if (polled) {
      lastSeenDateRef.current = polled.date ?? lastSeenDateRef.current;
      dispatch(setCurrentShow(polled));
      await dispatch(loadShowSongs(polled));
    }
  };

  const dismiss = () => setUpdateAvailable(false);

  return { updateAvailable, updatedAt, reloadShow, dismiss };
};
