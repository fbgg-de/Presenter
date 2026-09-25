/**
 * The transport kit every player in the app is built from — the media card, the layer bar, audio —
 * after the viewer transport of an editing suite (DaVinci Resolve):
 *
 * - **Timecode** — a dark readout in fixed-width digits; a click switches between elapsed and
 *   remaining, which is what an operator waiting for a video to end wants to see.
 * - **TransportCluster / TransportButton** — flat square buttons joined in one strip, so a player
 *   reads as one control and not as a row of loose icons. The play button is the big one.
 * - **Scrubber** — the clip drawn as a strip: waveform, sections / loops / pauses in their timeline
 *   colours, ticks where slideshow images change, the played part tinted, a red playhead with a
 *   head. Hover shows where a click would jump; dragging only seeks on release, so the screens do
 *   not stutter through every position on the way.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Box, IconButton, Stack, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import { REGION_INK, type CueTransport, type MediaRegion } from '@/media/types';
import { advanceCue } from '@/media/engine';
import { usePlaybackClock, type Playback } from '@/media/playback';

/** Re-render every `ms` while `active`, so a clock read at render time moves smoothly. */
export const useTick = (active: boolean, ms = 100): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
  return now;
};

/**
 * A playing entry's transport as of now, for the readouts that move with time (timecode, scrubber,
 * slide counter). It re-renders on its own — `fast` ten times a second for a big viewer, else with
 * the four-a-second playback clock — so the card or line around it does not: ticking a whole media
 * card or layer-bar line for them re-rendered every button and tooltip in it.
 */
export const LiveTime = ({
  playback,
  fast = false,
  children,
}: {
  playback?: Playback;
  fast?: boolean;
  children: (transport?: CueTransport) => ReactNode;
}) => {
  useTick(fast && !!playback?.transport.playing, 100);
  usePlaybackClock(!fast);
  return (
    <>{children(playback ? advanceCue(playback.cue, playback.transport, Math.max(0, (Date.now() - playback.at) / 1000)) : undefined)}</>
  );
};

/** The playhead's red — the one colour that means "the clock is here". */
export const PLAYHEAD = '#e5484d';
/** A toggle that is on (loop, sound): amber, apart from the live red and the selection colour. */
export const TRANSPORT_ACTIVE = '#e8a33d';

