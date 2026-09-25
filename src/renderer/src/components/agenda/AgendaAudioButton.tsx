import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { Pause as PauseIcon, PlayArrow as PlayIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { mediaLabelOf } from '@/media/mediaFiles';
import { audioKeyOf, loadAudio, toggleAudio, useAudioTrack } from '@/media/audioPlayers';

/**
 * Play/pause on an audio entry of the agenda, with its progress as a ring: a pad can be started
 * without opening the entry, so the screens keep showing the song.
 */
export const AgendaAudioButton = ({ item, inverted }: { item: ShowItem; inverted?: boolean }) => {
  const { LL } = useI18nContext();
  const key = audioKeyOf(item);
  const track = useAudioTrack(key);
  const url = resolveMediaUrl(item.mediaPath);
  if (!url) return null;
  const playing = !!track?.playing && track.fade === undefined;
  const progress = track && track.duration > 0 ? (track.currentTime / track.duration) * 100 : 0;
  const color = inverted ? '#fff' : playing ? 'success.main' : 'text.secondary';

  return (
    <Tooltip title={`${playing ? LL.AUDIO.PAUSE() : LL.AUDIO.PLAY()} · ${LL.AUDIO.PLAY_IN_AGENDA()}`}>
      <IconButton
        size="small"
        onClick={(event) => {
          event.stopPropagation();
          loadAudio({
            key,
            url,
            label: item.label || mediaLabelOf(item.mediaPath ?? ''),
            volume: item.mediaVolume ?? 1,
            loop: item.mediaLoop === true,
          });
          toggleAudio(key);
        }}
        sx={{ p: 0.25, position: 'relative' }}
      >
        {(track?.playing || progress > 0) && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', color }}>
            <CircularProgress variant="determinate" value={progress} size="100%" thickness={3} color="inherit" />
          </Box>
        )}
        {playing ? <PauseIcon fontSize="small" sx={{ color }} /> : <PlayIcon fontSize="small" sx={{ color }} />}
      </IconButton>
    </Tooltip>
  );
};
