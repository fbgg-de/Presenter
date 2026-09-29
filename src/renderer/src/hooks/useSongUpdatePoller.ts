import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useAppDispatch } from '@/store';
import { updateSongInStore, useGetSongs } from '@/store/songsSlice';
import { useGetShow } from '@/store/showSlice';
import { useGetSongsRevisionQuery, songsApi } from '@/api/songs.api';
import { useGetSessionQuery } from '@/api/session.api';
import { useGetSettings } from '@/store/settingsSlice';
import { Song, type ISong } from '@/song';
import { queueSongFetch } from '@/utils/taskQueue';

const POLL_INTERVAL_MS = 60_000;
const RETRY_DELAY_MS = 10_000;
const songContentSig = (song: Partial<ISong>): string =>
  JSON.stringify({
    title: song.title,
    initialOrder: song.initialOrder ?? [],
    order: song.order ?? {},
    blocks: song.blocks ?? {},
    authors: song.authors ?? '',
    copyright: song.copyright ?? '',
    languages: song.languages ?? [],
  });

/** Retry failed revisions and keep update warnings until a reload actually succeeds. */
export const useSongUpdatePoller = ({ autoReload = false }: { autoReload?: boolean } = {}) => {
  const dispatch = useAppDispatch();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { songs } = useGetSongs();
  const { offlineMode, backendUrl } = useGetSettings('offlineMode', 'backendUrl');
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const enabled = !!currentShow && !isShowSelectorOpen && !offlineMode && session?.isAuthenticated === true;
  const scope = JSON.stringify([session?.account, backendUrl, currentShow?.title, enabled]);
  const latest = useRef({ scope, autoReload });
  useLayoutEffect(() => {
    latest.current = { scope, autoReload };
  }, [scope, autoReload]);
  const lifetime = useRef({ active: false });
  const classified = useRef<Record<number, string>>({});
  const manual = useRef(new Map<number, { scope: string; promise: Promise<boolean> }>());
  const [updatedSongs, setUpdatedSongs] = useState<Record<number, string>>({});
  const [retryTick, setRetryTick] = useState(0);
  const { data: revisionData } = useGetSongsRevisionQuery(undefined, { pollingInterval: POLL_INTERVAL_MS, skip: !enabled });
  // Only membership, not slide selection or a cache write, should restart the batch.
  const songNumbers = JSON.stringify(
    [
      ...new Set(
        (currentShow?.order ?? [])
          .filter((item) => item.type === 'song' && item.songNumber != null && songs[item.songNumber])
          .map((item) => item.songNumber!),
      ),
    ].sort((a, b) => a - b),
  );

  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    classified.current = {};
    setUpdatedSongs({});
    return () => {
      current.active = false;
    };
  }, [scope]);

  useEffect(() => {
    if (!enabled || !revisionData?.songs) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const generation = lifetime.current;
    const isCurrent = () => !cancelled && latest.current.scope === scope && generation.active;
    const numbers: number[] = JSON.parse(songNumbers);
    const revisions = new Map(revisionData.songs.map((entry) => [entry.songNumber, entry.date]));
    let failed = false;
    void Promise.all(
      numbers.map((num) =>
        queueSongFetch(async () => {
          if (!isCurrent()) return;
          const cached = store.getState().songs.songs[num];
          const date = revisions.get(num);
          if (!cached || !date || classified.current[num] === date) return;
          if (cached.updatedAt === date) {
            classified.current[num] = date;
            return;
          }
          try {
            const data = await dispatch(
              songsApi.endpoints.getSong.initiate({ songNumber: num }, { forceRefetch: true, subscribe: false }),
            ).unwrap();
            if (!isCurrent()) return;
            if (!data || data.songNumber !== num) throw new Error('Song missing from response');
            const current = store.getState().songs.songs[num];
            // A local save completed during this read. Recheck instead of replacing it.
            if (current !== cached) {
              failed = true;
              return;
            }
            classified.current[num] = date;
            if (songContentSig(data) === songContentSig(current)) {
              dispatch(updateSongInStore(new Song({ ...current, updatedAt: data.updatedAt ?? date })));
            } else if (latest.current.autoReload) {
              dispatch(updateSongInStore(new Song(data as ISong)));
            } else {
              setUpdatedSongs((previous) => ({ ...previous, [num]: date }));
              return;
            }
            setUpdatedSongs((previous) => {
              const next = { ...previous };
              delete next[num];
              return next;
            });
          } catch {
            if (isCurrent()) failed = true;
          }
        }),
      ),
    ).then(() => {
      if (isCurrent() && failed)
        timer = setTimeout(() => {
          if (isCurrent()) setRetryTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dispatch, enabled, scope, songNumbers, revisionData, retryTick]);

  const reloadSong = useCallback(
    (songNumber: number): Promise<boolean> => {
      if (!enabled) return Promise.resolve(false);
      const pending = manual.current.get(songNumber);
      if (pending?.scope === scope) return pending.promise;
      const generation = lifetime.current;
      const cached = store.getState().songs.songs[songNumber];
      const isCurrent = () => latest.current.scope === scope && generation.active && store.getState().songs.songs[songNumber] === cached;
      const promise = queueSongFetch(async () => {
        if (!isCurrent()) return false;
        try {
          const data = await dispatch(
            songsApi.endpoints.getSong.initiate({ songNumber }, { forceRefetch: true, subscribe: false }),
          ).unwrap();
          if (!isCurrent() || !data || data.songNumber !== songNumber) return false;
          dispatch(updateSongInStore(new Song(data as ISong)));
          setUpdatedSongs((previous) => {
            const next = { ...previous };
            delete next[songNumber];
            return next;
          });
          return true;
        } catch {
          return false;
        }
      });
      manual.current.set(songNumber, { scope, promise });
      void promise.finally(() => {
        if (manual.current.get(songNumber)?.promise === promise) manual.current.delete(songNumber);
      });
      return promise;
    },
    [dispatch, enabled, scope],
  );

  const dismissSong = useCallback((songNumber: number) => {
    setUpdatedSongs((previous) => {
      const next = { ...previous };
      delete next[songNumber];
      return next;
    });
  }, []);
  return { updatedSongNumbers: updatedSongs, reloadSong, dismissSong };
};
