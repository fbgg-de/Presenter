import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type StyleData = {
  backgroundImage?: { enabled: boolean; value: string };
  backgroundVideo?: { enabled: boolean; value: string };
  backgroundVideoAutoplay?: { enabled: boolean; value: boolean };
  backgroundColor?: { enabled: boolean; value: string };
  backgroundSize?: { enabled: boolean; value: 'cover' | 'contain' | '100% auto' | 'auto 100%' | 'auto' };
  backgroundPosition?: { enabled: boolean; value: string };
  backgroundZoom?: { enabled: boolean; value: number };
  fontFamily?: { enabled: boolean; value: string };
  fontFallback?: { enabled: boolean; value: string[] };
  fontColor?: { enabled: boolean; value: string };
  fontSize?: { enabled: boolean; value: string };
  fontBold?: { enabled: boolean; value: boolean };
  fontItalic?: { enabled: boolean; value: boolean };
  fontUnderline?: { enabled: boolean; value: boolean };
  lineHeight?: { enabled: boolean; value: string };
  letterSpacing?: { enabled: boolean; value: string };
  padding?: { enabled: boolean; value: string };
  textTransform?: { enabled: boolean; value: 'none' | 'uppercase' | 'lowercase' | 'capitalize' };
  textAlign?: { enabled: boolean; value: 'left' | 'center' | 'right' | 'justify' };
  verticalAlign?: { enabled: boolean; value: 'top' | 'center' | 'bottom' };
  textStroke?: { enabled: boolean; value: string };
  textShadow?: { enabled: boolean; value: string };
  textShadowColor?: { enabled: boolean; value: string };
  opacity?: { enabled: boolean; value: number };
  hideText?: boolean;
  hideBackground?: boolean;
  nextLinePreviewColor?: { enabled: boolean; value: string };
  css?: string;
};

export type StyleEntity = {
  id: number;
  name: string;
  enabled: boolean;
  data: StyleData;
  windowOverrides?: { window_name: string; override_style_id: number }[];
  created_at?: string;
  updated_at?: string;
};

const stylesApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getStyles: build.query<ApiSuccess<StyleEntity[]>, void>({
      query: () => 'rest/Styles',
      providesTags: [{ type: 'Styles', id: 'LIST' }],
    }),
    getStyle: build.query<ApiSuccess<StyleEntity>, { id: number }>({
      query: ({ id }) => `rest/Styles/${id}`,
      providesTags: (_res, _err, arg) => [{ type: 'Styles', id: arg.id }],
    }),
    createStyle: build.mutation<ApiSuccess<{ id: number; message: string }>, { name: string; enabled?: boolean; data: StyleData }>({
      query: (body) => ({ url: 'rest/Styles', method: 'POST', body }),
      invalidatesTags: [{ type: 'Styles', id: 'LIST' }],
    }),
    updateStyle: build.mutation<ApiSuccess<{ message: string }>, { id: number } & Partial<StyleEntity>>({
      query: ({ id, ...body }) => ({ url: `rest/Styles/${id}`, method: 'PUT', body }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'Styles', id: 'LIST' },
        { type: 'Styles', id: arg.id },
      ],
    }),
    deleteStyle: build.mutation<ApiSuccess<{ message: string }>, { id: number }>({
      query: ({ id }) => ({ url: `rest/Styles/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Styles', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetStylesQuery, useGetStyleQuery, useCreateStyleMutation, useUpdateStyleMutation, useDeleteStyleMutation } = stylesApi;
