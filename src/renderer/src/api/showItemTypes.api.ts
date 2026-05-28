import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type ShowItemTypeConfig = {
  id?: number;
  type_key: string;
  label: string;
  color: string;
  icon: string;
  is_default?: boolean;
};

const showItemTypesApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getShowItemTypes: build.query<ApiSuccess<ShowItemTypeConfig[]>, void>({
      query: () => 'rest/ShowItemTypes',
      providesTags: [{ type: 'ShowItemTypes', id: 'LIST' }],
    }),
    updateShowItemType: build.mutation<ApiSuccess<{ message: string }>, ShowItemTypeConfig>({
      query: (body) => ({ url: 'rest/ShowItemTypes', method: 'PUT', body }),
      invalidatesTags: [{ type: 'ShowItemTypes', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetShowItemTypesQuery, useUpdateShowItemTypeMutation } = showItemTypesApi;
