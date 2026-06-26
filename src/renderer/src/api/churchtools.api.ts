/**
 * RTK Query slice for the ChurchTools proxy endpoints.
 *
 * All endpoints proxy through the PHP backend so the ChurchTools token is
 * never exposed to the browser.
 */
import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CtSongListItem {
  id: number;
  name: string;
  author: string | null;
  copyright: string | null;
  /** CCLI / SongSelect number. Numeric for CCLI catalogue results, string for some library songs. */
  ccli: string | number | null;
  category: string | null;
  /** CCLI SongSelect results: whether lyrics are available to import. */
  hasLyrics?: boolean;
}

export interface CtArrangementFile {
  filename: string;
  /** Signed download URL (includes token — only available server-to-server; use the proxy download endpoint from the frontend). */
  fileUrl: string;
}

export interface CtArrangement {
  id: number;
  name: string;
  key: string | null;
  beat: string | null;
  tempo: number | null;
  description: string | null;
  files: CtArrangementFile[];
}

export interface CtSongDetail {
  id: number;
  name: string;
  author: string | null;
  copyright: string | null;
  ccli: string | null;
  arrangements: CtArrangement[];
}

export interface CtSearchResponse {
  songs: CtSongListItem[];
  meta: { pagination?: { total: number; current: number; limit: number } } | null;
  source?: 'ccli';
}

/** An upcoming ChurchTools event a show can be linked to. */
export interface CtEvent {
  id: number;
  name: string | null;
  startDate: string | null;
}

/** A single CCLI SongSelect song resolved for import (incl. lyrics mapped to blocks). */
export interface CtCcliDetail {
  ccli: number | null;
  name: string | null;
  author: string | null;
  copyright: string | null;
  /** Default key/tonality (used for chord-chart import). */
  key?: string | null;
  /** Block name → lines. Empty until the lyrics shape is mapped server-side. */
  blocks: Record<string, string[]>;
  /** Block names in default order. */
  order: string[];
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

const churchToolsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    /** Search the global CCLI SongSelect catalogue (via the legacy churchservice endpoint). */
    searchChurchToolsSongs: build.query<ApiSuccess<CtSearchResponse>, { q: string; limit?: number }>({
      query: ({ q, limit = 20 }) => ({
        url: 'rest/ChurchToolsSongs',
        params: { q, limit, source: 'ccli' },
      }),
    }),

    /** Fetch a single ChurchTools song with all its arrangements and their file lists. */
    getChurchToolsSong: build.query<ApiSuccess<CtSongDetail>, { ctSongId: number }>({
      query: ({ ctSongId }) => `rest/ChurchToolsSongs/${ctSongId}`,
    }),

    /**
     * Resolve a CCLI SongSelect song (incl. lyrics) by its CCLI number, for import.
     * Served by the unified Search endpoint (shares the proven-loading class with CCLI search).
     */
    getChurchToolsCcliDetail: build.query<ApiSuccess<CtCcliDetail>, { songNumber: number }>({
      query: ({ songNumber }) => ({ url: 'rest/Search', params: { ccli_detail: songNumber } }),
    }),

    /** ChurchTools events for linking a show to an event — paginated forward/backward in time. */
    getChurchToolsEvents: build.query<
      ApiSuccess<{ events: CtEvent[] }>,
      { limit?: number; from?: string; to?: string; direction?: 'forward' | 'backward' } | void
    >({
      query: (arg) => ({
        url: 'rest/ChurchToolsEvents',
        params: {
          limit: (arg && arg.limit) ?? 10,
          ...(arg && arg.from ? { from: arg.from } : {}),
          ...(arg && arg.to ? { to: arg.to } : {}),
          ...(arg && arg.direction ? { direction: arg.direction } : {}),
        },
      }),
    }),

    /** Sync a show's songs (by song number, in order) to a ChurchTools event's agenda. */
    syncChurchToolsEvent: build.mutation<ApiSuccess<{ message: string }>, { eventId: number; songNumbers: number[] }>({
      query: ({ eventId, songNumbers }) => ({ url: `rest/ChurchToolsEvents/${eventId}/sync`, method: 'POST', body: { songNumbers } }),
    }),

    /** Fetch the CCLI chord chart for a song and store it as one of its musician PDFs. */
    importCcliChords: build.mutation<
      ApiSuccess<{ message: string; filename: string }>,
      { songNumber: number; title: string; key?: string | null; columns?: number; markDefault?: boolean }
    >({
      query: ({ songNumber, title, key, columns, markDefault }) => ({
        url: `rest/Search/${songNumber}/import-chords`,
        method: 'POST',
        body: { title, key: key ?? '', columns: columns ?? 2, default: markDefault ? 1 : 0 },
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'Pdfs', id: arg.songNumber }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useSearchChurchToolsSongsQuery,
  useLazySearchChurchToolsSongsQuery,
  useGetChurchToolsSongQuery,
  useLazyGetChurchToolsCcliDetailQuery,
  useGetChurchToolsEventsQuery,
  useLazyGetChurchToolsEventsQuery,
  useSyncChurchToolsEventMutation,
  useImportCcliChordsMutation,
} = churchToolsApi;

/**
 * Build a browser-facing download URL for a ChurchTools arrangement file.
 * The PHP backend streams the file through so no credentials are leaked.
 */
export const buildCtFileDownloadUrl = (ctSongId: number, arrangementId: number, filename: string): string =>
  `/rest/ChurchToolsSongs/${ctSongId}/${arrangementId}/download/${encodeURIComponent(filename)}`;
