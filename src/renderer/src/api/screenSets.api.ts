import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

/**
 * Screen sets — named shortcuts for several screen groups ("LED wall" = LED left + LED right),
 * offered as one chip wherever media entries choose their screens.
 */
export interface ScreenSetEntity {
  id: number;
  name: string;
  screenGroupIds: number[];
}

const screenSetsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getScreenSets: build.query<ApiSuccess<ScreenSetEntity[]>, void>({
      query: () => 'rest/ScreenSets',
      providesTags: [{ type: 'ScreenSets', id: 'LIST' }],
    }),
    createScreenSet: build.mutation<ApiSuccess<{ id: number; message: string }>, Omit<ScreenSetEntity, 'id'>>({
      query: (body) => ({ url: 'rest/ScreenSets', method: 'POST', body }),
      invalidatesTags: [{ type: 'ScreenSets', id: 'LIST' }],
    }),
    updateScreenSet: build.mutation<ApiSuccess<{ message: string }>, { id: number } & Partial<Omit<ScreenSetEntity, 'id'>>>({
      query: ({ id, ...body }) => ({ url: `rest/ScreenSets/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'ScreenSets', id: 'LIST' }],
      async onQueryStarted({ id, ...patch }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          screenSetsApi.util.updateQueryData('getScreenSets', undefined, (draft) => {
            const set = draft.find((s) => s.id === id);
            if (set) Object.assign(set, patch);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    deleteScreenSet: build.mutation<ApiSuccess<{ message: string }>, { id: number }>({
      query: ({ id }) => ({ url: `rest/ScreenSets/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ScreenSets', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetScreenSetsQuery, useCreateScreenSetMutation, useUpdateScreenSetMutation, useDeleteScreenSetMutation } = screenSetsApi;
