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
  ccli: string | null;
  category: string | null;
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
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

const churchToolsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    /** Search songs in ChurchTools by name. */
    searchChurchToolsSongs: build.query<ApiSuccess<CtSearchResponse>, { q: string; page?: number; limit?: number }>({
      query: ({ q, page = 1, limit = 20 }) => ({
        url: 'rest/ChurchToolsSongs',
        params: { q, page, limit },
      }),
    }),

    /** Fetch a single ChurchTools song with all its arrangements and their file lists. */
    getChurchToolsSong: build.query<ApiSuccess<CtSongDetail>, { ctSongId: number }>({
      query: ({ ctSongId }) => `rest/ChurchToolsSongs/${ctSongId}`,
    }),
  }),
  overrideExisting: false,
});

export const { useSearchChurchToolsSongsQuery, useLazySearchChurchToolsSongsQuery, useGetChurchToolsSongQuery } =
  churchToolsApi;

/**
 * Build a browser-facing download URL for a ChurchTools arrangement file.
 * The PHP backend streams the file through so no credentials are leaked.
 */
export const buildCtFileDownloadUrl = (ctSongId: number, arrangementId: number, filename: string): string =>
  `/rest/ChurchToolsSongs/${ctSongId}/${arrangementId}/download/${encodeURIComponent(filename)}`;

