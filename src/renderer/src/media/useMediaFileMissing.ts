import { useEffect, useState } from 'react';
import { probeMediaUrl, resolveMediaUrl } from '@/utils/mediaUrl';

/**
 * Whether a media item's file is missing from the media folder.
 *
 * Only a definite "not found" counts: while the check runs, or when the media server itself is not
 * reachable, nothing is reported — a set list full of warnings because the server is still starting
 * would teach people to ignore them. Probes are cached, so many rows cost one request per file.
 */
export function useMediaFileMissing(path: string | undefined, generation = 0): boolean {
  const [missing, setMissing] = useState<{ url: string; missing: boolean } | null>(null);
  const url = path ? resolveMediaUrl(path) : undefined;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void probeMediaUrl(url).then((status) => {
      if (!cancelled) setMissing({ url, missing: status === 'not_found' });
    });
    return () => {
      cancelled = true;
    };
  }, [url, generation]);

  return !!url && missing?.url === url && missing.missing;
}
