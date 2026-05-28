import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type BibleVerseResult = {
  reference: string;
  translation: string;
  text: string;
  verses: { number: number; text: string }[];
  copyright?: string;
};

export type BibleTranslation = {
  id: string;
  name: string;
  language: string;
};

const bibleApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getBibleVerses: build.query<ApiSuccess<BibleVerseResult>, { ref: string; translation?: string }>({
      query: ({ ref, translation }) => ({
        url: `rest/BibleVerses/${encodeURIComponent(ref)}`,
        params: translation ? { translation } : {},
      }),
    }),
    getBibleTranslations: build.query<ApiSuccess<BibleTranslation[]>, { lang?: string } | void>({
      query: (arg) => ({
        url: 'rest/BibleTranslations',
        params: arg && 'lang' in arg ? { lang: arg.lang } : {},
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetBibleVersesQuery, useGetBibleTranslationsQuery } = bibleApi;
