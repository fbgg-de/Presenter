import { SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Slider, Stack, Typography } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  Fullscreen as FullscreenIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { formatTime } from '@/utils';

interface VideoPlayerProps {
  src: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
}

export const VideoPlayer = ({
  src,
  autoPlay = false,
  loop = false,
  muted: initialMuted = false,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
}: VideoPlayerProps) => {
  const { LL } = useI18nContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime, video.duration);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onPlay, onPause, onEnded]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const handleStop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }, []);

  const handleSeek = useCallback((_: Event | SyntheticEvent, value: number | number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const time = typeof value === 'number' ? value : value[0];
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback(
    (_: Event | SyntheticEvent, value: number | number[]) => {
      const video = videoRef.current;
      if (!video) return;
      const vol = typeof value === 'number' ? value : value[0];
      video.volume = vol;
      setVolume(vol);
      if (vol > 0 && isMuted) {
        video.muted = false;
        setIsMuted(false);
      }
    },
    [isMuted],
  );

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  }, []);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Video element */}
      <Box sx={{ position: 'relative', bgcolor: 'black', borderRadius: 1, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          src={src}
          autoPlay={autoPlay}
          loop={loop}
          muted={initialMuted}
          playsInline
          style={{
            width: '100%',
            maxHeight: 400,
            display: 'block',
          }}
        />
      </Box>

      {/* Controls */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1, py: 0.5, bgcolor: 'background.paper', borderRadius: '0 0 4px 4px' }}
      >
        <IconButton size="small" onClick={handlePlayPause} title={isPlaying ? LL.VIDEO.PAUSE() : LL.VIDEO.PLAY()}>
          {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
        </IconButton>
        <IconButton size="small" onClick={handleStop} title={LL.VIDEO.STOP()}>
          <StopIcon fontSize="small" />
        </IconButton>

        <Typography variant="caption" sx={{ minWidth: 40, fontFamily: 'monospace' }}>
          {formatTime(currentTime)}
        </Typography>

        <Slider size="small" min={0} max={duration || 100} value={currentTime} onChange={handleSeek} sx={{ flex: 1, mx: 1 }} />

        <Typography variant="caption" sx={{ minWidth: 40, fontFamily: 'monospace' }}>
          {formatTime(duration)}
        </Typography>

        <IconButton size="small" onClick={handleToggleMute} title={isMuted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
          {isMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
        </IconButton>

        <Slider size="small" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={handleVolumeChange} sx={{ width: 80 }} />

        <IconButton size="small" onClick={handleFullscreen}>
          <FullscreenIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
};
