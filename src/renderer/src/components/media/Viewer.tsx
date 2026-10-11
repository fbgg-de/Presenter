/**
 * The frame of a media entry's card, after an editing suite's viewer and inspector:
 *
 * - **ViewerFrame** — a dark panel: a status lamp and the name on top, the picture (or waveform),
 *   then the scrubber and the transport. Everything that *plays* lives in this one box.
 * - **InspectorSection / InspectorRow** — everything that is *set up* sits below, in named
 *   sections that fold (remembered per section), each row a label on the left and its control on
 *   the right, so a long list of settings scans as a column instead of a wall of switches.
 */
import { useState, type ReactNode } from 'react';
import { Box, ButtonBase, Collapse, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { alpha, ThemeProvider } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import { getTheme } from '@/theme';
import { PLAYHEAD, TRANSPORT_ACTIVE } from './Transport';

export type LampState = 'live' | 'ready' | 'paused' | 'cleared' | 'fading' | 'off' | 'stopped';

/** A dot and a word for where the entry is: red and lit while on screen, as a tally light. */
export const StatusLamp = ({ state }: { state: LampState }) => {
  const { LL } = useI18nContext();
  const T = LL.TRANSPORT;
  const label = {
    live: T.LIVE(),
    ready: T.READY(),
    paused: T.PAUSED(),
    cleared: T.CLEARED(),
    fading: T.FADING(),
    off: T.OFF_SCREEN(),
    stopped: T.STOPPED(),
  }[state];
  const color =
    state === 'live' ? PLAYHEAD : state === 'paused' || state === 'fading' || state === 'cleared' ? TRANSPORT_ACTIVE : '#8a929a';
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: 'center',
        flexShrink: 0,
        px: 0.75,
        py: 0.35,
        borderRadius: 0.75,
        bgcolor: state === 'live' ? alpha(PLAYHEAD, 0.16) : 'rgba(255,255,255,0.05)',
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          boxShadow: state === 'live' ? `0 0 6px ${PLAYHEAD}` : 'none',
        }}
      />
      <Typography
        component="span"
        sx={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: state === 'live' ? '#ffb3b5' : 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
};

/**
 * The panel is dark in both modes, like the program monitors — so everything in it takes the dark
 * theme. In light mode its buttons and timecode used the light theme's dark ink and vanished.
 */
const VIEWER_THEME = getTheme('dark');

/** The dark viewer panel: header (lamp, title, right slot), body, then scrubber and transport rows. */
export const ViewerFrame = ({
  lamp,
  title,
  subtitle,
  headerRight,
  children,
  scrubber,
  transport,
  below,
}: {
  lamp: LampState;
  title: ReactNode;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  scrubber?: ReactNode;
  transport?: ReactNode;
  /** Under the transport, still inside the frame — a slideshow's filmstrip. */
  below?: ReactNode;
}) => (
  <ThemeProvider theme={VIEWER_THEME}>
    <Box
      sx={{
        bgcolor: '#101114',
        border: 1,
        borderColor: lamp === 'live' ? alpha(PLAYHEAD, 0.55) : 'rgba(255,255,255,0.08)',
        borderRadius: 1.5,
        overflow: 'hidden',
        color: '#e9ecef',
        boxShadow: lamp === 'live' ? `0 0 0 1px ${alpha(PLAYHEAD, 0.25)}` : 'none',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', px: 1, py: 0.75, borderBottom: 1, borderColor: 'rgba(255,255,255,0.06)', minWidth: 0 }}
      >
        <StatusLamp state={lamp} />
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography noWrap sx={{ fontSize: 11, color: 'rgba(233,236,239,0.55)', fontFamily: 'monospace', flexShrink: 0 }}>
            {subtitle}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {headerRight}
      </Stack>
      <Box sx={{ bgcolor: '#000' }}>{children}</Box>
      {scrubber && <Box sx={{ px: 1.25, pt: 1.25, pb: 0.5, display: 'flex' }}>{scrubber}</Box>}
      {transport && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', px: 1.25, pb: 1.25, pt: 0.75 }}>
          {transport}
        </Stack>
      )}
      {below && <Box sx={{ borderTop: 1, borderColor: 'rgba(255,255,255,0.06)', px: 1.25, py: 1 }}>{below}</Box>}
    </Box>
  </ThemeProvider>
);

const OPEN_KEY = (id: string) => `presenter_media_inspector_${id}`;

/** A named, folding group of settings. Its open state is remembered on this device. */
export const InspectorSection = ({
  id,
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  /** What the section is set to, shown on its bar while it is folded. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(OPEN_KEY(id));
      return stored === null ? defaultOpen : stored === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () =>
    setOpen((value) => {
      try {
        localStorage.setItem(OPEN_KEY(id), value ? '0' : '1');
      } catch {
        /* not remembered */
      }
      return !value;
    });
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
      <ButtonBase
        onClick={toggle}
        aria-expanded={open}
        sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 1.5, py: 0.85, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <ExpandIcon
          sx={{ fontSize: 18, color: 'text.secondary', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 120ms' }}
        />
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: 'text.secondary' }}>
          {title}
        </Typography>
        {!open && summary && (
          <Typography noWrap sx={{ fontSize: 12, color: 'text.disabled', minWidth: 0, ml: 'auto', pr: 0.5 }}>
            {summary}
          </Typography>
        )}
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={1} sx={{ px: 1.5, pb: 1.5, pt: 0.25 }}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
};

