/**
 * "Am I safe to go live?" — one lamp beside the connection chips, the checks behind it:
 *
 * - every song of the show is in the offline cache (what a server outage mid-service falls back to),
 * - every media file of the show exists,
 * - every configured window is open, visible, and not on the operator's own screen,
 * - the relay connection (musicians, remote, viewers) is up.
 *
 * Green only when everything passes, amber otherwise — found before the service, not during it.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Chip, CircularProgress, Popover, Stack, Typography } from '@mui/material';
import { CheckCircle as OkIcon, ErrorOutlined as WarnIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { useGetShow } from '@/store/showSlice';
import { loadShowSongs, useGetSongs } from '@/store/songsSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSessionQuery } from '@/api/session.api';
import { usePresentationWindows } from '@/hooks/usePresentationWindows';
import { activeVersionOf, mediaItemDataOf } from '@/media/mediaItem';
import { invalidateMediaProbe, probeMediaUrl, resolveMediaUrl, getMediaProbeGeneration, subscribeMediaProbes } from '@/utils/mediaUrl';
import type { ShowItem } from '@/api/shows.api';
import { useNextcloud } from '@/nextcloud/connection';

type Check = {
  id: string;
  ok: boolean;
  status?: 'checking' | 'ready' | 'missing' | 'unverified';
  label: string;
  /** What is wrong, by name — only shown while failing. */
  detail?: string;
  action?: { label: string; run: () => void };
};

/** Song numbers stored in the offline cache (songsSlice's `presenter_cache`). */
const cachedSongNumbers = (): Set<string> => {
  try {
    return new Set(Object.keys(JSON.parse(localStorage.getItem('presenter_cache') ?? '{}').songs ?? {}));
  } catch {
    return new Set();
  }
};

