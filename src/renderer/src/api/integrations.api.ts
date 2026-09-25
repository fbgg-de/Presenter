import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

/** The account's own connections to other services (api/AccountIntegrations.php). */
export type AccountIntegrations = {
  /** Spotify app client id (not a secret). */
  spotifyClientId: string | null;
  /** Client id and secret are both stored. The secret never leaves the server. */
  spotifyEnabled: boolean;
  /** The account's Nextcloud for the web version (canonical https address). */
  nextcloudUrl: string | null;
  /** ChurchTools API address, e.g. https://example.church.tools/api/ */
  churchToolsUrl: string | null;
  /** Address and login token are both stored. The token never leaves the server. */
  churchToolsEnabled: boolean;
  /** Set by the server admin: these services may be in a private network. */
  privateNetwork: boolean;
};

export type UpdateAccountIntegrations = {
  /** An empty string removes the id and the secret. */
  spotifyClientId?: string;
  /** Omit (or leave blank) to keep the stored secret. */
  spotifyClientSecret?: string;
  /** An empty string switches Nextcloud off. */
  nextcloudUrl?: string;
  /** An empty string removes the address and the token. */
  churchToolsUrl?: string;
  /** Omit (or leave blank) to keep the stored token. */
  churchToolsToken?: string;
};

const integrationsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getAccountIntegrations: build.query<ApiSuccess<AccountIntegrations>, void>({
      query: () => 'rest/AccountIntegrations',
      providesTags: ['AccountIntegrations'],
    }),
    updateAccountIntegrations: build.mutation<ApiSuccess<AccountIntegrations & { message: string }>, UpdateAccountIntegrations>({
      query: (body) => ({ url: 'rest/AccountIntegrations', method: 'PUT', body }),
      // The session carries whether Spotify and ChurchTools are usable, and the Nextcloud address.
      invalidatesTags: ['AccountIntegrations', 'Session'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetAccountIntegrationsQuery, useUpdateAccountIntegrationsMutation } = integrationsApi;
