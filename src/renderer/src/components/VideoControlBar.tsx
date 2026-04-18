import { useEffect, useState } from 'react';
import { IconButton, Slider, Stack, Typography, Tooltip } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Loop as LoopIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';

interface VideoControlBarProps {
  label?: string;
  /** Pass the actual HTMLVideoElement (from a callback ref) so the bar stays in sync. */
  video: HTMLVideoElement | null;
}

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const VideoControlBar = ({ label, video }: VideoControlBarProps) => {
  const { LL } = useI18nContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(100);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  // Re-sync whenever the video element changes (callback ref ensures this)
  useEffect(() => {
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => { if (!seeking) setPosition(video.currentTime); };
    const onMeta = () => { setDuration(video.duration || 0); setPosition(video.currentTime); };
    const onVolume = () => { setIsMuted(video.muted); setVolume(Math.round(video.volume * 100)); };

    // Sync initial state
    setIsPlaying(!video.paused);
    setIsLooping(video.loop);
    setIsMuted(video.muted);
    setVolume(Math.round(video.volume * 100));
    setDuration(video.duration || 0);
    setPosition(video.currentTime);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('volumechange', onVolume);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onMeta);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('volumechange', onVolume);
    };
  }, [video, seeking]);

  const handlePlayPause = () => {
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const handleStop = () => {
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setPosition(0);
  };

  const handleToggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    if (video) video.loop = next;
  };

  const handleSeekChange = (_: Event, val: number | number[]) => {
    setPosition(val as number);
    setSeeking(true);
  };

  const handleSeekCommit = (_: Event | React.SyntheticEvent, val: number | number[]) => {
    if (video) video.currentTime = val as number;
    setSeeking(false);
  };

  const handleVolumeChange = (_: Event, val: number | number[]) => {
    const v = val as number;
    setVolume(v);
    setIsMuted(v === 0);
    if (video) { video.volume = v / 100; video.muted = v === 0; }
  };

  return (
    <Stack direction="row" alignItems="center" spacing={1}
      sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}>
      <Tooltip title={isPlaying ? LL.VIDEO.PAUSE() : LL.VIDEO.PLAY()}>
        <IconButton size="small" onClick={handlePlayPause} disabled={!video}>
          {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title={LL.VIDEO.STOP()}>
        <IconButton size="small" onClick={handleStop} disabled={!video}><StopIcon fontSize="small" /></IconButton>
      </Tooltip>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, fontSize: '0.7rem' }} noWrap>{label}</Typography>
      )}
      <Tooltip title={isLooping ? LL.VIDEO.LOOP_ON() : LL.VIDEO.LOOP_OFF()}>
        <IconButton size="small" onClick={handleToggleLoop} color={isLooping ? 'primary' : 'default'} disabled={!video}>
          <LoopIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Typography variant="caption" sx={{ minWidth: 40, fontFamily: 'monospace', fontSize: '0.7rem' }}>{formatTime(position)}</Typography>
      <Slider value={position} min={0} max={duration || 100} onChange={handleSeekChange} onChangeCommitted={handleSeekCommit} size="small" sx={{ flex: 1, mx: 1 }} disabled={!video} />
      <Typography variant="caption" sx={{ minWidth: 40, fontFamily: 'monospace', fontSize: '0.7rem' }}>{formatTime(duration)}</Typography>
      <Tooltip title={isMuted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
        <IconButton size="small" onClick={() => { const next = !isMuted; setIsMuted(next); if (video) video.muted = next; }} disabled={!video}>
          {isMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Slider value={isMuted ? 0 : volume} min={0} max={100} onChange={handleVolumeChange} size="small" sx={{ width: 80 }} disabled={!video} />
    </Stack>
  );
};

export default VideoControlBar;
