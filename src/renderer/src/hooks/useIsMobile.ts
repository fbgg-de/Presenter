import { useMediaQuery, useTheme } from '@mui/material';

/**
 * True on phone-sized viewports (below MUI's `sm` breakpoint, i.e. < 600px).
 *
 * The single definition of "mobile" for layout switches that CSS breakpoints alone cannot
 * express — full-screen dialogs, moving row actions onto their own line, dropping redundant
 * labels. Prefer responsive `sx` values (`{ xs: …, sm: … }`) where they suffice; reach for
 * this hook when the component tree itself has to change.
 */
export const useIsMobile = (): boolean => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
};
