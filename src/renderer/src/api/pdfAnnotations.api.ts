/**
 * PDF Annotations API — RTK Query endpoints for per-annotation CRUD.
 */
import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

/** Tool-specific data stored in the JSON `data` column */
export interface AnnotationData {
  /** Freehand draw: array of {x,y} percentage points */
  points?: { x: number; y: number }[];
  /** Draw/highlight line width */
  lineWidth?: number;
  /** Text content */
  text?: string;
  /** Font size in points */
  fontSize?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontUnderline?: boolean;
  /** Highlight rectangle dimensions (percentage) */
  width?: number;
  height?: number;
  /** Icon reference — stored filename of the uploaded SVG */
  iconFilename?: string;
  /** Render size of the icon in CSS pixels (before zoom scaling). Defaults to ICON_BASE_SIZE (24). */
  iconSize?: number;
  /** @deprecated Legacy numeric icon ID — kept for backwards compat */
  iconId?: number;
  iconName?: string;
}

/** Single annotation row from the database */
export interface AnnotationDto {
  id: number;
  layer: string;
  tool: string;
  page: number;
  x: number;
  y: number;
  color: string;
  opacity: number;
  sortOrder: number;
  data: AnnotationData;
  createdAt?: string;
}

const pdfAnnotationsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    /** List all annotations for a specific PDF (all layers) */
    listAnnotations: build.query<ApiSuccess<AnnotationDto[]>, { songNumber: number; filename: string }>({
      query: ({ songNumber, filename }) => ({
        url: `rest/PdfAnnotations/${songNumber}`,
        params: { filename },
      }),
      providesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),

    /** Insert a single annotation (auto-saves immediately) */
    addAnnotation: build.mutation<
      ApiSuccess<AnnotationDto>,
      {
        songNumber: number;
        filename: string;
        layer: string;
        tool: string;
        page: number;
        x: number;
        y: number;
        color: string;
        opacity: number;
        data: AnnotationData;
      }
    >({
      query: ({ songNumber, ...body }) => ({
        url: `rest/PdfAnnotations/${songNumber}`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),

    /** Undo the last annotation in a layer (delete highest sort_order) */
    undoAnnotation: build.mutation<
      ApiSuccess<{ message: string; deletedId: number | null }>,
      { songNumber: number; filename: string; layer: string }
    >({
      query: ({ songNumber, filename, layer }) => ({
        url: `rest/PdfAnnotations/${songNumber}/undo`,
        method: 'DELETE',
        params: { filename, layer },
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),

    /** Clear all annotations in a layer */
    clearLayer: build.mutation<ApiSuccess<{ message: string }>, { songNumber: number; filename: string; layer: string }>({
      query: ({ songNumber, filename, layer }) => ({
        url: `rest/PdfAnnotations/${songNumber}/layer`,
        method: 'DELETE',
        params: { filename, layer },
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),

    /** Rename an annotation layer */
    renameAnnotationLayer: build.mutation<
      ApiSuccess<{ message: string }>,
      { songNumber: number; filename: string; oldName: string; newName: string }
    >({
      query: ({ songNumber, ...body }) => ({
        url: `rest/PdfAnnotations/${songNumber}/rename`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),

    /** Delete a single annotation by ID (used by eraser tool) */
    deleteAnnotation: build.mutation<
      ApiSuccess<{ message: string; deletedId: number }>,
      { songNumber: number; filename: string; annotationId: number }
    >({
      query: ({ songNumber, annotationId }) => ({
        url: `rest/PdfAnnotations/${songNumber}/${annotationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),

    /** Update an annotation's position and optionally its content/style (used for drag-to-relocate and double-click text editing) */
    updateAnnotation: build.mutation<
      ApiSuccess<{ message: string; id: number }>,
      {
        songNumber: number;
        filename: string;
        annotationId: number;
        x: number;
        y: number;
        /** Optional: update the annotation colour (text edit) */
        color?: string;
        /** Optional: update opacity (text edit) */
        opacity?: number;
        /** Optional: update the JSON data payload (text content / font style) */
        data?: AnnotationData;
      }
    >({
      query: ({ songNumber, annotationId, ...body }) => ({
        url: `rest/PdfAnnotations/${songNumber}/${annotationId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'PdfAnnotations', id: `${arg.songNumber}-${arg.filename}` }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAnnotationsQuery,
  useAddAnnotationMutation,
  useUndoAnnotationMutation,
  useClearLayerMutation,
  useRenameAnnotationLayerMutation,
  useDeleteAnnotationMutation,
  useUpdateAnnotationMutation,
} = pdfAnnotationsApi;
