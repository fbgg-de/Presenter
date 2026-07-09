/**
 * Unified video control panel for all presentation windows.
 *
 * One master row controls every window at once (play/pause/stop/hide/seek) and an
 * optional "video wall sync" mode keeps all windows time-synced so the same video
 * can be shown in different crops (via per-window masks/zoom) as one large canvas.
 * Per-window rows below allow managing each window separately.
 *
 * Sync engine: the operator receives per-window status reports (~500 ms). The first
 * window (sorted by name) acts as the clock master; other windows are re-seeked when
 * their extrapolated time drifts beyond a threshold, and their play/pause state is
 * aligned with the master. Corrections are rate-limited per window and skipped near
 * the end of the video (loop wrap would cause false positives).
 */
import { useEffect, useState, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Box, Chip, Collapse, IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material';
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
  Sync as SyncIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { setVideoVisible as setVideoVisibleRedux, useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { formatTime } from '@/utils';

type WinStatus = {
  hasVideo: boolean;
  paused: boolean;
  muted: boolean;
  loop: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  windowName?: string;
  /** Local receive timestamp — used to extrapolate currentTime between reports. */
  receivedAt: number;
};

const EMPTY_STATUS: WinStatus = {
  hasVideo: false,
  paused: false,
  muted: false,
  loop: true,
  volume: 1,
  currentTime: 0,
  duration: 0,
  receivedAt: 0,
};

/** Drift beyond this (seconds) triggers a corrective seek. */
const SYNC_DRIFT_THRESHOLD = 0.3;
/** Minimum pause between corrections per window (ms) — a seek needs time to settle. */
const SYNC_COOLDOWN_MS = 1500;

const sendVideoCommand = (action: string, windowName?: string, value?: number, fadeDuration?: number) => {
  if (window.api?.videoCommand) {
    window.api.videoCommand({ action, windowName, value, fadeDuration });
  }
};

/** Extrapolate a window's current playback time to "now". */
const estimatedTime = (s: WinStatus, now: number): number =>
  s.paused ? s.currentTime : s.currentTime + Math.max(0, now - s.receivedAt) / 1000;

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

/** Seek slider with drag-hold behavior (doesn't snap back before the seek is reflected). */
const SeekSlider = ({
  currentTime,
  duration,
  disabled,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  disabled?: boolean;
  onSeek: (v: number) => void;
}) => {
  const dragging = useRef(false);
  const target = useRef<number | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const shown = display !== null ? display : currentTime;
  if (target.current !== null && Math.abs(currentTime - target.current) < 1.5) {
    target.current = null;
    if (!dragging.current) setDisplay(null);
  }
  return (
    <>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', minWidth: 32 }}>
        {formatTime(shown)}
      </Typography>
      <Slider
        disabled={disabled}
        size="small"
        min={0}
        max={duration || 100}
        value={shown}
        onMouseDown={() => {
          dragging.current = true;
          setDisplay(currentTime);
        }}
        onChange={(_e, v) => {
          if (dragging.current) setDisplay(v as number);
        }}
        onChangeCommitted={(_e, v) => {
          dragging.current = false;
          target.current = v as number;
          setDisplay(v as number);
          onSeek(v as number);
        }}
        sx={{ flex: 1, minWidth: 60 }}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', minWidth: 32 }}>
        {formatTime(duration)}
      </Typography>
    </>
  );
};

/** Volume slider with drag-hold behavior. */
const VolumeSlider = ({
  muted,
  volume,
  disabled,
  onVolume,
}: {
  muted: boolean;
  volume: number;
  disabled?: boolean;
  onVolume: (v: number) => void;
}) => {
  const dragging = useRef(false);
  const [display, setDisplay] = useState<number | null>(null);
  const shown = display !== null ? display : muted ? 0 : volume;
  return (
    <Slider
      disabled={disabled}
      size="small"
      min={0}
      max={1}
      step={0.05}
      value={shown}
      onMouseDown={() => {
        dragging.current = true;
        setDisplay(muted ? 0 : volume);
      }}
      onChange={(_e, v) => {
        if (dragging.current) setDisplay(v as number);
      }}
      onChangeCommitted={(_e, v) => {
        dragging.current = false;
        setDisplay(null);
        onVolume(v as number);
      }}
      sx={{ width: 72 }}
    />
  );
};

const RowShell = ({ children }: { children: ReactNode }) => (
  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 2, py: 0.5 }}>
    {children}
  </Stack>
);

