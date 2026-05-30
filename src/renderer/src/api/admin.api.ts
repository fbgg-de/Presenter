import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type AdminAccount = {
  license: number;
  mail: string;
  name?: string | null;
  active: boolean;
  created_at: string;
  lastactivity: string;
  church_tools_url?: string | null;
  /** True if both URL and token are configured server-side. Token is never sent to the client. */
  church_tools_enabled: boolean;
  providers: Array<{
    provider_id: number;
    provider_name: string;
    is_default: boolean;
  }>;
};

export type OidcProvider = {
  id: number;
  name: string;
  discovery_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  required_group?: string | null;
  enabled: boolean;
  created_at: string;
};

export type CreateAccountRequest = {
  license: number;
  mail: string;
  name?: string;
  active?: boolean;
};

export type UpdateAccountRequest = {
  license: number;
  mail?: string;
  name?: string;
  active?: boolean;
  /** ChurchTools instance URL, e.g. https://demo.church.tools/api/ */
  churchToolsUrl?: string | null;
  /** ChurchTools API login token. Pass empty string to clear. */
  churchToolsToken?: string | null;
};

export type CreateProviderRequest = {
  name: string;
  discovery_url: string;
  client_id: string;
  client_secret: string;
  scopes?: string;
  required_group?: string;
  enabled?: boolean;
};

export type UpdateProviderRequest = {
  id: number;
  name?: string;
  discovery_url?: string;
  client_id?: string;
  client_secret?: string;
  scopes?: string;
  required_group?: string;
  enabled?: boolean;
};

export type AssignProviderRequest = {
  license: number;
  provider_id: number;
  is_default?: boolean;
};

export type UnassignProviderRequest = {
  license: number;
  provider_id: number;
};

export type MigrationEntry = {
  version: number;
  description: string;
  applied: boolean;
  appliedAt: string | null;
};

export type MigrationStatus = {
  currentVersion: number;
  latestVersion: number;
  pendingCount: number;
  migrations: MigrationEntry[];
};

export type RunMigrationsResult = {
  message: string;
  currentVersion: number;
  applied: Array<{ version: number; description: string; output: string }>;
  errors: Array<{ version: number; description: string; error: string }>;
};

export type AdminConfigData = {
  server: {
    phpVersion: string | null;
    phpSapi: string | null;
    serverSoftware: string | null;
    mysqlVersion: string | null;
  };
  app: {
    domain: string | null;
    baseUrl: string | null;
    development: boolean;
    defaultLanguage: string | null;
    searchResultLimit: number | null;
    customNumberLimit: number | null;
  };
  database: {
    host: string | null;
    database: string | null;
    user: string | null;
  };
  cors: {
    allowedOrigins: string[];
  };
  oidc: {
    discoveryUrl: string | null;
    clientId: string | null;
    adminGroup: string | null;
    requiredGroup: string | null;
    redirectUri: string | null;
    scopes: string[];
  };
  bible: {
    enabled: boolean;
    name: string | null;
    baseUrl: string | null;
    translationsEndpoint: string | null;
    verseEndpoint: string | null;
  };
  wsHost: {
    wss?: boolean;
    host: string;
    port: number;
    path?: string;
  } | null;
};

const adminApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    // ──────── Admin: Accounts ────────
    getAdminAccounts: build.query<ApiSuccess<AdminAccount[]>, void>({
      query: () => 'rest/AdminAccounts',
      providesTags: [{ type: 'AdminAccounts', id: 'LIST' }],
    }),
    createAdminAccount: build.mutation<ApiSuccess<{ message: string; license: number }>, CreateAccountRequest>({
      query: (body) => ({ url: 'rest/AdminAccounts', method: 'POST', body }),
      invalidatesTags: [{ type: 'AdminAccounts', id: 'LIST' }],
    }),
    updateAdminAccount: build.mutation<ApiSuccess<{ message: string }>, UpdateAccountRequest>({
      query: (body) => ({ url: 'rest/AdminAccounts', method: 'PUT', body }),
      invalidatesTags: [{ type: 'AdminAccounts', id: 'LIST' }],
    }),
    deleteAdminAccount: build.mutation<ApiSuccess<{ message: string }>, { license: number }>({
      query: (body) => ({ url: 'rest/AdminAccounts', method: 'DELETE', body }),
      invalidatesTags: [{ type: 'AdminAccounts', id: 'LIST' }],
    }),

    // ──────── Admin: Providers ────────
    getAdminProviders: build.query<ApiSuccess<OidcProvider[]>, void>({
      query: () => 'rest/AdminProviders',
      providesTags: [{ type: 'AdminProviders', id: 'LIST' }],
    }),
    createAdminProvider: build.mutation<ApiSuccess<{ message: string; id: number }>, CreateProviderRequest>({
      query: (body) => ({ url: 'rest/AdminProviders', method: 'POST', body }),
      invalidatesTags: [{ type: 'AdminProviders', id: 'LIST' }],
    }),
    updateAdminProvider: build.mutation<ApiSuccess<{ message: string }>, UpdateProviderRequest>({
      query: (body) => ({ url: 'rest/AdminProviders', method: 'PUT', body }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'AdminProviders', id: 'LIST' },
        { type: 'AdminAccounts', id: arg.id },
      ],
    }),
    deleteAdminProvider: build.mutation<ApiSuccess<{ message: string }>, { id: number }>({
      query: (body) => ({ url: 'rest/AdminProviders', method: 'DELETE', body }),
      invalidatesTags: [
        { type: 'AdminProviders', id: 'LIST' },
        { type: 'AdminAccounts', id: 'LIST' },
      ],
    }),
    assignProviderToAccount: build.mutation<ApiSuccess<{ message: string }>, AssignProviderRequest>({
      query: (body) => ({ url: 'rest/AdminAccountProviders', method: 'POST', body }),
      invalidatesTags: [{ type: 'AdminAccounts', id: 'LIST' }],
    }),
    unassignProviderFromAccount: build.mutation<ApiSuccess<{ message: string }>, UnassignProviderRequest>({
      query: (body) => ({ url: 'rest/AdminAccountProviders', method: 'DELETE', body }),
      invalidatesTags: [{ type: 'AdminAccounts', id: 'LIST' }],
    }),

    // ──────── Admin: Migrations ────────
    getAdminMigrations: build.query<ApiSuccess<MigrationStatus>, void>({
      query: () => 'rest/AdminMigrations',
      providesTags: ['AdminMigrations'],
    }),
    runAdminMigrations: build.mutation<ApiSuccess<RunMigrationsResult>, void>({
      query: () => ({ url: 'rest/AdminMigrations', method: 'POST' }),
      invalidatesTags: ['AdminMigrations'],
    }),

    // ──────── Admin: Config ────────
    getAdminConfig: build.query<ApiSuccess<AdminConfigData>, void>({
      query: () => 'rest/AdminConfig',
      providesTags: ['AdminConfig'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAdminAccountsQuery,
  useCreateAdminAccountMutation,
  useUpdateAdminAccountMutation,
  useDeleteAdminAccountMutation,
  useGetAdminProvidersQuery,
  useCreateAdminProviderMutation,
  useUpdateAdminProviderMutation,
  useDeleteAdminProviderMutation,
  useAssignProviderToAccountMutation,
  useUnassignProviderFromAccountMutation,
  useGetAdminMigrationsQuery,
  useRunAdminMigrationsMutation,
  useGetAdminConfigQuery,
} = adminApi;
