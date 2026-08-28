import { useCallback } from 'react';
import { useAppDispatch } from '@/store';
import { addShowItem } from '@/store/showSlice';
import { addSongToStore, addToSongsOrder, useGetSongs } from '@/store/songsSlice';
import { useCreateSongMutation, useUpdateSongMutation } from '@/api/songs.api';
import { useLazyGetChurchToolsCcliDetailQuery } from '@/api/churchtools.api';
import { useMetrics } from '@/hooks/useMetrics';
import { Song, type ISong } from '@/song';
import type { ResolveImportLanguage } from '@/hooks/useImportLanguage';

export interface CcliImportResult {
  ok: boolean;
  /** The song already existed in the DB and could not be (re)created. */
  isDuplicate: boolean;
  /** Raw server message (for surfacing import errors). */
  serverMessage: string;
}

/**
 * Import a CCLI SongSelect suggestion into the local library and add it to the current show.
 *
 * The CCLI number doubles as the song number. Lyrics + author/copyright are resolved from the
 * CCLI detail endpoint (forced fresh, never a cached empty result). The import always goes through
 * the backend so the song is persisted to the DB (the local store is localStorage-backed and is
 * not a reliable signal for DB presence); if the row already exists the duplicate error is caught
 * and turned into a lyrics-enriching update. Shared by the operator and musician search views.
 */
export const useCcliSongImport = (resolveImportLanguage?: ResolveImportLanguage) => {
  const dispatch = useAppDispatch();
  const { songs } = useGetSongs();
  const [createSongMutation] = useCreateSongMutation();
  const [updateSongMutation] = useUpdateSongMutation();
  const [fetchCcliDetail] = useLazyGetChurchToolsCcliDetailQuery();
  const { trackEvent } = useMetrics();

  return useCallback(
    async (ccliNumber: number, name: string, meta?: { author?: string | null; copyright?: string | null }): Promise<CcliImportResult> => {
      // Resolve full metadata + lyrics. Force a fresh fetch (preferCacheValue=false) so a
      // previously-cached empty result never sticks. Author/copyright fall back to the search.
      let authors = meta?.author ?? '';
      let copyright = meta?.copyright ?? '';
      let blocks: Record<string, string[]> = {};
      let order: string[] = [];
      if (ccliNumber > 0) {
        try {
          const detail = await fetchCcliDetail({ songNumber: ccliNumber }, false).unwrap();
          if (detail.author) authors = detail.author;
          if (detail.copyright) copyright = detail.copyright;
          if (detail.blocks && Object.keys(detail.blocks).length > 0) {
            blocks = detail.blocks;
            order = detail.order ?? Object.keys(detail.blocks);
          }
        } catch (e) {
          console.warn('CCLI detail/lyrics fetch failed; importing metadata only:', e);
        }
      }
      const orderMap = { Default: order };
      const hasLyrics = Object.keys(blocks).length > 0;

      // Monitoring: record every CCLI import with whether lyrics were resolved + the block count.
      const trackLyricsImport = (committedSongNumber: number) => {
        if (ccliNumber <= 0) return;
        trackEvent('ccli_lyrics_imported', 'song', String(committedSongNumber), {
          ccli: ccliNumber,
          blocks: Object.keys(blocks).length,
          hasLyrics,
        });
      };

      // The song store is localStorage-backed, so a local hit is NOT a reliable signal that the
      // row exists in the DB. Always go through the backend so the import is persisted: create the
      // song, and if it already exists server-side (duplicate error) enrich it with the
      // freshly-fetched lyrics. The local copy is consulted only to avoid overwriting existing
      // lyrics with an empty import (e.g. when the CCLI detail fetch came back without lyrics).
      const existingLocal =
        ccliNumber > 0
          ? Object.values(songs).find(
              (s) => s.songNumber === ccliNumber || (s as ISong & { ccliNumber?: number }).ccliNumber === ccliNumber,
            )
          : undefined;
      const existingLocalHasLyrics = !!existingLocal?.blocks && Object.keys(existingLocal.blocks).length > 0;
      const title = existingLocal?.title || name;

      // Commit to the local store + current show. Only (over)write the song data when we actually
      // have lyrics, or the local copy has none to lose — never clobber existing lyrics.
      // CCLI lyrics arrive untagged, so the language is worked out from the text before the
      // song is stored. A clear result is applied silently; an ambiguous one asks, unless the
      // caller supplied no resolver, in which case the import proceeds untagged as before.
      let languages: string[] = [];
      if (hasLyrics && resolveImportLanguage) {
        const resolved = await resolveImportLanguage(blocks, title);
        if (!resolved) return { ok: false, isDuplicate: false, serverMessage: '' };
        blocks = resolved.blocks;
        languages = resolved.languages;
      }

      const commit = (committedSongNumber: number) => {
        if (hasLyrics || !existingLocalHasLyrics) {
          dispatch(
            addSongToStore(
              new Song({
                songNumber: committedSongNumber,
                title,
                authors,
                copyright,
                initialOrder: order,
                order: orderMap,
                blocks,
                languages,
              }),
            ),
          );
        }
        dispatch(addToSongsOrder(committedSongNumber));
        dispatch(addShowItem({ type: 'song', songNumber: committedSongNumber, order: 'Default' }));
      };

      try {
        const result = await createSongMutation({
          title,
          authors,
          copyright,
          initialOrder: order,
          order: orderMap,
          blocks,
          languages,
          ...(ccliNumber > 0 ? { songNumber: ccliNumber } : {}),
        }).unwrap();

        commit(result.songNumber);
        trackEvent('song_imported', 'song', String(result.songNumber), { source: 'ccli_songselect' });
        trackLyricsImport(result.songNumber);
        return { ok: true, isDuplicate: false, serverMessage: '' };
      } catch (err) {
        const serverMessage =
          err != null && typeof err === 'object' && 'data' in err
            ? String((err as { data?: { message?: string } }).data?.message ?? '')
            : '';
        const isDuplicate = serverMessage.toLowerCase().includes('already exists');

        // Already in the DB — enrich it with the freshly-fetched lyrics (when we have any) and add
        // it to the show. Without a CCLI number we can't target the existing row.
        if (isDuplicate && ccliNumber > 0) {
          if (hasLyrics) {
            try {
              await updateSongMutation({
                songNumber: ccliNumber,
                title,
                authors,
                copyright,
                initialOrder: order,
                order: orderMap,
                blocks,
              }).unwrap();
            } catch (e2) {
              console.warn('Failed to enrich existing CCLI song with lyrics:', e2);
            }
          }
          commit(ccliNumber);
          trackLyricsImport(ccliNumber);
          return { ok: true, isDuplicate: false, serverMessage: '' };
        }

        console.error('Failed to import CCLI song:', err);
        return { ok: false, isDuplicate, serverMessage };
      }
    },
    [songs, dispatch, createSongMutation, updateSongMutation, fetchCcliDetail, trackEvent, resolveImportLanguage],
  );
};