/** `1:23.4`, `12:03.0`, `1:02:03.0` — tenths, because frames mean nothing for a pad or a slideshow. */
export const formatTimecode = (seconds: number): string => {
  const tenths = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor(tenths / 600) % 60;
  const s = Math.floor(tenths / 10) % 60;
  const t = tenths % 10;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}.${t}`;
};

/** Elapsed, or remaining with a minus: a click switches. Without a duration it only counts up. */
export const Timecode = ({
  time,
  duration,
  size = 'small',
  tone,
}: {
  time: number;
  duration?: number;
  size?: 'small' | 'large';
  /** Colour of the digits: warning while fading, for instance. */
  tone?: string;
}) => {
  const { LL } = useI18nContext();
  const T = LL.TRANSPORT;
  const [remaining, setRemaining] = useState(false);
  const canSwitch = !!duration && duration > 0;
  const shown = remaining && canSwitch ? `−${formatTimecode(duration - time)}` : formatTimecode(time);
  return (
    <Tooltip title={canSwitch ? (remaining ? T.SHOW_ELAPSED() : T.SHOW_REMAINING()) : ''}>
      <Box
        component={canSwitch ? 'button' : 'span'}
        type={canSwitch ? 'button' : undefined}
        onClick={canSwitch ? () => setRemaining((v) => !v) : undefined}
        sx={{
          font: 'inherit',
          fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
          fontVariantNumeric: 'tabular-nums',
          fontSize: size === 'large' ? 15 : 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          lineHeight: 1,
          color: tone ?? (remaining ? TRANSPORT_ACTIVE : 'text.primary'),
          bgcolor: 'rgba(0,0,0,0.38)',
          border: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 0.75,
          px: size === 'large' ? 1 : 0.75,
          py: size === 'large' ? 0.75 : 0.5,
          // Fits "−1:02:03.4" without the box changing width as the digits run.
          minWidth: size === 'large' ? 92 : 70,
          textAlign: 'center',
          flexShrink: 0,
          cursor: canSwitch ? 'pointer' : 'default',
          '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
        }}
      >
        {shown}
      </Box>
    </Tooltip>
  );
};

/** One strip holding a player's buttons, like an editing suite's viewer transport. */
export const TransportCluster = ({ children }: { children: ReactNode }) => (
  <Stack
    direction="row"
    sx={{
      alignItems: 'center',
      gap: 0.25,
      p: 0.25,
      flexShrink: 0,
      borderRadius: 1,
      border: 1,
      borderColor: 'divider',
      bgcolor: 'rgba(255,255,255,0.035)',
    }}
  >
    {children}
  </Stack>
);

/** A flat square transport button. `primary` is the play button: bigger and filled. */
export const TransportButton = ({
  label,
  shortcut,
  onClick,
  disabled,
  active,
  primary,
  danger,
  size = 'small',
  autoWidth = false,
  children,
}: {
  /** Text rather than an icon ("M 1.25×"): as wide as it needs, at least square. */
  autoWidth?: boolean;
  label: ReactNode;
  shortcut?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** A toggle that is on: amber. */
  active?: boolean;
  primary?: boolean;
  /** Takes something off the screens. */
  danger?: boolean;
  size?: 'small' | 'large';
  children: ReactNode;
}) => {
  const box = size === 'large' ? (primary ? 40 : 34) : primary ? 32 : 28;
  return (
    <Tooltip
      title={
        shortcut ? (
          <>
            {label}{' '}
            <Box component="kbd" sx={{ fontFamily: 'monospace', opacity: 0.75 }}>
              {shortcut}
            </Box>
          </>
        ) : (
          label
        )
      }
    >
      <span>
        <IconButton
          className="transport-button"
          aria-label={typeof label === 'string' ? label : undefined}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          sx={(theme) => ({
            width: autoWidth ? 'auto' : primary ? box + 8 : box,
            minWidth: box,
            height: box,
            p: 0,
            px: autoWidth ? 0.75 : 0,
            borderRadius: 0.75,
            color: active ? TRANSPORT_ACTIVE : primary ? 'text.primary' : 'text.secondary',
            bgcolor: primary ? alpha(theme.palette.text.primary, 0.1) : active ? alpha(TRANSPORT_ACTIVE, 0.14) : 'transparent',
            '& .MuiSvgIcon-root': { fontSize: size === 'large' ? (primary ? 26 : 20) : primary ? 22 : 18 },
            '&:hover': {
              color: danger ? PLAYHEAD : 'text.primary',
              bgcolor: primary ? alpha(theme.palette.text.primary, 0.18) : alpha(theme.palette.text.primary, 0.08),
            },
          })}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
};

/** A thin separator between groups of buttons inside a cluster. */
export const TransportDivider = () => <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.5, mx: 0.25, bgcolor: 'divider' }} />;

/** Up to `bars` peak values, the loudest of each bucket, so the strip draws the same shape at any width. */
const bucketPeaks = (peaks: number[], bars: number): number[] => {
  if (peaks.length <= bars) return peaks;
  const size = peaks.length / bars;
  return Array.from({ length: bars }, (_, i) => {
    let max = 0;
    for (let j = Math.floor(i * size); j < Math.floor((i + 1) * size); j++) max = Math.max(max, peaks[j] ?? 0);
    return max;
  });
};

/**
 * The clip as a strip you can click into. `full` is the viewer's (tall, with regions labelled
 * and the waveform); `compact` is the layer bar's (a slim track that grows on hover).
 */
export const Scrubber = ({
  time,
  duration,
  onSeek,
  disabled,
  regions,
  ticks,
  peaks,
  variant = 'compact',
  height: heightProp,
}: {
  /** Overrides the variant's height — the audio card draws its waveform big. */
  height?: number;
  time: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
  regions?: MediaRegion[];
  /** Positions (seconds) to mark, e.g. where slideshow images change. */
  ticks?: number[];
  /** Waveform peaks (0–1), drawn behind everything. */
  peaks?: number[];
  variant?: 'compact' | 'full';
}) => {
  const { LL } = useI18nContext();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const full = variant === 'full';
  const length = duration > 0 ? duration : 0;
  const usable = length > 0 && !disabled;
  const shownTime = drag ?? time;
  const pct = (t: number) => `${length > 0 ? Math.min(100, Math.max(0, (t / length) * 100)) : 0}%`;
  const bars = useMemo(() => (peaks?.length ? bucketPeaks(peaks, full ? 240 : 120) : []), [peaks, full]);

  const timeAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(length, Math.max(0, ((clientX - rect.left) / rect.width) * length));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!usable || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(timeAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!usable) return;
    const at = timeAt(e.clientX);
    setHover(at);
    if (drag !== null) setDrag(at);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const at = timeAt(e.clientX);
    setDrag(null);
    onSeek(at);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!usable) return;
    const step = e.shiftKey ? 1 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      onSeek(Math.min(length, Math.max(0, time + (e.key === 'ArrowLeft' ? -step : step))));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      onSeek(e.key === 'Home' ? 0 : length);
    }
  };

  const height = heightProp ?? (full ? 44 : 20);
  const regionBand = full ? 12 : 0;

  return (
    <Box
      ref={ref}
      role="slider"
      tabIndex={usable ? 0 : -1}
      aria-label={LL.TRANSPORT.POSITION()}
      aria-valuemin={0}
      aria-valuemax={Math.round(length)}
      aria-valuenow={Math.round(shownTime)}
      aria-valuetext={formatTimecode(shownTime)}
      aria-disabled={!usable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 80,
        height,
        cursor: usable ? 'pointer' : 'default',
        touchAction: 'none',
        userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
        borderRadius: 0.75,
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
        // The slim track of the compact variant thickens under the pointer, as a hint it is grabbable.
        '&:hover .scrub-track': !full && usable ? { top: 5, bottom: 5 } : undefined,
      }}
    >
      {/* Track */}
      <Box
        className="scrub-track"
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: full ? regionBand : 7,
          bottom: full ? 0 : 7,
          borderRadius: 0.5,
          overflow: 'hidden',
          bgcolor: 'rgba(255,255,255,0.07)',
          transition: 'top 120ms, bottom 120ms',
        }}
      >
        {/* Played part */}
        <Box
          sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(shownTime), bgcolor: alpha(PLAYHEAD, full ? 0.14 : 0.55) }}
        />
        {/* Waveform, brighter where it has played */}
        {bars.length > 0 && (
          <Box
            component="svg"
            viewBox={`0 0 ${bars.length} 100`}
            preserveAspectRatio="none"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {bars.map((peak, i) => {
              const h = Math.max(2, peak * 92);
              const played = length > 0 && (i + 0.5) / bars.length <= shownTime / length;
              return (
                <rect
                  key={i}
                  x={i + 0.15}
                  y={50 - h / 2}
                  width={0.7}
                  height={h}
                  fill={played ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.3)'}
                />
              );
            })}
          </Box>
        )}
        {/* Sections and loops tint the stretch they cover */}
        {regions
          ?.filter((r) => r.kind === 'section' && r.end > r.start)
          .map((r) => (
            <Box
              key={r.id}
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: pct(r.start),
                width: `calc(${pct(r.end)} - ${pct(r.start)})`,
                bgcolor: alpha(REGION_INK[r.loop ? 'loop' : 'section'], r.enabled === false ? 0.05 : 0.12),
                borderLeft: `1px solid ${alpha(REGION_INK[r.loop ? 'loop' : 'section'], 0.6)}`,
              }}
            />
          ))}
        {/* Slide changes */}
        {ticks
          ?.filter((t) => t > 0 && t < length)
          .map((t) => (
            <Box key={t} sx={{ position: 'absolute', top: 0, bottom: 0, left: pct(t), width: '1px', bgcolor: 'rgba(255,255,255,0.35)' }} />
          ))}
      </Box>

      {/* The region band above the track: a coloured bar per section, a notch per pause */}
      {full &&
        regions?.map((r) =>
          r.kind === 'pause' ? (
            <Box
              key={r.id}
              title={r.name}
              sx={{
                position: 'absolute',
                top: 0,
                left: pct(r.start),
                transform: 'translateX(-4px)',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: `8px solid ${REGION_INK.pause}`,
                opacity: r.enabled === false ? 0.4 : 1,
              }}
            />
          ) : (
            <Box
              key={r.id}
              title={r.name}
              sx={{
                position: 'absolute',
                top: 2,
                height: 6,
                left: pct(r.start),
                width: `calc(${pct(r.end)} - ${pct(r.start)} - 2px)`,
                borderRadius: 0.5,
                bgcolor: REGION_INK[r.loop ? 'loop' : 'section'],
                opacity: r.enabled === false ? 0.3 : 0.9,
              }}
            />
          ),
        )}

      {/* Where a click would land */}
      {hover !== null && drag === null && usable && (
        <Box
          sx={{
            position: 'absolute',
            top: full ? regionBand : 3,
            bottom: full ? 0 : 3,
            left: pct(hover),
            width: '1px',
            bgcolor: 'rgba(255,255,255,0.5)',
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translate(-50%, -4px)',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: 'rgba(0,0,0,0.85)',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: 10,
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            {formatTimecode(hover)}
          </Box>
        </Box>
      )}

      {/* Playhead: a red line with a head, as in an editing suite */}
      {length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: full ? regionBand - 2 : 1,
            bottom: full ? 0 : 1,
            left: pct(shownTime),
            width: 2,
            ml: '-1px',
            bgcolor: PLAYHEAD,
            pointerEvents: 'none',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: -1,
              left: '50%',
              transform: 'translateX(-50%)',
              width: full ? 10 : 8,
              height: full ? 7 : 5,
              bgcolor: PLAYHEAD,
              clipPath: 'polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)',
            },
          }}
        />
      )}
    </Box>
  );
};
