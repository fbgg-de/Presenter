import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type ShowItemType = 'song' | 'media' | 'bible_verse';
export type MediaSubType = 'image' | 'video' | 'color';

export type ShowItem = {
  type: ShowItemType;
  songNumber?: number;
  order?: string;
  key?: string;
  translations?: string[];
  mediaPath?: string;
  mediaSubType?: MediaSubType;
  mediaColor?: string;
  /** CSS objectFit for image/video: 'cover' | 'contain' | 'fill' */
  mediaObjectFit?: 'cover' | 'contain' | 'fill';
  /** CSS objectPosition e.g. 'center', 'top', 'bottom left' */
  mediaObjectPosition?: string;
  /** Zoom factor 100 = 1x */
  mediaZoom?: number;
  /** Blur in px */
  mediaBlur?: number;
  /** Video autoplay (default true) */
  mediaAutoplay?: boolean;
  /** Video loop (default true) */
  mediaLoop?: boolean;
  bibleRef?: string;
  bibleTranslation?: string;
  bibleFormattedSegments?: { start: number; end: number; bold: boolean }[];
  label?: string;
  styleId?: number;
  /** Per-window style override: keys are window names, values are style IDs (or null = no style). */
  itemStyleByWindow?: Record<string, number | null>;
};

export type Show = {
  title: string;
  order: ShowItem[];
  date?: string;
  styleId?: number;
};

export type ShowsResponse = {
  limit: number;
  offset: number;
  shows: Show[];
};

const showsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getShows: build.query<ApiSuccess<ShowsResponse>, { limit?: number; page?: number } | void>({
      query: (arg) => {
        const limit = arg && 'limit' in arg ? (arg.limit ?? 10) : 10;
        const page = arg && 'page' in arg ? (arg.page ?? 0) : 0;
        return `rest/Shows/${limit}/${page}`;
      },
      providesTags: [{ type: 'Shows', id: 'LIST' }],
    }),
    saveShow: build.mutation<ApiSuccess<{ message: string }>, { title: string; order: ShowItem[]; styleId?: number | null }>({
      query: (body) => ({ url: 'rest/Shows', method: 'POST', body }),
      invalidatesTags: [{ type: 'Shows', id: 'LIST' }],
    }),
    deleteShow: build.mutation<ApiSuccess<{ message: string }>, { title: string }>({
      query: (body) => ({ url: 'rest/Shows', method: 'DELETE', body }),
      invalidatesTags: [{ type: 'Shows', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetShowsQuery, useSaveShowMutation, useDeleteShowMutation } = showsApi;
