import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';
import type { ShowGroup, ShowItem } from './shows.api';

/**
 * The library: saved agenda groups and media entries, and the groups of past shows.
 * See `library/libraryData.ts` for how entries are made and added to a show.
 */
export type LibraryKind = 'group' | 'media';

export interface LibraryData {
  group?: ShowGroup;
  items: ShowItem[];
}

export interface LibraryEntity {
  id: number;
  kind: LibraryKind;
  name: string;
  data: LibraryData;
  updated_at?: string;
}

export interface PastGroup {
  showTitle: string;
  date: string;
  group: ShowGroup;
  items: ShowItem[];
}

const libraryApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getLibraryEntries: build.query<ApiSuccess<LibraryEntity[]>, void>({
      query: () => 'rest/LibraryEntries',
      providesTags: [{ type: 'Library', id: 'LIST' }],
    }),
    createLibraryEntry: build.mutation<ApiSuccess<{ id: number; message: string }>, Omit<LibraryEntity, 'id' | 'updated_at'>>({
      query: (body) => ({ url: 'rest/LibraryEntries', method: 'POST', body }),
      invalidatesTags: [{ type: 'Library', id: 'LIST' }],
    }),
    updateLibraryEntry: build.mutation<ApiSuccess<{ message: string }>, { id: number; name?: string; data?: LibraryData }>({
      query: ({ id, ...body }) => ({ url: `rest/LibraryEntries/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Library', id: 'LIST' }],
    }),
    deleteLibraryEntry: build.mutation<ApiSuccess<{ message: string }>, { id: number }>({
      query: ({ id }) => ({ url: `rest/LibraryEntries/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Library', id: 'LIST' }],
    }),
    /** Groups of the most recent shows, except the one named in `exclude`. */
    getPastGroups: build.query<ApiSuccess<PastGroup[]>, { exclude?: string; limit?: number }>({
      query: ({ exclude = '', limit = 60 }) => ({ url: 'rest/LibraryPastGroups', params: { exclude, limit } }),
      providesTags: [{ type: 'Shows', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLibraryEntriesQuery,
  useCreateLibraryEntryMutation,
  useUpdateLibraryEntryMutation,
  useDeleteLibraryEntryMutation,
  useGetPastGroupsQuery,
} = libraryApi;