const mediaPathsOf = (item: ShowItem): string[] => {
  if (item.type === 'document') return item.mediaPath ? [item.mediaPath] : [];
  if (item.type !== 'media') return [];
  const data = mediaItemDataOf(item);
  const paths = data ? activeVersionOf(data).sources.map((s) => s.path) : [item.mediaPath];
  return paths.filter((p): p is string => !!p);
};

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export const useReadiness = (generation: number): Check[] => {
  const { LL } = useI18nContext();
  const R = LL.OPERATOR.READINESS;
  const dispatch = useAppDispatch();
  const { currentShow } = useGetShow();
  const { songs } = useGetSongs();
  const { offlineMode } = useGetSettings('offlineMode');
  const { wsOperatorConnected } = useGetPresentationSettings('wsOperatorConnected');
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const { windows, screens, openAll } = usePresentationWindows();
  const order = useMemo(() => currentShow?.order ?? [], [currentShow?.order]);

  // Offline cache — read from storage, not the store: the store can hold a song the quota refused.
  const uncached = useMemo(() => {
    void generation;
    const cached = cachedSongNumbers();
    const numbers = [...new Set(order.filter((i) => i.type === 'song' && i.songNumber != null).map((i) => i.songNumber!))];
    return numbers.filter((n) => !cached.has(String(n))).map((n) => songs[n]?.title ?? `#${n}`);
  }, [order, songs, generation]);

  const nextcloud = useNextcloud();
  const media = useMemo(() => {
    void nextcloud;
    return [...new Set(order.flatMap(mediaPathsOf))].map((path) => ({ path, url: resolveMediaUrl(path) }));
  }, [order, nextcloud]);
  const probeGeneration = useSyncExternalStore(subscribeMediaProbes, getMediaProbeGeneration, getMediaProbeGeneration);
  const mediaKey = JSON.stringify([media, generation, probeGeneration]);
  const [mediaResult, setMediaResult] = useState<{ key: string; missing: string[]; unverified: string[] }>();
  const checking = media.length > 0 && mediaResult?.key !== mediaKey;
  const missingMedia = mediaResult?.key === mediaKey ? mediaResult.missing : [];
  const unverifiedMedia = mediaResult?.key === mediaKey ? mediaResult.unverified : [];
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      media.map(async ({ path, url }) => {
        const status = url ? await probeMediaUrl(url) : 'server_down';
        return { path, status };
      }),
    ).then((results) => {
      if (!cancelled)
        setMediaResult({
          key: mediaKey,
          missing: results.filter((result) => result.status === 'not_found').map((result) => fileName(result.path)),
          unverified: results.filter((result) => result.status === 'server_down').map((result) => fileName(result.path)),
        });
    });
    return () => {
      cancelled = true;
    };
  }, [media, mediaKey]);
  const mediaStatus = checking ? 'checking' : missingMedia.length ? 'missing' : unverifiedMedia.length ? 'unverified' : 'ready';

  const managed = windows.filter((w) => !w.unmanaged);
  const closed = managed.filter((w) => !w.isOpen).map((w) => w.name);
  const hidden = managed.filter((w) => w.isOpen && w.hidden).map((w) => w.name);
  // With a second screen attached, an output window on the operator's own screen is almost always misplaced.
  const onPrimary = screens.length > 1 ? managed.filter((w) => w.isOpen && w.screen?.isPrimary).map((w) => w.name) : [];
  const relayConfigured = !offlineMode && !!session?.settings?.wsHost?.host;

  const checks: Check[] = [
    {
      id: 'songs',
      ok: uncached.length === 0,
      label: R.SONGS_CACHED(),
      detail: R.NOT_CACHED({ names: uncached.join(', ') }),
      action:
        currentShow && !offlineMode
          ? { label: R.LOAD_SONGS(), run: () => void dispatch(loadShowSongs({ show: currentShow, forceRefetch: true })) }
          : undefined,
    },
    {
      id: 'media',
      ok: mediaStatus === 'ready',
      status: mediaStatus,
      label:
        mediaStatus === 'checking'
          ? R.CHECKING()
          : mediaStatus === 'missing'
            ? R.MEDIA_MISSING()
            : mediaStatus === 'unverified'
              ? R.UNVERIFIED()
              : R.MEDIA_FOUND(),
      detail: [
        missingMedia.length ? R.MISSING({ names: missingMedia.join(', ') }) : '',
        unverifiedMedia.length ? R.MEDIA_UNVERIFIED({ names: unverifiedMedia.join(', ') }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
  if (managed.length > 0) {
    checks.push({
      id: 'windows',
      ok: closed.length === 0 && hidden.length === 0 && onPrimary.length === 0,
      label: R.WINDOWS_READY(),
      detail: [
        closed.length ? R.CLOSED({ names: closed.join(', ') }) : '',
        hidden.length ? R.HIDDEN({ names: hidden.join(', ') }) : '',
        onPrimary.length ? R.ON_OPERATOR_SCREEN({ names: onPrimary.join(', ') }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
      action: closed.length ? { label: R.OPEN_ALL(), run: () => void openAll() } : undefined,
    });
  }
  if (relayConfigured) checks.push({ id: 'relay', ok: wsOperatorConnected, label: R.RELAY(), detail: R.RELAY_DOWN() });
  return checks;
};

export const ReadinessChip = () => {
  const { LL } = useI18nContext();
  const R = LL.OPERATOR.READINESS;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [generation, setGeneration] = useState(0);
  const checks = useReadiness(generation);
  const failing = checks.filter((c) => !c.ok).length;
  const checking = checks.some((check) => check.status === 'checking');
  const onlyUnverified = checks.filter((check) => !check.ok).every((check) => check.status === 'unverified');

  // Files may have been copied in since the last probe: opening the list checks again.
  const recheck = useCallback(() => {
    invalidateMediaProbe();
    setGeneration((g) => g + 1);
  }, []);

  return (
    <>
      <Chip
        size="small"
        icon={checking ? <CircularProgress size={14} color="inherit" /> : failing ? <WarnIcon /> : <OkIcon />}
        label={checking ? R.CHECKING() : failing ? (onlyUnverified ? R.UNVERIFIED() : R.ISSUES({ count: failing })) : R.READY()}
        color={failing ? 'warning' : 'success'}
        variant={failing ? 'filled' : 'outlined'}
        onClick={(e) => {
          recheck();
          setAnchor(e.currentTarget);
        }}
      />
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Stack spacing={1.25} sx={{ p: 2, width: 360, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{R.TITLE()}</Typography>
            <Button size="small" color="inherit" startIcon={<RefreshIcon />} onClick={recheck} disabled={checking}>
              {R.RECHECK()}
            </Button>
          </Stack>
          {checks.map((check) => (
            <Stack key={check.id} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              {check.status === 'checking' ? (
                <CircularProgress size={20} />
              ) : check.ok ? (
                <OkIcon fontSize="small" color="success" />
              ) : (
                <WarnIcon fontSize="small" color="warning" />
              )}
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2">{check.label}</Typography>
                {!check.ok && check.detail && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    {check.detail}
                  </Typography>
                )}
              </Stack>
              {!check.ok && check.action && (
                <Button size="small" color="inherit" variant="outlined" onClick={check.action.run} sx={{ flexShrink: 0 }}>
                  {check.action.label}
                </Button>
              )}
            </Stack>
          ))}
        </Stack>
      </Popover>
    </>
  );
};