/** A setting: its name in a fixed left column, the control on the right. Wraps under on narrow panes. */
export const InspectorRow = ({
  label,
  children,
  align = 'center',
  labelWidth = 120,
}: {
  /** The label column; narrow panels (the operator's side panel) use less. */
  labelWidth?: number;
  label: ReactNode;
  children: ReactNode;
  align?: 'center' | 'start';
}) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: `${labelWidth}px minmax(0, 1fr)` },
      alignItems: align === 'center' ? 'center' : 'start',
      columnGap: 1.5,
      rowGap: 0.5,
      minHeight: 32,
    }}
  >
    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', pt: align === 'start' ? 0.75 : 0 }}>{label}</Typography>
    <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>{children}</Box>
  </Box>
);

/**
 * An on/off option: its name (and, if it helps, a line on what it does) on the left, the switch at
 * the right end — the grammar of a row in Settings — and the whole row toggles it. A lone switch in
 * the label column reads as a stray control; this reads as a sentence. Controls that only matter
 * while it is on (a volume) sit under it.
 *
 * `dense` is the bare row for small cards and popovers; without it the row is padded for an
 * `OptionList`, where an inspector section keeps its on/off options together.
 */
export const OptionSwitch = ({
  label,
  description,
  hint,
  checked,
  onChange,
  disabled,
  dense,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** A tooltip on the row — for a reason it is disabled, or detail too long to show. */
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  dense?: boolean;
  /** Shown under the row while the option is on. */
  children?: ReactNode;
}) => {
  const row = (
    <Box>
      <Stack
        component="label"
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: 'center',
          minHeight: dense ? 32 : 40,
          px: dense ? 0.5 : 1.25,
          mx: dense ? -0.5 : 0,
          py: dense ? 0.25 : 0.6,
          borderRadius: dense ? 0.75 : 0,
          cursor: disabled ? 'default' : 'pointer',
          '&:hover': disabled ? undefined : { bgcolor: 'action.hover' },
        }}
      >
        <Stack sx={{ flex: 1, minWidth: 0, opacity: disabled ? 0.55 : 1 }}>
          <Typography sx={{ fontSize: dense ? '0.8rem' : 13 }}>{label}</Typography>
          {description && (
            <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.35 }}>
              {description}
            </Typography>
          )}
        </Stack>
        <Switch size="small" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      </Stack>
      {checked && children && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: dense ? 0 : 1.25, pb: 1 }}>{children}</Box>
      )}
    </Box>
  );
  return hint ? (
    <Tooltip title={hint} placement="top-start">
      {row}
    </Tooltip>
  ) : (
    row
  );
};

