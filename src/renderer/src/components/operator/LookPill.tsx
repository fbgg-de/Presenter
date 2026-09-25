import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

export type LookPillKind = 'theme' | 'background' | 'tweak' | 'plain';

/** [base, text on dark, text on light] — the same hues everywhere a look is summarised. */
const PALETTE: Record<LookPillKind, [string, string, string]> = {
  theme: ['#6f76d9', '#c3c7ff', '#353b9e'],
  background: ['#3fc2b3', '#8fe3d8', '#0b6d63'],
  tweak: ['#f0a94a', '#ffd49a', '#8a5300'],
  plain: ['#8d93a1', '#c9cdd6', '#4a505c'],
};

/**
 * A small coloured label for one part of a look: indigo for the theme, teal for the background,
 * amber for something changed locally. `inverted` draws it on a selected (primary-coloured) row.
 */
export const LookPill = ({ kind, label, inverted }: { kind: LookPillKind; label: string; inverted?: boolean }) => (
  <Box
    component="span"
    title={label}
    sx={(theme) => ({
      display: 'inline-block',
      fontSize: '0.64rem',
      lineHeight: '16px',
      px: 0.6,
      borderRadius: 0.5,
      whiteSpace: 'nowrap',
      maxWidth: 160,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      verticalAlign: 'middle',
      bgcolor: inverted ? 'rgba(255,255,255,0.22)' : alpha(PALETTE[kind][0], theme.palette.mode === 'dark' ? 0.24 : 0.16),
      color: inverted ? '#fff' : theme.palette.mode === 'dark' ? PALETTE[kind][1] : PALETTE[kind][2],
    })}
  >
    {label}
  </Box>
);
