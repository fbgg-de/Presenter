/**
 * An audio item in the operator view. The sound comes out of this computer only; nothing is sent
 * to the screens. The player outlives this card (see `media/audioPlayers`), so a pad started here
 * keeps playing while the operator moves on, and is stopped from the layer bar or the agenda.
 *
 * Laid out like the media card: a viewer whose picture is the waveform (click into it to jump),
 * the transport under it, and the settings as inspector rows.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Slider, Switch, Typography } from '@mui/material';
import {
  FirstPage as ToStartIcon,
  FastForward as ForwardIcon,
  FastRewind as RewindIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Repeat as LoopIcon,
  Stop as StopIcon,
  TrendingDown as FadeIcon,
  VolumeUp as VolumeIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { useAppDispatch } from '@/store';
import { updateShowItem } from '@/store/showSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { mediaLabelOf } from '@/media/mediaFiles';
import { SEEK_STEP_SECONDS } from '@/media/mediaItem';
import { useWaveform } from '@/media/useWaveform';
import {
  audioKeyOf,
  fadeOutAudio,
  holdAudio,
  reloadAudio,
  seekAudio,
  setAudioLoop,
  setAudioVolume,
  stopAudio,
  toggleAudio,
  useAudioTrack,
  type AudioTrackState,
} from '@/media/audioPlayers';
import { SlideGrid } from '@/components/show/SlideCard';
import { useShortcut } from '@/hooks/useShortcut';
import {
  Scrubber,
  Timecode,
  TransportButton,
  TransportCluster,
  TransportDivider,
  formatTimecode,
  TRANSPORT_ACTIVE,
} from '@/components/media/Transport';
import { InspectorRow, InspectorSection, ViewerFrame, type LampState } from '@/components/media/Viewer';

/** Loop is off unless the item turns it on: walk-in music ends, a pad is looped on purpose. */
const audioLoopOf = (item: ShowItem) => item.mediaLoop === true;
const audioVolumeOf = (item: ShowItem) => item.mediaVolume ?? 1;

/** Audio is never on a screen: "live" here means it is sounding. */
const lampOf = (track: AudioTrackState | undefined): LampState => {
  if (!track || track.status === 'loading' || track.status === 'error') return 'stopped';
  if (track.fade !== undefined) return 'fading';
  if (track.playing) return 'live';
  return track.currentTime > 0 ? 'paused' : 'stopped';
};

