import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '@/store';
import { updateSongInStore, useGetSongs } from '@/store/songsSlice';
import { useGetShow } from '@/store/showSlice';
import { useGetSongsRevisionQuery, songsApi } from '@/api/songs.api';
import { useGetSessionQuery } from '@/api/session.api';
import { useGetSettings } from '@/store/settingsSlice';
import { Song, type ISong } from '@/song';
import type { SongEntity } from '@/api/songs.api';

const POLL_INTERVAL_MS = 60_000;

/** Content signature of a song — everything that affects what is presented/played. */
const songContentSig = (
  s: Pick<ISong, 'title' | 'initialOrder' | 'order' | 'blocks'> & Partial<Pick<ISong, 'authors' | 'copyright'>>,
): string =>
  JSON.stringify({
    title: s.title,
    initialOrder: s.initialOrder ?? [],
    order: s.order ?? {},
    blocks: s.blocks ?? {},
    authors: s.authors ?? '',
    copyright: s.copyright ?? '',
  });

/**
 * Polls the server for changes to songs referenced by the current show and flags songs
 * whose server copy is newer than the locally cached one (localStorage/redux cache).
 *
 * Cheap by design: a lightweight `SongsRevision` feed (songNumber + updated_at) is polled;
 * a song's full payload is fetched only when its timestamp actually changes. The fetched
 * content is compared against the cache so *our own* save (already in the cache) silently
 * adopts the new timestamp instead of raising a false "updated" flag.
 *
 * - `updatedSongNumbers` — songs with newer, materially different server versions.
 * - `reloadSong(n)`      — fetch the server version into the cache and clear the flag.
 *
 * With `autoReload` enabled a foreign edit is adopted into the cache immediately and never
 * flagged — used by the musician auto-refresh mode and by the operator while it follows
 * remote commands.
 */
export const useSongUpdatePoller = ({ autoReload = false }: { autoReload?: boolean } = {}) => {
  const dispatch = useAppDispatch();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { songs } = useGetSongs();

  const { offlineMode } = useGetSettings();
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const isAuthenticated = !offlineMode && session?.isAuthenticated === true;

  /** songNumber → server date of a confirmed foreign update */
  const [updatedSongs, setUpdatedSongs] = useState<Record<number, string>>({});
  /** songNumber → last server date we classified (avoids re-fetch loops) */
  const classifiedRef = useRef<Record<number, string>>({});
  // Read inside the classification callback so toggling the mode doesn't re-run the effect.
  const autoReloadRef = useRef(autoReload);
  autoReloadRef.current = autoReload;

  const { data: revisionData } = useGetSongsRevisionQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skip: !currentShow || isShowSelectorOpen || !isAuthenticated,
  });

  // Keep latest songs in a ref so the classification effect doesn't re-run on every cache write.
  const songsRef = useRef(songs);
  songsRef.current = songs;

  useEffect(() => {
    if (!revisionData?.songs || !currentShow?.order) return;

    const revByNumber = new Map<number, string>();
    for (const r of revisionData.songs) {
      if (typeof r.songNumber === 'number' && r.date) revByNumber.set(r.songNumber, r.date);
    }

    const showSongNumbers = new Set<number>();
    for (const item of currentShow.order) {
      if (item.type === 'song' && item.songNumber != null) showSongNumbers.add(item.songNumber);
    }

    for (const num of showSongNumbers) {
      const cached = songsRef.current[num];
      const serverDate = revByNumber.get(num);
      if (!cached || !serverDate) continue;
      if (classifiedRef.current[num] === serverDate) continue;

      // Timestamps match → nothing changed on the server since our copy.
      if (cached.updatedAt && cached.updatedAt === serverDate) {
        classifiedRef.current[num] = serverDate;
        continue;
      }

      // Timestamp differs (or our cache predates timestamps) — fetch the song once and
      // classify by content: identical content = our own save / cosmetic touch → adopt
      // the timestamp silently; different content = foreign edit → flag it.
      classifiedRef.current[num] = serverDate;
      void dispatch(songsApi.endpoints.getSong.initiate({ songNumber: num }, { forceRefetch: true }))
        .then((result) => {
          const data = 'data' in result ? (result as { data?: SongEntity }).data : undefined;
          if (!data || !data.songNumber) return;
          const current = songsRef.current[num];
          if (!current) return;
          if (songContentSig(data as unknown as ISong) === songContentSig(current)) {
            // Same content — just record the server timestamp in the cache.
            dispatch(updateSongInStore(new Song({ ...current, updatedAt: data.updatedAt ?? serverDate })));
          } else if (autoReloadRef.current) {
            // Auto mode — the freshly fetched version is already here, adopt it silently.
            dispatch(updateSongInStore(new Song(data as unknown as ISong)));
          } else {
            setUpdatedSongs((prev) => ({ ...prev, [num]: serverDate }));
          }
        })
        .catch(() => {});
    }
  }, [revisionData, currentShow, dispatch]);

  /** Apply the server version of a song to the local cache and clear its flag. */
  const reloadSong = useCallback(
    async (songNumber: number) => {
      const result = await dispatch(songsApi.endpoints.getSong.initiate({ songNumber }, { forceRefetch: true }));
      const data = 'data' in result ? (result as { data?: SongEntity }).data : undefined;
      if (data && data.songNumber) {
        dispatch(updateSongInStore(new Song(data as unknown as ISong)));
      }
      setUpdatedSongs((prev) => {
        const next = { ...prev };
        delete next[songNumber];
        return next;
      });
    },
    [dispatch],
  );

  const dismissSong = useCallback((songNumber: number) => {
    setUpdatedSongs((prev) => {
      const next = { ...prev };
      delete next[songNumber];
      return next;
    });
  }, []);

  return {
    /** Song numbers with a newer, materially different version on the server. */
    updatedSongNumbers: updatedSongs,
    reloadSong,
    dismissSong,
  };
};
