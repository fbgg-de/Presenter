import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type SearchResult = {
  id: number | string;
  name: string;
  type: 'song' | 'style' | 'media' | 'bible' | 'churchtools';
  /** CCLI suggestions (type 'churchtools') carry their metadata for display + import. */
  author?: string | null;
  copyright?: string | null;
  ccli?: number | null;
};

const searchApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    unifiedSearch: build.query<ApiSuccess<SearchResult[]>, { q: string; type?: string; includeCcli?: boolean }>({
      query: ({ q, type, includeCcli }) => ({
        url: 'rest/Search',
        params: {
          q,
          // Backend uses plural: 'songs', 'styles' — map from client type names
          ...(type === 'song' ? { type: 'songs' } : type === 'style' ? { type: 'styles' } : type ? { type } : {}),
          ...(includeCcli ? { ccli: 1 } : {}),
        },
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useUnifiedSearchQuery } = searchApi;
