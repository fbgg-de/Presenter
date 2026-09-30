import { useEffect, useState } from 'react';
import { useGetSettings } from '@/store/settingsSlice';
import { nextcloudMediaActive, useNextcloud } from '@/nextcloud/connection';
import { invalidateMediaProbe, probeMediaUrl, resolveMediaUrl, type MediaProbeStatus } from '@/utils/mediaUrl';
import { isElectronApp } from '@/utils';

/**
 * Why media cannot load when it is the media folder's fault rather than one file's: none set up,
 * its server not answering, or (as the server says) the folder not there.
 */
export type MediaFolderIssue = 'unset' | 'unreachable' | 'missing';

/**
 * Whether media is set up: a folder on this computer in the desktop app; in the browser, which
 * cannot read one, a Nextcloud connection with its media folder chosen (and shared).
 */
export function useMediaFolderConfigured(): boolean {
  const { mediaPath } = useGetSettings('mediaPath');
  const nextcloud = useNextcloud();
  return isElectronApp() ? !!mediaPath?.trim() : nextcloudMediaActive(nextcloud);
}

/**
 * Whether `path` (a file in the media folder) cannot load because of the folder itself. A file that
 * is simply not there is not — the set list flags that on its own — and neither is an address
 * outside the media folder. Asked again whenever the media location changes.
 */
export function useMediaFolderIssue(path: string | undefined): MediaFolderIssue | undefined {
  const configured = useMediaFolderConfigured();
  const { mediaPath } = useGetSettings('mediaPath');
  const inFolder = !!path && !/^https?:\/\//i.test(path);
  const url = inFolder ? resolveMediaUrl(path) : undefined;
  const [probe, setProbe] = useState<{ url: string; status: MediaProbeStatus }>();

  useEffect(() => {
    if (!configured || !url) return;
    let cancelled = false;
    // A new location may answer now where the old one did not.
    invalidateMediaProbe(url);
    void probeMediaUrl(url).then((status) => {
      if (!cancelled) setProbe({ url, status });
    });
    return () => {
      cancelled = true;
    };
  }, [configured, url, mediaPath]);

  if (!inFolder) return undefined;
  if (!configured) return 'unset';
  return probe && probe.url === url && probe.status === 'server_down' ? 'unreachable' : undefined;
}
