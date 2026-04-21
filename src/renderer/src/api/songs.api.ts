import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type SongListItem = {
  songNumber: number;
  title: string;
  authors?: string;
  orderCount?: number;
};

export type SongEntity = {
  songNumber: number;
  title: string;
  authors?: string;
  copyright?: string;
  ccliNumber?: string;
  key?: string;
  initialOrder?: string[];
  order: Record<string, string[]>;
  blocks: Record<string, string[]>;
  background?: string;
  css?: string;
  styleId?: number;
  languages?: string[];
};

const songsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getSongsAll: build.query<ApiSuccess<SongListItem[]>, { order?: 'lexicographic' | 'numeric' } | void>({
      query: (arg) => {
        const order = arg && 'order' in arg ? arg.order : undefined;
        return order ? `rest/SongsAll/${order}` : 'rest/SongsAll';
      },
      providesTags: (result) =>
        result
          ? [...result.map((s) => ({ type: 'Song' as const, id: s.songNumber })), { type: 'Songs' as const, id: 'LIST' }]
          : [{ type: 'Songs' as const, id: 'LIST' }],
    }),
    searchSongs: build.query<ApiSuccess<SongListItem[]>, { q: string; mode?: 'title' | 'number' | 'text' }>({
      query: ({ q, mode = 'title' }) => ({ url: `rest/SongsSearch/${mode}`, params: { q } }),
    }),
    getSong: build.query<ApiSuccess<SongEntity>, { songNumber: number }>({
      query: ({ songNumber }) => `rest/Song/${songNumber}`,
      providesTags: (_res, _err, arg) => [{ type: 'Song', id: arg.songNumber }],
    }),
    createSong: build.mutation<ApiSuccess<SongEntity>, Partial<SongEntity> & Pick<SongEntity, 'title' | 'initialOrder' | 'blocks'>>({
      query: (body) => ({ url: 'rest/Song', method: 'POST', body }),
      invalidatesTags: [{ type: 'Songs', id: 'LIST' }],
    }),
    updateSong: build.mutation<
      ApiSuccess<SongEntity>,
      Pick<SongEntity, 'songNumber' | 'title' | 'initialOrder' | 'order' | 'blocks' | 'authors' | 'copyright'> & Partial<SongEntity>
    >({
      query: (body) => ({ url: 'rest/Song', method: 'PUT', body }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'Songs', id: 'LIST' },
        { type: 'Song', id: arg.songNumber },
      ],
    }),
    deleteSong: build.mutation<ApiSuccess<{ message: string }>, { songNumber: number }>({
      query: ({ songNumber }) => ({ url: 'rest/Song', method: 'DELETE', body: { songNumber } }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'Songs', id: 'LIST' },
        { type: 'Song', id: arg.songNumber },
      ],
    }),
    songExists: build.query<ApiSuccess<{ exists: boolean; order: string }>, { songNumber: number }>({
      query: ({ songNumber }) => `rest/SongExists/${songNumber}`,
    }),
    getLanguageTags: build.query<ApiSuccess<string[]>, void>({
      query: () => 'rest/LanguageTags',
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetSongsAllQuery,
  useSearchSongsQuery,
  useGetSongQuery,
  useLazyGetSongQuery,
  useCreateSongMutation,
  useUpdateSongMutation,
  useDeleteSongMutation,
  useSongExistsQuery,
  useGetLanguageTagsQuery,
} = songsApi;

export { songsApi };

