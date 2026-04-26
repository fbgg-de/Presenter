import { useCallback, useRef, useState, memo, CSSProperties, ReactNode } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Image as ImageIcon,
  Videocam as VideocamIcon,
  Palette as PaletteIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Loop as LoopIcon,
  VolumeUp as VolumeIcon,
  VolumeOff as MuteIcon,
  Tune as TuneIcon,
  RestartAlt as ResetIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useAppDispatch } from '@/store';
import { updateShowItem } from '@/store/showSlice';
import CompactPositionPicker from '@/components/common/CompactPositionPicker';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { formatTime } from '@/utils';

// ── Shared utility ───────────────────────────────────────────────────────────

/**
 * Send a video command that targets ONLY the media-item <video> elements
 * (identified by data-role="media-item") in all presentation windows.
 * Style background videos are NOT affected.
 */
const sendMediaItemCommand = (action: string, value?: number) => {
  if (window.api?.videoCommand) {
    void window.api.videoCommand({ action, value, target: 'media-item' });
  }
};

/** Show or hide the video layer on ALL presentation windows. */
const sendSetVideoVisible = (visible: boolean, hideTransitionMode?: string, hideTransitionDuration?: number) => {
  if (window.api?.setVideoVisible) {
    void window.api.setVideoVisible({
      value: visible,
      mode: hideTransitionMode as 'cut' | 'fade' | undefined,
      durationMs: hideTransitionDuration,
    });
  }
};

// ── Reusable sub-components ──────────────────────────────────────────────────

/** Wrapper that constrains the preview area to 60vh, centered. */
const PreviewFrame = ({ children, bgcolor = '#000' }: { children: ReactNode; bgcolor?: string }) => (
  <Box
    sx={{
      height: '45vh',
      bgcolor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}
  >
    {children}
  </Box>
);

/** Empty-state placeholder shown when no media path is available. */
const MediaPlaceholder = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <PreviewFrame>
    <Stack alignItems="center" spacing={1} sx={{ opacity: 0.5 }}>
      <Box sx={{ fontSize: 48 }}>{icon}</Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  </PreviewFrame>
);

interface VideoControlsProps {
  playing: boolean;
  muted: boolean;
  volume: number;
  loop: boolean;
  videoVisible: boolean;
  currentTime: number;
  duration: number;
  mediaPath?: string;
  onToggle: () => void;
  onStop: () => void;
  onMute: () => void;
  onLoopToggle: () => void;
  onToggleVisible: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
}

/**
 * Local-only video controls for the item preview.
 * These controls affect ONLY the preview <video> element — they do NOT broadcast
 * to presentation windows. Presentation windows play independently (autoplay/loop)
 * based on the item's saved settings.
 */
