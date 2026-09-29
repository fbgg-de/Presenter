import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useAppDispatch } from '@/store';
import { setCurrentShow, useGetShow } from '@/store/showSlice';
import { loadShowSongs } from '@/store/songsSlice';
import { useGetShowsRevisionQuery, showsApi } from '@/api/shows.api';
import { useGetSessionQuery } from '@/api/session.api';
import { useGetSettings } from '@/store/settingsSlice';
import { normalizeOrderSig } from '@/utils/syncProtocol';

const POLL_INTERVAL_MS = 30_000;
const RETRY_DELAY_MS = 10_000;

/** Classify revisions after a successful read; ignore responses from a previous show/session. */
export const useShowUpdatePoller = ({ autoReload = false }: { autoReload?: boolean } = {}) => {
  const dispatch = useAppDispatch();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { offlineMode, backendUrl } = useGetSettings('offlineMode', 'backendUrl');
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const enabled = !!currentShow && !isShowSelectorOpen && !offlineMode && session?.isAuthenticated === true;
  const title = currentShow?.title;
  const scope = JSON.stringify([session?.account, backendUrl, title, enabled]);
  const latest = useRef({ scope, autoReload });
  useLayoutEffect(() => {
    latest.current = { scope, autoReload };
  }, [scope, autoReload]);
  const lifetime = useRef({ active: false });
  const lastSeenDate = useRef<string | null>(null);
  const failures = useRef(0);
  const manual = useRef<{ scope: string; promise: Promise<boolean> } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const { data: revisionData } = useGetShowsRevisionQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skip: !enabled,
  });
  const revision = revisionData?.shows?.find((entry) => entry.title === title)?.date;
  const updatedAt = enabled ? (revision ?? null) : null;

  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    lastSeenDate.current = null;
    failures.current = 0;
    setUpdateAvailable(false);
    setReloadFailed(false);
    return () => {
      current.active = false;
    };
  }, [scope]);

  useEffect(() => {
    if (!enabled || !title || !revision) return;
    if (lastSeenDate.current === revision) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const generation = lifetime.current;
    const isCurrent = () =>
      !cancelled && latest.current.scope === scope && generation.active && store.getState().show.currentShow?.title === title;
    const request = dispatch(showsApi.endpoints.getShow.initiate({ title }, { forceRefetch: true, subscribe: false }));
    void request
      .unwrap()
      .then((data) => {
        if (!isCurrent()) return;
        if (manual.current?.scope === scope) return;
        const polled = data.shows?.find((show) => show.title === title);
        if (!polled) throw new Error('Show missing from response');
        lastSeenDate.current = revision;
        failures.current = 0;
        setReloadFailed(false);
        const local = store.getState().show;
        if (normalizeOrderSig(polled) === normalizeOrderSig(local.serverSnapshot ?? local.currentShow)) {
          setUpdateAvailable(false);
          return;
        }
        // A background refresh never discards a local edit, even in auto-follow mode.
        if (latest.current.autoReload && !local.isDirty) {
          dispatch(setCurrentShow(polled));
          void dispatch(loadShowSongs(polled));
          setUpdateAvailable(false);
        } else setUpdateAvailable(true);
      })
      .catch(() => {
        if (!isCurrent()) return;
        failures.current++;
        if (failures.current >= 2) setReloadFailed(true);
        timer = setTimeout(() => {
          if (isCurrent()) setRetryTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, title, revision, retryTick, scope, dispatch]);

  /** Coalesce repeated clicks and retain the update warning if the reload fails. */
  const reloadShow = useCallback(
    ({ forceSongs = false }: { forceSongs?: boolean } = {}): Promise<boolean> => {
      if (!enabled) return Promise.resolve(false);
      if (manual.current?.scope === scope) return manual.current.promise;
      const show = store.getState().show.currentShow;
      if (!show) return Promise.resolve(false);
      const generation = lifetime.current;
      const isCurrent = () => latest.current.scope === scope && generation.active && store.getState().show.currentShow === show;
      const promise = (async () => {
        try {
          const data = await dispatch(
            showsApi.endpoints.getShow.initiate({ title: show.title }, { forceRefetch: true, subscribe: false }),
          ).unwrap();
          if (!isCurrent()) return false;
          const polled = data.shows?.find((entry) => entry.title === show.title);
          if (!polled) throw new Error('Show missing from response');
          lastSeenDate.current = polled.date ?? lastSeenDate.current;
          failures.current = 0;
          setReloadFailed(false);
          setUpdateAvailable(false);
          dispatch(setCurrentShow(polled));
          await dispatch(loadShowSongs({ show: polled, forceRefetch: forceSongs }));
          return true;
        } catch {
          if (isCurrent()) setReloadFailed(true);
          return false;
        }
      })();
      manual.current = { scope, promise };
      void promise.finally(() => {
        if (manual.current?.promise === promise) manual.current = null;
      });
      return promise;
    },
    [dispatch, enabled, scope],
  );

  const dismiss = useCallback(() => setUpdateAvailable(false), []);
  return { updateAvailable, updatedAt, reloadShow, dismiss, reloadFailed };
};
