import { Typography, type TypographyProps } from '@mui/material';

/**
 * The operator view's one style for section titles — small monospace capitals: slide headers'
 * arrangement, layer rows, inspector fields, menus. Never for content (song titles, group names).
 */
export const SectionLabel = ({ children, sx, ...props }: TypographyProps) => (
  <Typography
    variant="caption"
    noWrap
    {...props}
    sx={[
      {
        fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        lineHeight: 1.6,
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Typography>
);
