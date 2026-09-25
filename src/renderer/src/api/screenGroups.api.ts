import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';
import type { ScreenGroupData, ScreenGroupEntity } from '@/screens/types';

/**
 * Screen groups — logical outputs that windows are assigned to.
 *
 * Structurally `stage.api.ts`: one row per group with a JSON `data` blob, and an optimistic
 * patch on update so toggling a layer reaches the presentation windows immediately. The types
 * live in `@/screens/types`, which the presentation bridge can import without pulling in RTK.
 */
export type { ScreenGroupData, ScreenGroupEntity, ScreenGroupKind, ScreenGroupLayers } from '@/screens/types';

const screenGroupsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getScreenGroups: build.query<ApiSuccess<ScreenGroupEntity[]>, void>({
      query: () => 'rest/ScreenGroups',
      providesTags: [{ type: 'ScreenGroups', id: 'LIST' }],
    }),
    /** The starting pair for an account that has none; a no-op once it has any. */
    seedDefaultScreenGroups: build.mutation<ApiSuccess<{ message: string; created: number }>, { audience: string; stage: string }>({
      query: (body) => ({ url: 'rest/ScreenGroups/defaults', method: 'POST', body }),
      invalidatesTags: [{ type: 'ScreenGroups', id: 'LIST' }],
    }),
    createScreenGroup: build.mutation<
      ApiSuccess<{ id: number; message: string }>,
      { name: string; enabled?: boolean; sort_order?: number; data: ScreenGroupData }
    >({
      query: (body) => ({ url: 'rest/ScreenGroups', method: 'POST', body }),
      invalidatesTags: [{ type: 'ScreenGroups', id: 'LIST' }],
    }),
    updateScreenGroup: build.mutation<ApiSuccess<{ message: string }>, { id: number } & Partial<ScreenGroupEntity>>({
      query: ({ id, ...body }) => ({ url: `rest/ScreenGroups/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'ScreenGroups', id: 'LIST' }],
      async onQueryStarted({ id, ...patch }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          screenGroupsApi.util.updateQueryData('getScreenGroups', undefined, (draft) => {
            const group = draft.find((g) => g.id === id);
            if (group) Object.assign(group, patch);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    deleteScreenGroup: build.mutation<ApiSuccess<{ message: string }>, { id: number }>({
      query: ({ id }) => ({ url: `rest/ScreenGroups/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ScreenGroups', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetScreenGroupsQuery,
  useSeedDefaultScreenGroupsMutation,
  useCreateScreenGroupMutation,
  useUpdateScreenGroupMutation,
  useDeleteScreenGroupMutation,
} = screenGroupsApi;
