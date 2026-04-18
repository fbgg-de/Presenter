import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Loop as LoopIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector } from '@/store';
import ControlSong from '@/components/ControlSong';
import ControlBibleVerse from '@/components/ControlBibleVerse';
import ControlMedia from '@/components/ControlMedia';
import { useGetStylesQuery } from '@/api/styles.api';
import { resolveStyleCascade, mergeStyles, DEFAULT_STYLE } from '@/utils/styleUtils';

const MEDIA_SERVER_BASE = 'http://localhost:9100';

/** Format seconds as mm:ss */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function resolveMediaUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://') || path.startsWith('/')) return path;
  if (/^[a-zA-Z]:[/\\]/.test(path)) return 'file:///' + path.replace(/\\/g, '/');
  const normalised = path.replace(/\\/g, '/');
  return `${MEDIA_SERVER_BASE}/${normalised.split('/').map(encodeURIComponent).join('/')}`;
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

const sendVideoCommand = (action: string, value?: number) => {
  if (window.api?.videoCommand) {
    window.api.videoCommand({ action, value });
  }
};

const Control = () => {
  const { LL } = useI18nContext();
  const activeItemIndex = useAppSelector((state) => state.presentation.activeItemIndex);
  const currentShow = useAppSelector((state) => state.show.currentShow);
  const globalStyleId = useAppSelector((state) => state.settings.globalStyleId);
  const { data: allStyles } = useGetStylesQuery();

  // Get the active show item
  const activeItem = currentShow?.order?.[activeItemIndex];

  // Resolve style cascade to check for background video
  const backgroundVideoUrl = useMemo(() => {
    if (!allStyles) return undefined;
    const globalStyle = globalStyleId ? allStyles.find((s) => s.id === globalStyleId) : undefined;
    const showStyle = currentShow?.styleId ? allStyles.find((s) => s.id === currentShow.styleId) : undefined;
    const itemStyle = activeItem?.styleId ? allStyles.find((s) => s.id === activeItem.styleId) : undefined;
    const resolved = mergeStyles(DEFAULT_STYLE, resolveStyleCascade(globalStyle, showStyle, itemStyle, undefined, allStyles));
    return resolved.backgroundVideo ? resolveMediaUrl(resolved.backgroundVideo) : undefined;
  }, [allStyles, globalStyleId, currentShow?.styleId, activeItem?.styleId]);

  // Determine if current item is a video media item
  const mediaVideoUrl =
    activeItem?.type === 'media' && activeItem.mediaSubType === 'video' && activeItem.mediaPath
      ? resolveMediaUrl(activeItem.mediaPath)
      : undefined;

  // Collect all active video sources for the global control bar
  const videoSources = useMemo(() => {
    const sources: string[] = [];
    if (backgroundVideoUrl) sources.push(backgroundVideoUrl);
    if (mediaVideoUrl) sources.push(mediaVideoUrl);
    return sources;
  }, [backgroundVideoUrl, mediaVideoUrl]);

  // Video status synced from presentation windows via IPC
  const [videoStatus, setVideoStatus] = useState<{
    hasVideo: boolean;
    paused: boolean;
    muted: boolean;
    loop: boolean;
    volume: number;
    currentTime: number;
    duration: number;
  }>({ hasVideo: false, paused: false, muted: false, loop: true, volume: 1, currentTime: 0, duration: 0 });

  const hasVideos = videoSources.length > 0 || videoStatus.hasVideo;

  useEffect(() => {
    if (!window.api?.onVideoStatus) return;
    const cleanup = window.api.onVideoStatus((status: unknown) => {
      const s = status as typeof videoStatus;
      setVideoStatus({
        hasVideo: s.hasVideo ?? false,
        paused: s.paused ?? false,
        muted: s.muted ?? false,
        loop: s.loop ?? true,
        volume: s.volume ?? 1,
        currentTime: s.currentTime ?? 0,
        duration: s.duration ?? 0,
      });
    });
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, []);

  const isPlaying = hasVideos && !videoStatus.paused;

  const handleGlobalPlay = useCallback(() => {
    sendVideoCommand('play');
  }, []);

  const handleGlobalPause = useCallback(() => {
    sendVideoCommand('pause');
  }, []);

  const handleGlobalStop = useCallback(() => {
    sendVideoCommand('stop');
  }, []);

  // No show loaded or no items
  if (!currentShow || !currentShow.order || currentShow.order.length === 0) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{LL.CONTROL.NO_ITEM()}</Typography>
      </Stack>
    );
  }

  // No active item selected
  if (!activeItem) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{LL.CONTROL.NO_ITEM()}</Typography>
      </Stack>
    );
  }

  // Dispatch to sub-component based on item type
  const renderControl = () => {
    switch (activeItem.type) {
      case 'song':
        return <ControlSong />;
      case 'bible_verse':
        return <ControlBibleVerse item={activeItem} />;
      case 'media':
        return <ControlMedia item={activeItem} />;
      default:
        return <ControlSong />;
    }
  };

  return (
    <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
      <Stack sx={{ flexGrow: 1, overflow: 'auto' }}>{renderControl()}</Stack>
      {hasVideos && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}
        >
          <Tooltip title={isPlaying ? LL.VIDEO.PAUSE() : LL.VIDEO.PLAY()}>
            <IconButton size="small" onClick={isPlaying ? handleGlobalPause : handleGlobalPlay}>
              {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.VIDEO.STOP()}>
            <IconButton size="small" onClick={handleGlobalStop}>
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Stack sx={{ minWidth: 0 }}>
            {videoSources.map((src, i) => (
              <Typography key={i} variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem' }}>
                {videoName(src)}
              </Typography>
            ))}
          </Stack>
          <Tooltip title={videoStatus.loop ? LL.VIDEO.LOOP_ON() : LL.VIDEO.LOOP_OFF()}>
            <IconButton size="small" onClick={() => sendVideoCommand('toggle_loop')} color={videoStatus.loop ? 'primary' : 'default'}>
              <LoopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {/* Seek bar */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: 32 }}>
            {formatTime(videoStatus.currentTime)}
          </Typography>
          <Slider
            size="small"
            min={0}
            max={videoStatus.duration || 100}
            value={videoStatus.currentTime}
            onChange={(_e, v) => sendVideoCommand('seek', v as number)}
            sx={{ flex: 1, mx: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: 32 }}>
            {formatTime(videoStatus.duration)}
          </Typography>
          {/* Volume */}
          <Tooltip title={videoStatus.muted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
            <IconButton size="small" onClick={() => sendVideoCommand('toggle_mute')}>
              {videoStatus.muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.05}
            value={videoStatus.muted ? 0 : videoStatus.volume}
            onChange={(_e, v) => sendVideoCommand('set_volume', v as number)}
            sx={{ width: 80 }}
          />
        </Stack>
      )}
    </Stack>
  );
};

export default Control;
