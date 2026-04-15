/**
 * PDF Icons API — RTK Query endpoints for per-account custom icon management.
 *
 * Icons are stored as SVG files on the server filesystem.
 * The `filename` field (URL-encoded) is the stable key used for serving and deletion.
 */
import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

/** A single custom icon entry returned by the list endpoint. */
export interface PdfIconDto {
  /** Human-readable icon name derived from the filename. */
  name: string;
  /** Stored filename on the server (e.g. "icon_67f1a2_my-icon.svg"). */
  filename: string;
  /** Relative URL to fetch the SVG (e.g. "rest/PdfIcons/icon_67f1a2_my-icon.svg"). */
  url: string;
}

const pdfIconsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    /** List all custom icons for the current account. */
    listPdfIcons: build.query<ApiSuccess<PdfIconDto[]>, void>({
      query: () => 'rest/PdfIcons',
      providesTags: ['PdfIcons'],
    }),

    /** Upload a new custom SVG icon. */
    uploadPdfIcon: build.mutation<ApiSuccess<{ message: string; name: string; filename: string; url: string }>, { formData: FormData }>({
      query: ({ formData }) => ({
        url: 'rest/PdfIcons',
        method: 'POST',
        body: formData,
        formData: true,
      }),
      invalidatesTags: ['PdfIcons'],
    }),

    /** Delete a custom icon by its stored filename. */
    deletePdfIcon: build.mutation<ApiSuccess<{ message: string }>, { filename: string }>({
      query: ({ filename }) => ({
        url: `rest/PdfIcons/${encodeURIComponent(filename)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['PdfIcons'],
    }),
  }),
  overrideExisting: false,
});

export const { useListPdfIconsQuery, useUploadPdfIconMutation, useDeletePdfIconMutation } = pdfIconsApi;
