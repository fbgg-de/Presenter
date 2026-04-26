import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { useAppDispatch } from '@/store';
import { setVideoVisible as setVideoVisibleRedux, useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { formatTime } from '@/utils';

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
  /** When set, this bar only acts on / displays the named window's video. */
  windowName?: string;
  /** Optional label rendered before the controls. */
  label?: string;
  variant?: 'general' | 'window';
  showIfNoLocalSources?: boolean;
  /** When true, audio controls are hidden in the general bar
   *  (preview is master for media-item videos). Ignored for window variant. */
  disableAudio?: boolean;
  /** When true, the window variant collapses to only the hide/show button.
   *  Used when the item-preview is master for a media-item video. */
  slim?: boolean;
};

const sendVideoCommand = (action: string, windowName?: string, value?: number, fadeDuration?: number) => {
  if (window.api?.videoCommand) {
    window.api.videoCommand({ action, windowName, value, fadeDuration });
  }
};

/** Extract filename from URL/path */
const videoName = (url: string): string => {
  try {
    const decoded = decodeURIComponent(url);
    const parts = decoded.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
};

const VideoControlBar = ({
  videoSources,
  windowName,
  label,
  variant,
  showIfNoLocalSources = true,
  disableAudio = false,
  slim = false,
}: Props) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();

  const { hideTransitionMode, hideTransitionDuration, videoFadeDuration } = useGetSettings();
  const { videoVisible: globalVideoVisible } = useGetPresentationSettings();

  const resolvedVariant: 'general' | 'window' = variant ?? (windowName ? 'window' : 'general');
  const isWindow = resolvedVariant === 'window';

  const [statusByWindow, setStatusByWindow] = useState<Record<string, VideoStatus>>({});
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

  const effectiveStatus: VideoStatus = useMemo(() => {
    if (windowName) {
      return (
        statusByWindow[windowName] ?? { hasVideo: false, paused: false, muted: false, loop: true, volume: 1, currentTime: 0, duration: 0 }
      );
    }
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
      window.api.setVideoVisible({ windowName, value: next, mode: hideTransitionMode, durationMs: hideTransitionDuration });
    }
  }, [videoVisible, isWindow, windowName, hideTransitionMode, hideTransitionDuration, dispatch]);

  // Seek slider — drag-hold until currentTime catches up
  const seekDragging = useRef(false);
  const seekTarget = useRef<number | null>(null);
  const [seekDisplay, setSeekDisplay] = useState<number | null>(null);
  const displaySeek = seekDisplay !== null ? seekDisplay : effectiveStatus.currentTime;
  if (seekTarget.current !== null && Math.abs(effectiveStatus.currentTime - seekTarget.current) < 1.5) {
    seekTarget.current = null;
    if (!seekDragging.current) setSeekDisplay(null);
  }

  // Volume slider
  const volumeDragging = useRef(false);
  const [volumeDisplay, setVolumeDisplay] = useState<number | null>(null);
  const displayVolume = volumeDisplay !== null ? volumeDisplay : effectiveStatus.muted ? 0 : effectiveStatus.volume;

  if (!hasVideos) return null;

  // ── General row: Hide-all-windows + global Pause/Stop (affect every window).
  // No label chip; audio is intentionally not exposed here (audio is the
  // domain of the item-preview master, when applicable).
  if (!isWindow) {
    return (
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}
      >
        <Tooltip title={videoVisible ? LL.VIDEO.HIDE_ALL() : LL.VIDEO.SHOW_ALL()}>
          <IconButton size="small" onClick={handleToggleVisible} color={videoVisible ? 'default' : 'warning'}>
            {videoVisible ? <ShowIcon fontSize="small" /> : <HideIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
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
        {videoSources.length > 0 && (
          <Stack sx={{ minWidth: 0, ml: 'auto' }}>
            {videoSources.map((src, i) => (
              <Typography key={i} variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem' }}>
                {videoName(src)}
              </Typography>
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  // ── Window variant — slim mode: only chip + hide/show (used when a media
  //    item video is active and the preview is master).
  if (slim) {
    return (
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}
      >
        <Chip
          icon={<ScreenIcon sx={{ fontSize: 16 }} />}
          label={windowName || label || ''}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500, minWidth: 80 }}
        />
        <Tooltip title={videoVisible ? LL.VIDEO.HIDE() : LL.VIDEO.SHOW()}>
          <IconButton size="small" onClick={handleToggleVisible} color={videoVisible ? 'default' : 'warning'}>
            {videoVisible ? <ShowIcon fontSize="small" /> : <HideIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }

  // ── Window variant — full single-line layout:
  //    chip · play/pause · stop · hide · loop · seek · mute · volume · filename
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}
    >
      <Chip
        icon={<ScreenIcon sx={{ fontSize: 16 }} />}
        label={windowName || label || ''}
        size="small"
        variant="outlined"
        sx={{ fontWeight: 500, minWidth: 80 }}
      />
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
      <Tooltip title={effectiveStatus.loop ? LL.VIDEO.LOOP_ON() : LL.VIDEO.LOOP_OFF()}>
        <IconButton
          size="small"
          onClick={() => sendVideoCommand('toggle_loop', windowName)}
          color={effectiveStatus.loop ? 'primary' : 'default'}
        >
          <LoopIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {/* Position (seek) — comes BEFORE the volume slider per request. */}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: 32 }}>
        {formatTime(displaySeek)}
      </Typography>
      <Slider
        disabled={!effectiveStatus.hasVideo}
        size="small"
        min={0}
        max={effectiveStatus.duration || 100}
        value={displaySeek}
        onMouseDown={() => {
          seekDragging.current = true;
          setSeekDisplay(effectiveStatus.currentTime);
        }}
        onChange={(_e, v) => {
          if (seekDragging.current) setSeekDisplay(v as number);
        }}
        onChangeCommitted={(_e, v) => {
          seekDragging.current = false;
          seekTarget.current = v as number;
          setSeekDisplay(v as number);
          sendVideoCommand('seek', windowName, v as number);
        }}
        sx={{ flex: 1, minWidth: 80 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: 32 }}>
        {formatTime(effectiveStatus.duration)}
      </Typography>
      {!disableAudio && (
        <>
          <Tooltip title={effectiveStatus.muted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
            <IconButton size="small" onClick={() => sendVideoCommand('toggle_mute', windowName)}>
              {effectiveStatus.muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Slider
            disabled={!effectiveStatus.hasVideo}
            size="small"
            min={0}
            max={1}
            step={0.05}
            value={displayVolume}
            onMouseDown={() => {
              volumeDragging.current = true;
              setVolumeDisplay(effectiveStatus.muted ? 0 : effectiveStatus.volume);
            }}
            onChange={(_e, v) => {
              if (volumeDragging.current) setVolumeDisplay(v as number);
            }}
            onChangeCommitted={(_e, v) => {
              volumeDragging.current = false;
              setVolumeDisplay(null);
              sendVideoCommand('set_volume', windowName, v as number);
            }}
            sx={{ width: 80 }}
          />
        </>
      )}
      {videoSources.length > 0 && (
        <Stack sx={{ minWidth: 0 }}>
          {videoSources.map((src, i) => (
            <Typography key={i} variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem', maxWidth: 140 }}>
              {videoName(src)}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default VideoControlBar;