const VideoControls = ({
  playing,
  muted,
  volume,
  loop,
  videoVisible,
  currentTime,
  duration,
  mediaPath,
  onToggle,
  onStop,
  onMute,
  onLoopToggle,
  onToggleVisible,
  onSeek,
  onVolume,
}: VideoControlsProps) => {
  const { LL } = useI18nContext();

  // Seek slider — keep the drag value set until the external currentTime
  // catches up so the slider never snaps back before the seek is reflected.
  const seekDragging = useRef(false);
  const seekTarget = useRef<number | null>(null);
  const [seekDisplay, setSeekDisplay] = useState<number | null>(null);

  const displayTime = seekDisplay !== null ? seekDisplay : currentTime;

  if (seekTarget.current !== null && Math.abs(currentTime - seekTarget.current) < 1.5) {
    seekTarget.current = null;
    if (!seekDragging.current) setSeekDisplay(null);
  }

  // Volume slider
  const volumeDragging = useRef(false);
  const [volumeDisplay, setVolumeDisplay] = useState<number | null>(null);
  const displayVolume = volumeDisplay !== null ? volumeDisplay : muted ? 0 : volume;

  return (
    <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
      {/* Row 1: seek bar */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36 }}>
          {formatTime(displayTime)}
        </Typography>
        <Slider
          size="small"
          min={0}
          max={duration || 1}
          step={0.5}
          value={displayTime}
          onMouseDown={() => {
            seekDragging.current = true;
            setSeekDisplay(currentTime);
          }}
          onChange={(_, v) => {
            if (seekDragging.current) setSeekDisplay(v as number);
          }}
          onChangeCommitted={(_, v) => {
            seekDragging.current = false;
            seekTarget.current = v as number;
            setSeekDisplay(v as number);
            onSeek(v as number);
          }}
          sx={{ flex: 1 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: 'right' }}>
          {formatTime(duration)}
        </Typography>
      </Stack>

      {/* Row 2: transport + visibility + loop + audio + filename */}
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Tooltip title={playing ? LL.VIDEO.PAUSE() : LL.VIDEO.PLAY()}>
          <IconButton size="small" onClick={onToggle}>
            {playing ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={LL.VIDEO.STOP()}>
          <IconButton size="small" onClick={onStop}>
            <StopIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={videoVisible ? LL.VIDEO.HIDE_ALL() : LL.VIDEO.SHOW_ALL()}>
          <IconButton size="small" onClick={onToggleVisible} color={videoVisible ? 'default' : 'warning'}>
            {videoVisible ? <ShowIcon fontSize="small" /> : <HideIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={loop ? LL.VIDEO.LOOP_ON() : LL.VIDEO.LOOP_OFF()}>
          <IconButton size="small" onClick={onLoopToggle} color={loop ? 'primary' : 'default'}>
            <LoopIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={muted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
          <IconButton size="small" onClick={onMute}>
            {muted ? <MuteIcon fontSize="small" /> : <VolumeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Slider
          size="small"
          min={0}
          max={1}
          step={0.05}
          value={displayVolume}
          onMouseDown={() => {
            volumeDragging.current = true;
            setVolumeDisplay(muted ? 0 : volume);
          }}
          onChange={(_, v) => {
            if (volumeDragging.current) setVolumeDisplay(v as number);
          }}
          onChangeCommitted={(_, v) => {
            volumeDragging.current = false;
            setVolumeDisplay(null);
            onVolume(v as number);
          }}
          sx={{ width: 80 }}
        />
        <Box flex={1} />
        {mediaPath && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
            {mediaPath.replace(/.*[/\\]/, '')}
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

interface DisplayOptionsProps {
  item: ShowItem;
  patch: (fields: Partial<ShowItem>) => void;
}

/** Display options panel — single row with fit / position / zoom / blur / autoplay. */
const DisplayOptions = ({ item, patch }: DisplayOptionsProps) => {
  const { LL } = useI18nContext();
  const isVideo = item.mediaSubType === 'video';

  const [zoomLocal, setZoomLocal] = useState<number | null>(null);
  const [blurLocal, setBlurLocal] = useState<number | null>(null);

  const objectFit = item.mediaObjectFit ?? 'cover';
  const objectPosition = item.mediaObjectPosition ?? 'center';
  const zoom = zoomLocal ?? item.mediaZoom ?? 100;
  const blur = blurLocal ?? item.mediaBlur ?? 0;
  const autoplay = item.mediaAutoplay !== false;

  return (
    <>
      <Divider />
      <CardContent sx={{ pt: 1.5, pb: '12px !important' }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
          <TuneIcon fontSize="small" color="action" />
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {LL.MEDIA.DISPLAY_OPTIONS()}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Fit</InputLabel>
            <Select label="Fit" value={objectFit} onChange={(e) => patch({ mediaObjectFit: e.target.value as ShowItem['mediaObjectFit'] })}>
              <MenuItem value="cover">{LL.MEDIA.FIT_COVER()}</MenuItem>
              <MenuItem value="contain">{LL.MEDIA.FIT_CONTAIN()}</MenuItem>
              <MenuItem value="fill">{LL.MEDIA.FIT_FILL()}</MenuItem>
            </Select>
          </FormControl>
          {/* Position picker — reuses the compact 3×3 grid from the style editor */}
          <CompactPositionPicker value={objectPosition} onChange={(v) => patch({ mediaObjectPosition: v })} tooltip={LL.MEDIA.POSITION()} />
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {LL.MEDIA.ZOOM()} {zoom}%
          </Typography>
          <Slider
            size="small"
            min={50}
            max={300}
            step={5}
            value={zoom}
            onChange={(_, v) => setZoomLocal(v as number)}
            onChangeCommitted={(_, v) => {
              setZoomLocal(null);
              patch({ mediaZoom: v as number });
            }}
            sx={{ flex: 1, minWidth: 60 }}
          />
          <Tooltip title="Reset to 100%">
            <IconButton
              size="small"
              onClick={() => {
                setZoomLocal(null);
                patch({ mediaZoom: 100 });
              }}
            >
              <ResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {LL.MEDIA.BLUR()} {blur}px
          </Typography>
          <Slider
            size="small"
            min={0}
            max={40}
            step={1}
            value={blur}
            onChange={(_, v) => setBlurLocal(v as number)}
            onChangeCommitted={(_, v) => {
              setBlurLocal(null);
              patch({ mediaBlur: v as number });
            }}
            sx={{ flex: 1, minWidth: 60 }}
          />
          {/* Autoplay toggle for videos — Loop is exposed as the toggle button
              in the preview controls (no separate switch here). */}
          {isVideo && (
            <FormControlLabel
              control={<Switch size="small" checked={autoplay} onChange={(e) => patch({ mediaAutoplay: e.target.checked })} />}
              label={<Typography variant="caption">{LL.MEDIA.AUTOPLAY()}</Typography>}
            />
          )}
        </Stack>
      </CardContent>
    </>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

interface ControlMediaProps {
  item: ShowItem;
}

const ControlMedia = ({ item }: ControlMediaProps) => {
  const dispatch = useAppDispatch();
  const { hideTransitionMode, hideTransitionDuration } = useGetSettings();
  const { activeItemIndex } = useGetPresentationSettings();

  const resolvedPath = resolveMediaUrl(item.mediaPath);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Track whether the media-item video is visible on all presentation windows.
  const [videoVisible, setVideoVisible] = useState(true);

  const patch = useCallback(
    (fields: Partial<ShowItem>) => dispatch(updateShowItem({ index: activeItemIndex, item: fields })),
    [dispatch, activeItemIndex],
  );

  // Play/Pause — affects both the local preview AND the media-item video in
  // every presentation window (but NOT style background videos).
  const handleVideoToggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      sendMediaItemCommand('play');
    } else {
      v.pause();
      sendMediaItemCommand('pause');
    }
  }, []);

  const handleStop = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setCurrentTime(0);
    sendMediaItemCommand('stop');
  }, []);

  const handleMuteToggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const handleSeek = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = value;
  }, []);

  const handleVolume = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    if (value === 0) {
      v.muted = true;
      setMuted(true);
    } else if (v.muted) {
      v.muted = false;
      setMuted(false);
    }
    setVolume(value);
  }, []);

  // Loop toggle — flips the item's `mediaLoop` setting. This propagates to
  // both the preview (via the loop attribute) and presentation windows
  // (through the broadcast in usePresentationSync).
  const handleLoopToggle = useCallback(() => {
    patch({ mediaLoop: item.mediaLoop === false });
  }, [patch, item.mediaLoop]);

  // Hide/Show all presentation windows for this video.
  const handleToggleVisible = useCallback(() => {
    const next = !videoVisible;
    setVideoVisible(next);
    sendSetVideoVisible(next, hideTransitionMode, hideTransitionDuration);
  }, [videoVisible, hideTransitionMode, hideTransitionDuration]);

  const objectFit = item.mediaObjectFit ?? 'cover';
  const objectPosition = item.mediaObjectPosition ?? 'center';
  const zoom = item.mediaZoom ?? 100;
  const blur = item.mediaBlur ?? 0;
  const loop = item.mediaLoop !== false;
  const autoplay = item.mediaAutoplay !== false;

  const mediaStyle: CSSProperties = {
    maxWidth: '100%',
    maxHeight: '45vh',
    objectFit,
    objectPosition,
    transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
    filter: blur > 0 ? `blur(${blur}px)` : undefined,
    display: 'block',
  };

  const renderPreview = () => {
    switch (item.mediaSubType) {
      case 'color':
        return (
          <PreviewFrame bgcolor={item.mediaColor || '#000000'}>
            <Stack alignItems="center" spacing={0.5}>
              <PaletteIcon sx={{ fontSize: 32, filter: 'drop-shadow(0 0 4px rgba(0,0,0,.6))', color: '#fff' }} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#fff', textShadow: '0 1px 3px #000' }}>
                {item.mediaColor || '#000000'}
              </Typography>
            </Stack>
          </PreviewFrame>
        );

      case 'video':
        return resolvedPath ? (
          <>
            <PreviewFrame>
              <Box
                component="video"
                ref={videoRef}
                src={resolvedPath}
                playsInline
                loop={loop}
                autoPlay={autoplay}
                style={{ ...mediaStyle, cursor: 'pointer' }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) => {
                  const vid = e.target as HTMLVideoElement;
                  setDuration(vid.duration);
                  setVolume(vid.volume);
                  setMuted(vid.muted);
                }}
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onVolumeChange={(e) => {
                  const vid = e.target as HTMLVideoElement;
                  setMuted(vid.muted);
                  setVolume(vid.volume);
                }}
                onClick={handleVideoToggle}
              />
            </PreviewFrame>
            <VideoControls
              playing={playing}
              muted={muted}
              volume={volume}
              loop={loop}
              videoVisible={videoVisible}
              currentTime={currentTime}
              duration={duration}
              mediaPath={item.mediaPath}
              onToggle={handleVideoToggle}
              onStop={handleStop}
              onMute={handleMuteToggle}
              onLoopToggle={handleLoopToggle}
              onToggleVisible={handleToggleVisible}
              onSeek={handleSeek}
              onVolume={handleVolume}
            />
          </>
        ) : (
          <MediaPlaceholder icon={<VideocamIcon sx={{ fontSize: 40 }} />} label={item.mediaPath || 'Video'} />
        );

      case 'image':
      default:
        return resolvedPath ? (
          <PreviewFrame>
            <CardMedia
              component="img"
              image={resolvedPath}
              alt={item.label || 'Media'}
              style={mediaStyle}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </PreviewFrame>
        ) : (
          <MediaPlaceholder icon={<ImageIcon sx={{ fontSize: 40 }} />} label={item.mediaPath || item.label || 'Image'} />
        );
    }
  };

  const isMedia = item.mediaSubType === 'image' || item.mediaSubType === 'video';

  return (
    <Stack sx={{ flexGrow: 1, padding: '0 25px 20px', overflowY: 'auto', userSelect: 'none' }}>
      <Card sx={{ border: '1px solid #f9a825', overflow: 'hidden' }}>
        {renderPreview()}
        {isMedia && <DisplayOptions item={item} patch={patch} />}
      </Card>
    </Stack>
  );
};

export default memo(ControlMedia);
