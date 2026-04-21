import { useEffect, useState, useCallback, useMemo } from 'react';
import { Chip, IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Loop as LoopIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideIcon,
  DesktopWindows as ScreenIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setVideoVisible as setVideoVisibleRedux } from '@/store/presentationSlice';

/** Format seconds as mm:ss */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Extract filename from URL/path */
function videoName(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const parts = decoded.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

type VideoStatus = {
  hasVideo: boolean;
  paused: boolean;
  muted: boolean;
  loop: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  windowName?: string;
};

type Props = {
  videoSources: string[];
  /** When set, this bar only acts on / displays the named window's video.
   *  When undefined, this is the GENERAL bar that affects all windows. */
  windowName?: string;
  /** Optional label rendered before the controls (used as a fallback chip
   *  label when `variant='window'`). */
  label?: string;
  /**
   * Layout variant.
   *   - `'general'` (default when no windowName): only play/pause, stop, hide.
   *     Name, loop, seek/time and volume are hidden because they may differ
   *     across windows.
   *   - `'window'`  (default when windowName is set): full controls including
   *     a leading screen-icon chip with the window name, name, loop, seek and
   *     volume — these reflect the named window's current state.
   */
  variant?: 'general' | 'window';
  // If true, the bar will show when no local style-derived sources are present
  // but a presentation window reports a video via IPC. Default true.
  showIfNoLocalSources?: boolean;
};

const sendVideoCommand = (action: string, windowName?: string, value?: number, fadeDuration?: number) => {
  if (window.api?.videoCommand) {
    window.api.videoCommand({ action, windowName, value, fadeDuration });
  }
};

const VideoControlBar = ({ videoSources, windowName, label, variant, showIfNoLocalSources = true }: Props) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const hideTransitionMode = useAppSelector((s) => s.settings.hideTransitionMode);
  const hideTransitionDuration = useAppSelector((s) => s.settings.hideTransitionDuration);
  const videoFadeDuration = useAppSelector((s) => s.settings.videoFadeDuration);
  // For the general bar, keep visibility in Redux so keyboard shortcuts stay in sync.
  const globalVideoVisible = useAppSelector((s) => s.presentation.videoVisible);

  // Resolve variant: explicit prop wins, otherwise default by presence of windowName.
  const resolvedVariant: 'general' | 'window' = variant ?? (windowName ? 'window' : 'general');
  const isWindow = resolvedVariant === 'window';

  // Per-window status registry — keep last-known status keyed by windowName.
  // The General bar (no windowName) aggregates all of them.
  const [statusByWindow, setStatusByWindow] = useState<Record<string, VideoStatus>>({});
  // Per-window bars manage visibility locally; the general bar delegates to Redux.
  const [localVideoVisible, setLocalVideoVisible] = useState(true);
  const videoVisible = isWindow ? localVideoVisible : globalVideoVisible;

  useEffect(() => {
    if (!window.api?.onVideoStatus) return;

    const minIntervalMs = 150;
    const lastAppliedRef = { current: 0 } as { current: number };
    const lastByWindowRef = { current: {} as Record<string, VideoStatus> };
    let pendingTimer: number | null = null;

    const flush = () => {
      setStatusByWindow({ ...lastByWindowRef.current });
      lastAppliedRef.current = Date.now();
    };

    const cleanup = window.api.onVideoStatus((status: unknown) => {
      const s = status as Partial<VideoStatus>;
      const key = s.windowName || '__unnamed__';
      lastByWindowRef.current = {
        ...lastByWindowRef.current,
        [key]: {
          hasVideo: s.hasVideo ?? false,
          paused: s.paused ?? false,
          muted: s.muted ?? false,
          loop: s.loop ?? true,
          volume: s.volume ?? 1,
          currentTime: s.currentTime ?? 0,
          duration: s.duration ?? 0,
          windowName: s.windowName,
        },
      };
      const now = Date.now();
      const since = now - lastAppliedRef.current;
      if (since >= minIntervalMs) {
        flush();
        return;
      }
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => {
        flush();
        pendingTimer = null;
      }, minIntervalMs - since);
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    };
  }, []);

  // Resolve the effective status: filter to a single window, or aggregate.
  const effectiveStatus: VideoStatus = useMemo(() => {
    if (windowName) {
      return (
        statusByWindow[windowName] || { hasVideo: false, paused: false, muted: false, loop: true, volume: 1, currentTime: 0, duration: 0 }
      );
    }
    // Aggregate: hasVideo if any reports true; paused if ALL paused; use the
    // first-found timing/volume so the seek slider has a sensible value.
    const all = Object.values(statusByWindow).filter((s) => s.hasVideo);
    if (all.length === 0) return { hasVideo: false, paused: false, muted: false, loop: true, volume: 1, currentTime: 0, duration: 0 };
    return {
      hasVideo: true,
      paused: all.every((s) => s.paused),
      muted: all.every((s) => s.muted),
      loop: all.every((s) => s.loop),
      volume: all[0].volume,
      currentTime: all[0].currentTime,
      duration: all[0].duration,
    };
  }, [statusByWindow, windowName]);

  const hasVideos = videoSources.length > 0 || (showIfNoLocalSources && effectiveStatus.hasVideo);
  const isPlaying = hasVideos && !effectiveStatus.paused;

  const handlePlayPause = useCallback(() => {
    if (isPlaying) sendVideoCommand('pause', windowName, undefined, videoFadeDuration);
    else sendVideoCommand('play', windowName, undefined, videoFadeDuration);
  }, [isPlaying, windowName, videoFadeDuration]);

  const handleStop = useCallback(() => sendVideoCommand('stop', windowName, undefined, videoFadeDuration), [windowName, videoFadeDuration]);

  const handleToggleVisible = useCallback(() => {
    const next = !videoVisible;
    if (isWindow) {
      setLocalVideoVisible(next);
    } else {
      dispatch(setVideoVisibleRedux(next));
    }
    if (window.api?.setVideoVisible) {
      window.api.setVideoVisible({
        windowName,
        value: next,
        mode: hideTransitionMode,
        durationMs: hideTransitionDuration,
      });
    }
  }, [videoVisible, isWindow, windowName, hideTransitionMode, hideTransitionDuration, dispatch]);

  const loopTitle = useMemo(() => (effectiveStatus.loop ? LL.VIDEO.LOOP_ON() : LL.VIDEO.LOOP_OFF()), [effectiveStatus.loop, LL]);

  if (!hasVideos) return null;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}
    >
      {/* Window-variant rows are visually anchored by a screen-icon Chip with
          the window name so it's clear these controls are per-window. The
          general bar shows a plain caption label (e.g. "General"). */}
      {isWindow ? (
        <Chip
          icon={<ScreenIcon sx={{ fontSize: 16 }} />}
          label={windowName || label || ''}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500, minWidth: 80 }}
        />
      ) : (
        label && <Chip label={label} size="small" variant="filled" sx={{ fontWeight: 500, minWidth: 80 }} />
      )}
      <Tooltip title={isPlaying ? LL.VIDEO.PAUSE() : LL.VIDEO.PLAY()}>
        <IconButton size="small" onClick={handlePlayPause}>
          {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title={LL.VIDEO.STOP()}>
        <IconButton size="small" onClick={handleStop}>
          <StopIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={videoVisible ? LL.VIDEO.HIDE() : LL.VIDEO.SHOW()}>
        <IconButton size="small" onClick={handleToggleVisible} color={videoVisible ? 'default' : 'warning'}>
          {videoVisible ? <ShowIcon fontSize="small" /> : <HideIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      {/* Name / loop / seek / volume only on the per-window bar — these can
          differ between windows so they're meaningless on the general bar. */}
      {isWindow && videoSources.length > 0 && (
        <Stack sx={{ minWidth: 0 }}>
          {videoSources.map((src, i) => (
            <Typography key={i} variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem' }}>
              {videoName(src)}
            </Typography>
          ))}
        </Stack>
      )}
      {isWindow && (
        <Tooltip title={loopTitle}>
          <IconButton
            size="small"
            onClick={() => sendVideoCommand('toggle_loop', windowName)}
            color={effectiveStatus.loop ? 'primary' : 'default'}
          >
            <LoopIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isWindow && (
        <>
          {/* Seek bar */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: 32 }}>
            {formatTime(effectiveStatus.currentTime)}
          </Typography>
          <Slider
            size="small"
            min={0}
            max={effectiveStatus.duration || 100}
            value={effectiveStatus.currentTime}
            onChange={(_e, v) => sendVideoCommand('seek', windowName, v as number)}
            sx={{ flex: 1, mx: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: 32 }}>
            {formatTime(effectiveStatus.duration)}
          </Typography>
          {/* Volume */}
          <Tooltip title={effectiveStatus.muted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
            <IconButton size="small" onClick={() => sendVideoCommand('toggle_mute', windowName)}>
              {effectiveStatus.muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.05}
            value={effectiveStatus.muted ? 0 : effectiveStatus.volume}
            onChange={(_e, v) => sendVideoCommand('set_volume', windowName, v as number)}
            sx={{ width: 80 }}
          />
        </>
      )}
    </Stack>
  );
};

export default VideoControlBar;
