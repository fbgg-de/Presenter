import { useState } from 'react';
import { IconButton, Slider, Stack, Typography, Tooltip } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';

interface VideoControlBarProps {
  /** Label for this video source (e.g., window name or "Background Video") */
  label?: string;
}

/**
 * Video control bar for controlling video playback in presentation windows.
 * Currently provides local UI state — transport commands will be sent via
 * presentationBridge when wired to actual presentation windows (Phase 6+).
 */
const VideoControlBar = ({ label }: VideoControlBarProps) => {
  const { LL } = useI18nContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [position, setPosition] = useState(0);
  const [duration] = useState(0);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    // TODO: Send play/pause command via presentationBridge
  };

  const handleStop = () => {
    setIsPlaying(false);
    setPosition(0);
    // TODO: Send stop command via presentationBridge
  };

  const handleSeek = (_: Event, newValue: number | number[]) => {
    setPosition(newValue as number);
    // TODO: Send seek command via presentationBridge
  };

  const handleVolumeChange = (_: Event, newValue: number | number[]) => {
    const vol = newValue as number;
    setVolume(vol);
    setIsMuted(vol === 0);
    // TODO: Send volume command via presentationBridge
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    // TODO: Send mute command via presentationBridge
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        px: 2,
        py: 0.5,
        borderTop: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, fontSize: '0.7rem' }} noWrap>
          {label}
        </Typography>
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

      <Typography variant="caption" sx={{ minWidth: 40, fontFamily: 'monospace', fontSize: '0.7rem' }}>
        {formatTime(position)}
      </Typography>

      <Slider value={position} min={0} max={duration || 100} onChange={handleSeek} size="small" sx={{ flex: 1, mx: 1 }} />

      <Typography variant="caption" sx={{ minWidth: 40, fontFamily: 'monospace', fontSize: '0.7rem' }}>
        {formatTime(duration)}
      </Typography>

      <Tooltip title={isMuted ? LL.VIDEO.UNMUTE() : LL.VIDEO.MUTE()}>
        <IconButton size="small" onClick={handleMuteToggle}>
          {isMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Slider value={isMuted ? 0 : volume} min={0} max={100} onChange={handleVolumeChange} size="small" sx={{ width: 80 }} />
    </Stack>
  );
};

export default VideoControlBar;
