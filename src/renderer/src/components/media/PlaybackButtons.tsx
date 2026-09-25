/**
 * The buttons of a running video or slideshow — to the start, back, play/pause, ahead — the same
 * strip in the media card and in the layer bar. Back and ahead step by what the entry has: images,
 * sections, else ten seconds (`stepTarget`), and their tooltips say which.
 */
import type { ReactNode } from 'react';
import {
  FastForward as ForwardIcon,
  FastRewind as RewindIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  SkipNext as NextIcon,
  SkipPrevious as PrevIcon,
  FirstPage as ToStartIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { SEEK_STEP_SECONDS, stepTarget } from '@/media/mediaItem';
import type { CueCommand, CueTransport, MediaCue } from '@/media/types';
import { useShortcut } from '@/hooks/useShortcut';
import { TransportButton, TransportCluster } from './Transport';

export const PlaybackButtons = ({
  cue,
  transport,
  onCommand,
  disabled,
  size = 'small',
  toStart = true,
  playSlot,
  children,
}: {
  cue: MediaCue;
  /** Where the clock is; undefined while the entry is not running. */
  transport?: CueTransport;
  onCommand: (command: CueCommand) => void;
  disabled?: boolean;
  size?: 'small' | 'large';
  toStart?: boolean;
  /** Replaces play/pause — the card's "Show on screens" while the entry is not running. */
  playSlot?: ReactNode;
  /** More buttons at the end of the strip (loop, sound). */
  children?: ReactNode;
}) => {
  const { LL } = useI18nContext();
  const T = LL.TRANSPORT;
  const playKey = useShortcut('toggle_video_playback');
  const time = transport?.time ?? 0;
  const off = disabled || !transport;
  const back = stepTarget(cue, time, -1);
  const ahead = stepTarget(cue, time, 1);
  const seek = (target: number | undefined) => target !== undefined && onCommand({ type: 'seek', time: target });

  const backLabel =
    back.unit === 'slide' ? T.PREV_SLIDE() : back.unit === 'section' ? T.PREV_SECTION() : T.BACK_SECONDS({ seconds: SEEK_STEP_SECONDS });
  const aheadLabel =
    ahead.unit === 'slide'
      ? T.NEXT_SLIDE()
      : ahead.unit === 'section'
        ? T.NEXT_SECTION()
        : T.FORWARD_SECONDS({ seconds: SEEK_STEP_SECONDS });
  // Seconds are a jog (⏪ ⏩); images and sections are cuts (⏮ ⏭).
  const BackIcon = back.unit === 'seconds' ? RewindIcon : PrevIcon;
  const AheadIcon = ahead.unit === 'seconds' ? ForwardIcon : NextIcon;

  return (
    <TransportCluster>
      {toStart && (
        <TransportButton label={T.TO_START()} size={size} disabled={off || time < 0.05} onClick={() => seek(0)}>
          <ToStartIcon />
        </TransportButton>
      )}
      <TransportButton label={backLabel} size={size} disabled={off || back.time === undefined} onClick={() => seek(back.time)}>
        <BackIcon />
      </TransportButton>
      {playSlot ?? (
        <TransportButton
          primary
          size={size}
          label={transport?.playing ? T.PAUSE() : T.PLAY()}
          shortcut={playKey}
          disabled={off}
          onClick={() => onCommand({ type: 'toggle' })}
        >
          {transport?.playing ? <PauseIcon /> : <PlayIcon />}
        </TransportButton>
      )}
      <TransportButton label={aheadLabel} size={size} disabled={off || ahead.time === undefined} onClick={() => seek(ahead.time)}>
        <AheadIcon />
      </TransportButton>
      {children}
    </TransportCluster>
  );
};
