/**
 * Visual screen picker — the displays of this machine drawn to scale in their real
 * arrangement, the way the OS display settings show them.
 *
 * The point is that assigning a presentation window to a beamer should be a click on the
 * thing you are pointing at, not arithmetic with pixel coordinates. Coordinates remain
 * available in the Window Manager's advanced section for the cases this cannot express
 * (a window spanning two screens, a deliberate offset inside one screen).
 *
 * Electron-only in practice: in the browser `listScreens()` reports a single synthetic
 * screen, which still renders correctly (one box) but carries no choice.
 */
import { Box, Chip, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';

type Rect = { x: number; y: number; width: number; height: number };

export type ScreenInfo = {
  id: number;
  label: string;
  /** Scaled (DIP) coordinates — window placement uses these. */
  bounds: Rect;
  /** Real pixels, for drawing and the resolution label. Missing from older desktop builds. */
  pixels?: Rect;
  scaleFactor?: number;
  isPrimary: boolean;
};

/**
 * Where a screen sits in real pixels. Windows scales `bounds` by the display's scale factor, so a
 * 4K panel at 200 % would otherwise be drawn and labelled as a 1080p one.
 */
export const pixelsOf = (s: ScreenInfo): Rect => s.pixels ?? s.bounds;

/** "3840×2160 · 200 %" — the scale explains why the window's own numbers are smaller. */
export const resolutionLabel = (s: ScreenInfo): string => {
  const { width, height } = pixelsOf(s);
  const scale = s.scaleFactor && s.scaleFactor !== 1 ? ` · ${Math.round(s.scaleFactor * 100)} %` : '';
  return `${width}×${height}${scale}`;
};

/** Window bounds (DIP) mapped into the pixel space of the screen they sit on, for drawing. */
export const boundsInPixels = (bounds: Rect, screens: ScreenInfo[]): Rect => {
  const s = screens.find((screen) => screen.id === screenIdForBounds(bounds, screens));
  if (!s) return bounds;
  const p = pixelsOf(s);
  const k = p.width / s.bounds.width;
  return { x: p.x + (bounds.x - s.bounds.x) * k, y: p.y + (bounds.y - s.bounds.y) * k, width: bounds.width * k, height: bounds.height * k };
};

/** A window drawn on top of the screen it currently occupies. */
export type ScreenPickerWindow = {
  id: string;
  name: string;
  bounds?: { x: number; y: number; width: number; height: number };
};

interface ScreenPickerProps {
  screens: ScreenInfo[];
  /** Currently chosen screen id, or '' for "not assigned to a specific screen". */
  value: number | '';
  onChange: (screenId: number) => void;
  /** Open windows, so each screen shows what already lives there. */
  windows?: ScreenPickerWindow[];
  /** Height of the drawing area in px. The layout scales to fit inside it. */
  height?: number;
  /** Width budget the layout is scaled into. Defaults to the drawer's content width. */
  maxWidth?: number;
}

/**
 * Which screen a set of window bounds belongs to: the screen containing the window's
 * center point. A window straddling two screens is attributed to the one showing more
 * of it, which is what the OS does when you ask which display a window is "on".
 */
export const screenIdForBounds = (
  bounds: { x: number; y: number; width: number; height: number } | undefined,
  screens: ScreenInfo[],
): number | null => {
  if (!bounds) return null;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  for (const s of screens) {
    if (cx >= s.bounds.x && cx < s.bounds.x + s.bounds.width && cy >= s.bounds.y && cy < s.bounds.y + s.bounds.height) {
      return s.id;
    }
  }
  return null;
};

/**
 * The desktop-to-pixels mapping shared by every view that draws the screen arrangement.
 *
 * The bounding box is taken over all screens rather than from 0,0 — a display placed left
 * of the primary one starts at a negative coordinate. One scale factor serves both axes so
 * aspect ratios survive: a 16:9 screen has to look 16:9, or the picture stops matching the
 * desk it describes.
 */
export const deskLayout = (
  screens: ScreenInfo[],
  maxWidth: number,
  height: number,
  pad = 8,
): { scale: number; boardW: number; boardH: number; minX: number; minY: number } => {
  const rects = screens.map(pixelsOf);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);
  const scale = Math.min((maxWidth - pad * 2) / totalW, (height - pad * 2) / totalH);
  return { scale, boardW: totalW * scale, boardH: totalH * scale, minX, minY };
};

export const ScreenPicker = ({ screens, value, onChange, windows = [], height = 190, maxWidth = 500 }: ScreenPickerProps) => {
  const { LL } = useI18nContext();

  if (screens.length === 0) return null;

  const { scale, boardW, boardH, minX, minY } = deskLayout(screens, maxWidth, height);

  return (
    <Stack spacing={0.5}>
      <Box
        sx={{
          position: 'relative',
          height,
          borderRadius: 1,
          bgcolor: 'action.hover',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Fixed-size stage centered in the box; screens are positioned inside it. */}
        <Box sx={{ position: 'relative', width: boardW, height: boardH }}>
          {screens.map((s) => {
            const selected = value === s.id;
            const px = pixelsOf(s);
            const left = (px.x - minX) * scale;
            const top = (px.y - minY) * scale;
            const w = px.width * scale;
            const h = px.height * scale;
            const onThisScreen = windows.filter((win) => screenIdForBounds(win.bounds, screens) === s.id);

            return (
              <Box
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onChange(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(s.id);
                  }
                }}
                sx={(theme) => ({
                  position: 'absolute',
                  left,
                  top,
                  width: Math.max(24, w - 4),
                  height: Math.max(20, h - 4),
                  border: '2px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.22) : theme.palette.background.paper,
                  borderRadius: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  transition: 'background-color 120ms, border-color 120ms',
                  '&:hover': { borderColor: 'primary.light' },
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                })}
              >
                <Typography variant="caption" noWrap sx={{ fontWeight: 700, px: 0.5, maxWidth: '100%' }}>
                  {s.label}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem' }}>
                  {resolutionLabel(s)}
                </Typography>
                {s.isPrimary && (
                  <Chip
                    label={LL.WINDOW.PRIMARY_SCREEN()}
                    size="small"
                    sx={{ height: 15, fontSize: '0.55rem', mt: 0.25, '& .MuiChip-label': { px: 0.6 } }}
                  />
                )}
                {/* What is already on this screen — the missing piece when deciding where a
                    new window should go, and the fastest way to spot two windows stacked
                    on the same beamer. */}
                {onThisScreen.length > 0 && (
                  <Stack
                    direction="row"
                    spacing={0.25}
                    sx={{ mt: 0.25, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%', px: 0.25 }}
                  >
                    {onThisScreen.slice(0, 3).map((win) => (
                      <Chip
                        key={win.id}
                        label={win.name}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 15, fontSize: '0.55rem', maxWidth: 90, '& .MuiChip-label': { px: 0.6 } }}
                      />
                    ))}
                    {onThisScreen.length > 3 && (
                      <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>
                        +{onThisScreen.length - 3}
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {LL.WINDOW.SCREEN_PICKER_HINT()}
      </Typography>
    </Stack>
  );
};
