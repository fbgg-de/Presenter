/**
 * Playback speed controls: a video's own speed (SpeedControl) and the show-wide master speed that
 * videos follow by default (MasterSpeedControl). Both open the same compact popup — a vertical
 * slider beside the usual speeds.
 *
 * The slider is logarithmic (0.5× and 2× sit equally far from 1×) and snaps to 1×. While it is
 * dragged the speed is applied at most every 80 ms: each change re-times the clock and goes to
 * every window, and a drag would otherwise send dozens a second for nothing anyone could see.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, ButtonBase, FormControlLabel, Popover, Slider, Stack, Switch, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { MAX_RATE, MIN_RATE, PLAYBACK_RATES, rateOf } from '@/media/engine';
import { setMasterRate, useMasterRate, usePlaybacks } from '@/media/playback';
import { hasVideo } from '@/media/mediaItem';
import type { CueCommand, CueTransport } from '@/media/types';
import { TransportButton, TRANSPORT_ACTIVE } from './Transport';

/** "1×", "0.75×", "1.25×". */
export const rateLabel = (rate: number) => `${Number(rate.toFixed(2))}×`;

const APPLY_EVERY_MS = 80;
const toPosition = (rate: number) => Math.log2(rate);
const fromPosition = (position: number) => {
  // A small detent at normal speed, where a hand on a slider never lands exactly.
  if (Math.abs(position) < 0.02) return 1;
  return Math.round(2 ** position * 100) / 100;
};
const MARKS = [0.25, 0.5, 1, 2, 4].map((rate) => ({ value: toPosition(rate), label: rateLabel(rate) }));

/** The popup: title, optional extra (the follow-master switch), then slider and speeds side by side. */
const SpeedPopover = ({
  anchor,
  onClose,
  title,
  rate,
  onRate,
  disabled,
  extra,
  note,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  title: string;
  rate: number;
  onRate: (rate: number) => void;
  /** Following the master: the speed is not this control's to change. */
  disabled?: boolean;
  extra?: ReactNode;
  note?: ReactNode;
}) => {
  const { LL } = useI18nContext();
  // The thumb's raw position while dragging. Deriving the thumb from the rounded speed instead made
  // it move in notches: on a log scale 0.01× near 0.3× is ~5 % of the track.
  const [dragging, setDragging] = useState<number | null>(null);
  const lastApplied = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(pending.current ?? undefined), []);

  const applyThrottled = (next: number) => {
    clearTimeout(pending.current ?? undefined);
    const wait = APPLY_EVERY_MS - (Date.now() - lastApplied.current);
    if (wait <= 0) {
      lastApplied.current = Date.now();
      onRate(next);
    } else {
      pending.current = setTimeout(() => {
        lastApplied.current = Date.now();
        onRate(next);
      }, wait);
    }
  };
  const shown = dragging !== null ? fromPosition(dragging) : rate;

  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Stack sx={{ p: 1.25, gap: 1, width: 230 }}>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: 'text.secondary' }}>
            {title}
          </Typography>
          <Typography
            title={LL.TRANSPORT.SPEED_RESET_HINT()}
            onDoubleClick={() => !disabled && onRate(1)}
            sx={{
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: 700,
              color: shown !== 1 ? TRANSPORT_ACTIVE : 'text.primary',
              cursor: disabled ? 'default' : 'pointer',
              userSelect: 'none',
            }}
          >
            {rateLabel(shown)}
          </Typography>
        </Stack>
        {extra}
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'stretch', opacity: disabled ? 0.45 : 1 }}>
          <Box sx={{ height: 196, pt: 1.25, pb: 2, pl: 0.5, boxSizing: 'content-box' }}>
            <Slider
              orientation="vertical"
              size="small"
              min={toPosition(MIN_RATE)}
              max={toPosition(MAX_RATE)}
              step={0.01}
              marks={MARKS}
              disabled={disabled}
              value={dragging ?? toPosition(rate)}
              aria-label={title}
              // Double-click the slider for normal speed, as on a mixing desk's fader.
              onDoubleClick={() => {
                clearTimeout(pending.current ?? undefined);
                setDragging(null);
                onRate(1);
              }}
              onChange={(_e, v) => {
                setDragging(v as number);
                applyThrottled(fromPosition(v as number));
              }}
              onChangeCommitted={(_e, v) => {
                clearTimeout(pending.current ?? undefined);
                setDragging(null);
                lastApplied.current = Date.now();
                onRate(fromPosition(v as number));
              }}
              sx={{ '& .MuiSlider-markLabel': { fontFamily: 'monospace', fontSize: 10.5 } }}
            />
          </Box>
          <Stack sx={{ flex: 1, gap: 0.25 }}>
            {[...PLAYBACK_RATES].reverse().map((option) => {
              const on = option === rate;
              return (
                <ButtonBase
                  key={option}
                  disabled={disabled}
                  onClick={() => onRate(option)}
                  sx={{
                    justifyContent: 'space-between',
                    px: 1,
                    py: 0.35,
                    borderRadius: 0.75,
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    fontWeight: on ? 700 : 400,
                    color: on ? 'text.primary' : 'text.secondary',
                    bgcolor: on ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <span>{rateLabel(option)}</span>
                  {option === 1 && <span style={{ fontSize: 10.5, opacity: 0.7 }}>{LL.TRANSPORT.SPEED_NORMAL()}</span>}
                </ButtonBase>
              );
            })}
          </Stack>
        </Stack>
        {note}
      </Stack>
    </Popover>
  );
};