/** A section's on/off options as one framed list, one `OptionSwitch` per row. */
export const OptionList = ({ children }: { children: ReactNode }) => (
  <Box
    sx={{
      border: 1,
      borderColor: 'divider',
      borderRadius: 1,
      overflow: 'hidden',
      '& > * + *': { borderTop: 1, borderColor: 'divider' },
    }}
  >
    {children}
  </Box>
);

/** A compact two-or-more-way switch in the inspector (Content | Background, Cut | Fade). */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  size = 'medium',
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** Small fits the narrow screen-group cards. */
  size?: 'small' | 'medium';
}) => (
  <Stack direction="row" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', flexShrink: 0 }}>
    {options.map((option, index) => {
      const on = option.value === value;
      return (
        <ButtonBase
          key={option.value}
          aria-pressed={on}
          onClick={() => onChange(option.value)}
          sx={(theme) => ({
            px: size === 'small' ? 0.8 : 1.25,
            py: size === 'small' ? 0.3 : 0.5,
            fontSize: size === 'small' ? 11.5 : 12.5,
            fontWeight: on ? 600 : 400,
            color: on ? 'text.primary' : 'text.secondary',
            bgcolor: on ? alpha(theme.palette.text.primary, 0.12) : 'transparent',
            borderLeft: index > 0 ? 1 : 0,
            borderColor: 'divider',
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, on ? 0.16 : 0.06) },
          })}
        >
          {option.label}
        </ButtonBase>
      );
    })}
  </Stack>
);

/** Title-safe (90 %) and action-safe (93 %) rectangles and a centre cross, as an editing suite draws them. */
export const SafeAreaGuides = () => (
  <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
    {[
      { inset: '3.5%', color: 'rgba(255,255,255,0.35)' },
      { inset: '5%', color: 'rgba(255,214,0,0.55)' },
    ].map(({ inset, color }) => (
      <Box key={inset} sx={{ position: 'absolute', inset, border: `1px dashed ${color}` }} />
    ))}
    <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, transform: 'translate(-50%,-50%)' }}>
      <Box sx={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', bgcolor: 'rgba(255,255,255,0.45)' }} />
      <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', bgcolor: 'rgba(255,255,255,0.45)' }} />
    </Box>
  </Box>
);

/**
 * A monitor: a dark frame with a strip on top — a tally dot in its colour, the name, badges, and
 * what it shows on the right — over the picture. Used by the operator's Program / Preview and by
 * the theme editor's preview panes, so every picture of an output looks the same.
 */
export const MonitorFrame = ({
  tally,
  label,
  labelHint,
  info,
  badges,
  children,
}: {
  /** Colour of the dot and the frame; omitted for a neutral monitor (the theme editor). */
  tally?: string;
  label: string;
  labelHint?: string;
  info?: string;
  badges?: ReactNode;
  children: ReactNode;
}) => (
  <Box
    sx={{
      borderRadius: 1,
      overflow: 'hidden',
      border: 1,
      borderColor: tally ? alpha(tally, 0.65) : 'rgba(255,255,255,0.1)',
      bgcolor: '#101114',
    }}
  >
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ alignItems: 'center', px: 0.75, py: 0.4, minWidth: 0, bgcolor: tally ? alpha(tally, 0.12) : 'rgba(255,255,255,0.04)' }}
    >
      {tally && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tally, boxShadow: `0 0 5px ${tally}`, flexShrink: 0 }} />}
      <Tooltip title={labelHint ?? ''}>
        <Typography
          component="span"
          sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: '#e9ecef', flexShrink: 0 }}
        >
          {label}
        </Typography>
      </Tooltip>
      {badges}
      <Box sx={{ flex: 1 }} />
      {info && (
        <Typography noWrap sx={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(233,236,239,0.7)', minWidth: 0 }}>
          {info}
        </Typography>
      )}
    </Stack>
    <Box sx={{ position: 'relative' }}>{children}</Box>
  </Box>
);