/** Compact single-window control row. */
const WindowRow = ({
  name,
  status,
  slim,
  onToggleVisible,
  visible,
}: {
  name: string;
  status: WinStatus;
  slim: boolean;
  visible: boolean;
  onToggleVisible: () => void;
}) => {
  const { LL } = useI18nContext();
  const { videoFadeDuration } = useGetSettings();
  const playing = status.hasVideo && !status.paused;

  return (
    <RowShell>
      <Chip
        icon={<ScreenIcon sx={{ fontSize: 14 }} />}
        label={name}
        size="small"
        variant="outlined"
        sx={{ fontWeight: 500, minWidth: 90, maxWidth: 140 }}
      />
      <Tooltip title={visible ? LL.VIDEO.HIDE() : LL.VIDEO.SHOW()}>
        <IconButton size="small" onClick={onToggleVisible} color={visible ? 'default' : 'warning'}>
          {visible ? <ShowIcon fontSize="small" /> : <HideIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      {!slim && (
        <>
          <Tooltip title={playing ? LL.VIDEO.PAUSE() : LL.VIDEO.PLAY()}>
            <IconButton
              size="small"
              onClick={() => sendVideoCommand(playing ? 'pause' : 'play', name, undefined, videoFadeDuration)}
              disabled={!status.hasVideo}
            >
              {playing ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.VIDEO.STOP()}>
            <IconButton
              size="small"
              onClick={() => sendVideoCommand('stop', name, undefined, videoFadeDuration)}
              disabled={!status.hasVideo}
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={status.loop ? LL.VIDEO.LOOP_ON() : LL.VIDEO.LOOP_OFF()}>
            <IconButton
              size="small"
              onClick={() => sendVideoCommand('toggle_loop', name)}
              color={status.loop ? 'primary' : 'default'}
              disabled={!status.hasVideo}
            >
              <LoopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <SeekSlider
            currentTime={status.currentTime}
            duration={status.duration}
            disabled={!status.hasVideo}
            onSeek={(v) => sendVideoCommand('seek', name, v)}
          />
          <Tooltip title={status.muted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
            <IconButton size="small" onClick={() => sendVideoCommand('toggle_mute', name)} disabled={!status.hasVideo}>
              {status.muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <VolumeSlider
            muted={status.muted}
            volume={status.volume}
            disabled={!status.hasVideo}
            onVolume={(v) => sendVideoCommand('set_volume', name, v)}
          />
        </>
      )}
    </RowShell>
  );
};

type Props = {
  /** Video sources of the active item / style — used for the filename hint. */
  videoSources: string[];
  /** Names of the currently open presentation windows. */
  windowNames: string[];
  /** True while the active show item is a video (the item preview is transport master). */
  mediaItemMaster?: boolean;
  /** Render even when no local sources are known (a window may still report a video). */
  showIfNoLocalSources?: boolean;
};

const VideoControlPanel = ({ videoSources, windowNames, mediaItemMaster = false, showIfNoLocalSources = true }: Props) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { hideTransitionMode, hideTransitionDuration, videoFadeDuration } = useGetSettings();
  const { videoVisible: globalVideoVisible } = useGetPresentationSettings();

  const [statusByWindow, setStatusByWindow] = useState<Record<string, WinStatus>>({});
  const [visibleByWindow, setVisibleByWindow] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(false);

  // ── Status subscription (single, throttled) ──
  useEffect(() => {
    if (!window.api?.onVideoStatus) return;

    const minIntervalMs = 150;
    const lastApplied = { current: 0 };
    const lastByWindow = { current: {} as Record<string, WinStatus> };
    let pendingTimer: number | null = null;

    const flush = () => {
      setStatusByWindow({ ...lastByWindow.current });
      lastApplied.current = Date.now();
    };

    const cleanup = window.api.onVideoStatus((status: unknown) => {
      const s = status as Partial<WinStatus>;
      const key = s.windowName || '__unnamed__';
      lastByWindow.current = {
        ...lastByWindow.current,
        [key]: {
          hasVideo: s.hasVideo ?? false,
          paused: s.paused ?? false,
          muted: s.muted ?? false,
          loop: s.loop ?? true,
          volume: s.volume ?? 1,
          currentTime: s.currentTime ?? 0,
          duration: s.duration ?? 0,
          windowName: s.windowName,
          receivedAt: Date.now(),
        },
      };
      const now = Date.now();
      const since = now - lastApplied.current;
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
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, []);

  // ── Video wall sync engine ──
  const lastCorrectionRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!syncEnabled) return;
    const withVideo = windowNames.filter((n) => statusByWindow[n]?.hasVideo).sort();
    if (withVideo.length < 2) return;
    const now = Date.now();
    const master = statusByWindow[withVideo[0]];
    const masterTime = estimatedTime(master, now);
    // Skip corrections near the loop boundary — times wrap and drift readings lie.
    if (master.duration > 0 && master.duration - masterTime < 1) return;

    for (const name of withVideo.slice(1)) {
      const s = statusByWindow[name];
      const last = lastCorrectionRef.current[name] ?? 0;
      if (now - last < SYNC_COOLDOWN_MS) continue;
      // Align play/pause state with the master first.
      if (s.paused !== master.paused) {
        sendVideoCommand(master.paused ? 'pause' : 'play', name, undefined, 0);
        lastCorrectionRef.current[name] = now;
        continue;
      }
      const drift = Math.abs(estimatedTime(s, now) - masterTime);
      if (drift > SYNC_DRIFT_THRESHOLD && drift < (master.duration || Infinity) / 2) {
        // Small lead compensates command latency; clamp into the video.
        sendVideoCommand('seek', name, Math.min(masterTime + 0.05, Math.max(0, (s.duration || masterTime) - 0.1)));
        lastCorrectionRef.current[name] = now;
      }
    }
  }, [syncEnabled, statusByWindow, windowNames]);

  // ── Aggregated master state ──
  const aggregate = useMemo(() => {
    const all = windowNames.map((n) => statusByWindow[n]).filter((s): s is WinStatus => !!s && s.hasVideo);
    if (all.length === 0) return { ...EMPTY_STATUS };
    return {
      ...all[0],
      hasVideo: true,
      paused: all.every((s) => s.paused),
    };
  }, [statusByWindow, windowNames]);

  const anyStatusVideo = Object.values(statusByWindow).some((s) => s.hasVideo);
  const hasVideos = videoSources.length > 0 || (showIfNoLocalSources && anyStatusVideo);
  const isPlaying = aggregate.hasVideo && !aggregate.paused;
  const allVisible = globalVideoVisible;

  const handleToggleVisibleAll = useCallback(() => {
    const next = !allVisible;
    dispatch(setVideoVisibleRedux(next));
    setVisibleByWindow({});
    if (window.api?.setVideoVisible) {
      window.api.setVideoVisible({ value: next, mode: hideTransitionMode, durationMs: hideTransitionDuration });
    }
  }, [allVisible, dispatch, hideTransitionMode, hideTransitionDuration]);

  const handleToggleVisibleWindow = useCallback(
    (name: string) => {
      setVisibleByWindow((prev) => {
        const next = !(prev[name] ?? allVisible);
        if (window.api?.setVideoVisible) {
          window.api.setVideoVisible({ windowName: name, value: next, mode: hideTransitionMode, durationMs: hideTransitionDuration });
        }
        return { ...prev, [name]: next };
      });
    },
    [allVisible, hideTransitionMode, hideTransitionDuration],
  );

  if (!hasVideos) return null;

  const showWindowRows = windowNames.length > 0;

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}>
      {/* ── Master row: acts on ALL windows ── */}
      <RowShell>
        <Chip label={LL.VIDEO.ALL_WINDOWS()} size="small" sx={{ fontWeight: 600, minWidth: 90, maxWidth: 140 }} />
        <Tooltip title={allVisible ? LL.VIDEO.HIDE_ALL() : LL.VIDEO.SHOW_ALL()}>
          <IconButton size="small" onClick={handleToggleVisibleAll} color={allVisible ? 'default' : 'warning'}>
            {allVisible ? <ShowIcon fontSize="small" /> : <HideIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        {!mediaItemMaster && (
          <>
            <Tooltip title={isPlaying ? LL.VIDEO.PAUSE_ALL() : LL.VIDEO.PLAY_ALL()}>
              <IconButton
                size="small"
                onClick={() => sendVideoCommand(isPlaying ? 'pause' : 'play', undefined, undefined, videoFadeDuration)}
              >
                {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title={LL.VIDEO.STOP_ALL()}>
              <IconButton size="small" onClick={() => sendVideoCommand('stop', undefined, undefined, videoFadeDuration)}>
                <StopIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={LL.VIDEO.SYNC_HINT()}>
              <IconButton size="small" onClick={() => setSyncEnabled((v) => !v)} color={syncEnabled ? 'primary' : 'default'}>
                <SyncIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <SeekSlider
              currentTime={aggregate.currentTime}
              duration={aggregate.duration}
              disabled={!aggregate.hasVideo}
              onSeek={(v) => sendVideoCommand('seek', undefined, v)}
            />
          </>
        )}
        {mediaItemMaster && <Box sx={{ flex: 1 }} />}
        {syncEnabled && !mediaItemMaster && (
          <Chip label={LL.VIDEO.SYNC()} size="small" color="primary" variant="outlined" sx={{ height: 20 }} />
        )}
        {videoSources.length > 0 && (
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem', maxWidth: 160 }}>
            {videoName(videoSources[0])}
          </Typography>
        )}
        {showWindowRows && (
          <Tooltip title={LL.VIDEO.WINDOW_CONTROLS()}>
            <IconButton size="small" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </RowShell>

      {/* ── Per-window rows ── */}
      {showWindowRows && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
            {windowNames.map((name) => (
              <WindowRow
                key={name}
                name={name}
                status={statusByWindow[name] ?? EMPTY_STATUS}
                slim={mediaItemMaster}
                visible={visibleByWindow[name] ?? allVisible}
                onToggleVisible={() => handleToggleVisibleWindow(name)}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

export default VideoControlPanel;
