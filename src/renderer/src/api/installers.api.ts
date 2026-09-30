import { presenterApi } from './base.api';

/** A desktop installer the web root offers for download (see api/Installers.php). */
export type Installer = {
  os: 'windows' | 'macos' | 'linux';
  file: string;
  /** Address on the web server, from its root. */
  url: string;
  size: number;
  /** When it was uploaded (ISO date). */
  modified: string;
};

const installersApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getInstallers: build.query<{ installers: Installer[] }, void>({
      query: () => 'rest/Installers',
    }),
  }),
});

export const { useGetInstallersQuery } = installersApi;
