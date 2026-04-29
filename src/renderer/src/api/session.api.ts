import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type SessionInfo = {
  account: number;
  mail: string;
  isAuthenticated?: boolean;
  authType?: 'oidc' | 'oidc_admin' | null;
  settings?: {
    bibleEnabled: boolean;
  };
};

export type OidcAuthUrlResponse = {
  url: string;
};

export type AccountListItem = {
  license: number;
  name?: string | null;
};

export type AccountSettingsData = {
  defaultStyleId: number | null;
};

const sessionApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    // ──────── Session ────────
    getSession: build.query<ApiSuccess<SessionInfo>, void>({
      query: () => 'rest/Session',
      providesTags: ['Session'],
    }),
    logout: build.mutation<ApiSuccess<{ message: string }>, void>({
      query: () => ({ url: 'rest/Session', method: 'DELETE' }),
      invalidatesTags: ['Session'],
    }),
    getOidcAuthUrl: build.query<ApiSuccess<OidcAuthUrlResponse>, { redirect?: string; license?: number } | void>({
      query: (arg) => ({
        url: 'rest/Session/oidc-auth-url',
        params: {
          ...(arg && 'redirect' in arg ? { redirect: arg.redirect } : {}),
          ...(arg && 'license' in arg ? { license: arg.license } : {}),
        },
      }),
    }),
    getAdminOidcAuthUrl: build.query<ApiSuccess<OidcAuthUrlResponse>, { redirect?: string } | void>({
      query: (arg) => ({
        url: 'rest/Session/oidc-auth-url',
        params: { ...(arg && 'redirect' in arg ? { redirect: arg.redirect } : {}), admin: 1 },
      }),
    }),

    // ──────── Accounts (public) ────────
    getAccounts: build.query<ApiSuccess<AccountListItem[]>, void>({
      query: () => 'rest/Accounts',
    }),

    // ──────── Account Settings (server-side, per-account) ────────
    getAccountSettings: build.query<ApiSuccess<AccountSettingsData>, void>({
      query: () => 'rest/AccountSettings',
      providesTags: ['AccountSettings'],
    }),
    updateAccountSettings: build.mutation<ApiSuccess<AccountSettingsData & { message: string }>, Partial<AccountSettingsData>>({
      query: (body) => ({ url: 'rest/AccountSettings', method: 'PUT', body }),
      invalidatesTags: ['AccountSettings'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetSessionQuery,
  useLazyGetSessionQuery,
  useLogoutMutation,
  useGetOidcAuthUrlQuery,
  useGetAdminOidcAuthUrlQuery,
  useGetAccountsQuery,
  useGetAccountSettingsQuery,
  useUpdateAccountSettingsMutation,
} = sessionApi;