const ControlAudio = ({ item, index }: { item: ShowItem; index: number }) => {
  const { LL } = useI18nContext();
  const A = LL.AUDIO;
  const T = LL.TRANSPORT;
  const dispatch = useAppDispatch();
  const { audioFadeOutSeconds } = useGetSettings('audioFadeOutSeconds');
  const playKey = useShortcut('toggle_video_playback');

  const key = audioKeyOf(item);
  const url = resolveMediaUrl(item.mediaPath);
  const label = item.label || mediaLabelOf(item.mediaPath ?? '');
  const loop = audioLoopOf(item);
  const volume = audioVolumeOf(item);
  const track = useAudioTrack(key);
  const loaded = track !== undefined;
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const waveform = useWaveform(url);

  // Load the player while the card is open; it keeps playing after the card closes.
  useEffect(() => {
    if (!url) return;
    return holdAudio({ key, label, url, volume, loop });
    // Volume and loop are applied below without reloading the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url, label]);
  useEffect(() => setAudioLoop(key, loop), [key, loop, loaded]);
  useEffect(() => setAudioVolume(key, volume), [key, volume, loaded]);

  const patch = useCallback((fields: Partial<ShowItem>) => dispatch(updateShowItem({ index, item: fields })), [dispatch, index]);

  const fading = track?.fade !== undefined;
  const playing = !!track?.playing && !fading;
  const time = track?.currentTime ?? 0;
  const duration = track?.duration ?? 0;
  const ready = !!track && track.status !== 'error';

  return (
    <SlideGrid
      single
      title={label}
      footer={
        url ? (
          <Box sx={{ maxWidth: 1040 }}>
            <InspectorSection id="audio" title={T.AUDIO()} summary={`${Math.round(volume * 100)}%${loop ? ` · ${T.LOOP()}` : ''}`}>
              <InspectorRow label={A.VOLUME()}>
                <VolumeIcon fontSize="small" color="action" />
                <Slider
                  size="small"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volumeDraft ?? volume}
                  aria-label={A.VOLUME()}
                  onChange={(_, v) => {
                    setVolumeDraft(v as number);
                    setAudioVolume(key, v as number);
                  }}
                  onChangeCommitted={(_, v) => {
                    setVolumeDraft(null);
                    patch({ mediaVolume: v as number });
                  }}
                  sx={{ flex: '1 1 160px', maxWidth: 280, mx: 1 }}
                />
                <Typography sx={{ fontSize: 12.5, fontFamily: 'monospace', minWidth: 40 }}>
                  {Math.round((volumeDraft ?? volume) * 100)}%
                </Typography>
              </InspectorRow>
              <InspectorRow label={T.LOOP()}>
                <Switch size="small" checked={loop} onChange={(e) => patch({ mediaLoop: e.target.checked })} />
              </InspectorRow>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {A.KEEPS_PLAYING()}
              </Typography>
            </InspectorSection>
          </Box>
        ) : undefined
      }
    >
      {!url ? (
        <Alert severity="warning">{A.NO_FILE()}</Alert>
      ) : (
        <ViewerFrame
          lamp={lampOf(track)}
          title={A.OPERATOR_ONLY()}
          headerRight={
            <Typography sx={{ fontFamily: 'monospace', fontSize: 11.5, color: 'rgba(233,236,239,0.6)' }}>
              {item.mediaPath?.replace(/.*[/\\]/, '')}
            </Typography>
          }
          transport={
            <>
              <Timecode size="large" time={time} duration={duration} tone={fading ? TRANSPORT_ACTIVE : undefined} />
              <Box sx={{ flex: 1 }} />
              <TransportCluster>
                <TransportButton label={T.TO_START()} size="large" disabled={!ready || time < 0.05} onClick={() => seekAudio(key, 0)}>
                  <ToStartIcon />
                </TransportButton>
                <TransportButton
                  label={T.BACK_SECONDS({ seconds: SEEK_STEP_SECONDS })}
                  size="large"
                  disabled={!ready || time < 0.05}
                  onClick={() => seekAudio(key, Math.max(0, time - SEEK_STEP_SECONDS))}
                >
                  <RewindIcon />
                </TransportButton>
                <TransportButton
                  primary
                  size="large"
                  label={playing ? T.PAUSE() : T.PLAY()}
                  shortcut={playKey}
                  disabled={!ready}
                  onClick={() => toggleAudio(key)}
                >
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </TransportButton>
                <TransportButton
                  label={T.FORWARD_SECONDS({ seconds: SEEK_STEP_SECONDS })}
                  size="large"
                  disabled={!ready || duration <= 0}
                  onClick={() => seekAudio(key, Math.min(duration, time + SEEK_STEP_SECONDS))}
                >
                  <ForwardIcon />
                </TransportButton>
                <TransportDivider />
                <TransportButton label={T.LOOP()} size="large" active={loop} onClick={() => patch({ mediaLoop: !loop })}>
                  <LoopIcon />
                </TransportButton>
              </TransportCluster>
              <Box sx={{ flex: 1 }} />
              <TransportCluster>
                <TransportButton
                  label={A.FADE_OUT_HINT({ seconds: audioFadeOutSeconds })}
                  size="large"
                  disabled={!track?.playing || fading}
                  onClick={() => fadeOutAudio(key, audioFadeOutSeconds)}
                >
                  <FadeIcon />
                </TransportButton>
                <TransportButton
                  label={A.STOP()}
                  size="large"
                  danger
                  disabled={!track?.playing && !track?.currentTime}
                  onClick={() => stopAudio(key)}
                >
                  <StopIcon />
                </TransportButton>
              </TransportCluster>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(233,236,239,0.5)', minWidth: 64, textAlign: 'right' }}>
                {formatTimecode(duration)}
              </Typography>
            </>
          }
          below={
            track?.status === 'error' ? (
              <Alert severity="warning" action={<Button onClick={() => reloadAudio(key)}>{A.RETRY()}</Button>}>
                {A.ERROR()}
              </Alert>
            ) : track?.status === 'blocked' ? (
              <Alert severity="info">{A.BLOCKED()}</Alert>
            ) : undefined
          }
        >
          {/* The picture of a sound: its waveform, big enough to aim a click at a phrase. */}
          <Box sx={{ px: 1.25, py: 1.5, display: 'flex', position: 'relative', bgcolor: '#0b0c0e' }}>
            <Scrubber
              variant="full"
              height={112}
              time={time}
              duration={duration}
              disabled={!ready}
              peaks={waveform.state === 'ready' ? waveform.peaks : undefined}
              onSeek={(t) => seekAudio(key, t)}
            />
            {fading && (
              <Box sx={{ position: 'absolute', left: 10, right: 10, bottom: 4 }}>
                <LinearProgress variant="determinate" value={(1 - (track?.fade ?? 0)) * 100} color="warning" />
              </Box>
            )}
          </Box>
        </ViewerFrame>
      )}
    </SlideGrid>
  );
};

export default ControlAudio;