/** The label on a speed button: "1.25×", with a small M while it follows the master. */
const SpeedButtonLabel = ({ rate, master, size }: { rate: number; master?: boolean; size: 'small' | 'large' }) => (
  <Box component="span" sx={{ fontFamily: 'monospace', fontSize: size === 'large' ? 12.5 : 11, fontWeight: 700, lineHeight: 1, px: 0.25 }}>
    {master && (
      <Box component="span" sx={{ fontSize: '0.75em', opacity: 0.7, mr: 0.25 }}>
        M
      </Box>
    )}
    {rateLabel(rate)}
  </Box>
);

/** A running video's speed: its own, or the master's while it follows. */
export const SpeedControl = ({
  transport,
  onCommand,
  followsMaster,
  onFollowMaster,
  disabled,
  size = 'small',
}: {
  /** Undefined while the entry is not running — there is no clock to speed up yet. */
  transport?: CueTransport;
  onCommand: (command: CueCommand) => void;
  followsMaster?: boolean;
  onFollowMaster?: (follow: boolean) => void;
  disabled?: boolean;
  size?: 'small' | 'large';
}) => {
  const { LL } = useI18nContext();
  const T = LL.TRANSPORT;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const rate = transport ? rateOf(transport) : 1;

  return (
    <>
      <TransportButton
        label={followsMaster ? T.SPEED_FOLLOWS_MASTER({ rate: rateLabel(rate) }) : T.SPEED({ rate: rateLabel(rate) })}
        size={size}
        active={rate !== 1}
        disabled={disabled || !transport}
        onClick={(e) => setAnchor(e.currentTarget)}
        autoWidth
      >
        <SpeedButtonLabel rate={rate} master={followsMaster} size={size} />
      </TransportButton>
      <SpeedPopover
        anchor={anchor}
        onClose={() => setAnchor(null)}
        title={T.SPEED_TITLE()}
        rate={rate}
        disabled={followsMaster}
        onRate={(next) => onCommand({ type: 'rate', rate: next })}
        extra={
          onFollowMaster && (
            <FormControlLabel
              sx={{ m: 0 }}
              control={<Switch size="small" checked={!!followsMaster} onChange={(e) => onFollowMaster(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 12.5 }}>{T.FOLLOW_MASTER()}</Typography>}
            />
          )
        }
        note={followsMaster && <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{T.FOLLOW_MASTER_HINT()}</Typography>}
      />
    </>
  );
};

/** The show-wide master speed, for every video following it. */
export const MasterSpeedControl = ({ size = 'small' }: { size?: 'small' | 'large' }) => {
  const { LL } = useI18nContext();
  const T = LL.TRANSPORT;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const rate = useMasterRate();
  // Only re-counted while the popup is open.
  const playbacks = usePlaybacks();
  const followers = anchor ? playbacks.filter((p) => p.followsMaster && p.endsAt === undefined && hasVideo(p.cue)).length : 0;

  return (
    <>
      <TransportButton
        label={T.MASTER_SPEED({ rate: rateLabel(rate) })}
        size={size}
        active={rate !== 1}
        onClick={(e) => setAnchor(e.currentTarget)}
        autoWidth
      >
        <SpeedButtonLabel rate={rate} master size={size} />
      </TransportButton>
      <SpeedPopover
        anchor={anchor}
        onClose={() => setAnchor(null)}
        title={T.MASTER_SPEED_TITLE()}
        rate={rate}
        onRate={setMasterRate}
        note={<Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{T.MASTER_FOLLOWERS({ count: followers })}</Typography>}
      />
    </>
  );
};
