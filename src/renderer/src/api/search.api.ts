import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type SearchResult = {
  id: number | string;
  name: string;
  type: 'song' | 'style' | 'media' | 'bible';
};

const searchApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    unifiedSearch: build.query<ApiSuccess<SearchResult[]>, { q: string; type?: string }>({
      query: ({ q, type }) => ({
        url: 'rest/Search',
        params: {
          q,
          // Backend uses plural: 'songs', 'styles' — map from client type names
          ...(type === 'song' ? { type: 'songs' } : type === 'style' ? { type: 'styles' } : type ? { type } : {}),
        },
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useUnifiedSearchQuery } = searchApi;
