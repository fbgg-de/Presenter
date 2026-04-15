import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

/** Custom event dispatched when the session has expired (401 from backend) */
export const SESSION_EXPIRED_EVENT = 'presenter:session-expired';

/** Generic wrapper that preserves the response type. Used by all endpoint slices. */
export type ApiSuccess<T> = T;

// ─────────────────────────────────────────────
// Base API instance
// ─────────────────────────────────────────────

const getBackendBaseUrl = (): string => {
  if (import.meta.env.DEV) {
    return '';
  }
  const override = import.meta.env.VITE_BACKEND_URL;
  const fromStorage = localStorage.getItem('presenter_backend_url') || '';
  return (override ?? fromStorage).trim().replace(/\/+$/, '');
};

const baseUrl = getBackendBaseUrl();

const rawBaseQuery = fetchBaseQuery({
  baseUrl: baseUrl ? `${baseUrl}/` : '/',
  credentials: 'include',
  prepareHeaders: (headers) => {
    headers.set('Accept', 'application/json');
    return headers;
  },
});

/** Wrapper that detects 401 and broadcasts a session-expired event */
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && result.error.status === 401) {
    // Don't fire for the Session endpoint itself (expected to 401 when not logged in)
    const url = typeof args === 'string' ? args : args.url;
    if (!url.includes('rest/Session')) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
  }
  return result;
};

/**
 * Base RTK Query API instance.
 * Endpoints are injected per domain in the sibling slice files.
 */
export const presenterApi = createApi({
  reducerPath: 'presenterApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Session',
    'Songs',
    'Song',
    'Shows',
    'Styles',
    'Metrics',
    'ShowItemTypes',
    'AdminAccounts',
    'AdminProviders',
    'Logs',
    'Pdfs',
    'PdfAnnotations',
    'PdfIcons',
  ],
  endpoints: () => ({}),
});
