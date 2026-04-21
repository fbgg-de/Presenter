import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

/** Custom event dispatched when the session has expired (401 from backend) */
export const SESSION_EXPIRED_EVENT = 'presenter:session-expired';

/** Generic wrapper that preserves the response type. Used by all endpoint slices. */
export type ApiSuccess<T> = T;

// ─────────────────────────────────────────────
// Base API instance
// ─────────────────────────────────────────────

/** Read the backend base URL from localStorage. Called per-request so runtime changes take effect.
 *  In DEV mode the Vite proxy is used by default (empty string = relative URL),
 *  but an explicit localStorage value overrides that so users can test against a real backend. */
/**
 * Read the backend base URL from localStorage. Called per-request so runtime changes take effect.
 * Default matches the settingsSlice default ('/') so they stay in sync.
 * In a pure Vite-dev environment you can override this to '' in localStorage to use the proxy.
 */
export const getBackendBaseUrl = (): string => {
  try {
    const stored = localStorage.getItem('presenter_backend_url');
    if (stored !== null) {
      // Normalize: trim whitespace and trailing slashes
      return stored.trim().replace(/\/+$/, '');
    }
  } catch {
    /* ignore */
  }
  // Default: same as settingsSlice so the displayed value matches actual requests
  return '';
};

/**
 * Dynamic base query — resolves the backend URL on every request so that
 * changes made by ConnectivityChecker or Settings take effect immediately.
 * In offline mode all backend requests are skipped and return empty data.
 */
const dynamicBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  // Offline mode: skip all backend API calls silently
  if (localStorage.getItem('presenter_offline_mode') === 'true') {
    // Return empty success so RTK Query caches empty data instead of showing errors
    return { data: null };
  }

  const baseUrl = getBackendBaseUrl();
  const rawBaseQuery = fetchBaseQuery({
    baseUrl: baseUrl ? `${baseUrl}/` : '/',
    credentials: 'include',
    prepareHeaders: (headers) => {
      headers.set('Accept', 'application/json');
      return headers;
    },
  });

  const result = await rawBaseQuery(args, api, extraOptions);

  // Detect 401 and broadcast session-expired (except for Session endpoint itself)
  if (result.error && result.error.status === 401) {
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
  baseQuery: dynamicBaseQuery,
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
