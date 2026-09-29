import { useMemo, type ReactNode } from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { usePreviewScale } from '@/components/style/styleFormUtils';
import { styleToTextCss, type ResolvedStyle } from '@/utils/styleUtils';
import type { BackgroundData } from '@/look/types';
import { styleBackground as backgroundOf } from '@/look/styleBackground';

/**
 * A small picture of one screen group: `picture` when the caller has the real thing (the operator's
 * top bar passes the actual output page), else drawn from a look — its background and the first
 * lines of a sample in its theme (the theme editor's group strip).
 */
export const GroupMonitor = ({
  label,
  sublabel,
  style,
  media,
  background,
  lines,
  showText,
  showBackground,
  black,
  blackLabel,
  live,
  width = 140,
  onOpen,
  openLabel,
  onShowWindows,
  showWindowsLabel,
  picture,
  aspect = '16/9',
}: {
  /** Draws the picture instead of background and lines. */
  picture?: ReactNode;
  /** The tile's proportions — the group's window, when `picture` draws it at its real size. */
  aspect?: string;
  /** Offered while no window of the group is open: the tile becomes a "+ Open window" button. */
  onOpen?: () => void;
  /** A live tile opens the group's windows (show/hide, quick actions, Window Manager). */
  onShowWindows?: (anchor: HTMLElement) => void;
  showWindowsLabel?: string;
  openLabel?: string;
  /** Tile width (pixels, or any CSS width); the picture keeps 16:9 and its text scales with it. */
  width?: number | string;
  label: string;
  sublabel?: string;
  /** The drawn picture (without `picture`): */
  style?: ResolvedStyle;
  /** A media item shown full-screen instead of the background. */
  media?: BackgroundData;
  /** The background entry running on the group; without one the theme's colour shows. */
  background?: BackgroundData;
  lines?: string[];
  showText?: boolean;
  showBackground?: boolean;
  black: boolean;
  blackLabel: string;
  /** Whether a window of this group is open. */
  live: boolean;
}) => {
  const { measureRef, scale } = usePreviewScale();
  const textCss = useMemo(() => (style ? scale(styleToTextCss(style)) : {}), [style, scale]);

  return (
    <Stack spacing={0.25} sx={{ width, flexShrink: 0 }}>
      {onOpen && !live ? (
        // A closed group invites opening it instead of showing a black picture nobody sees.
        <ButtonBase
          onClick={onOpen}
          sx={{
            aspectRatio: aspect,
            width: '100%',
            borderRadius: 0.5,
            border: '2px dashed',
            borderColor: 'divider',
            color: 'text.secondary',
            fontSize: '0.72rem',
            '&:hover': { borderColor: 'text.secondary', color: 'text.primary' },
          }}
        >
          + {openLabel}
        </ButtonBase>
      ) : (
        <Box
          ref={measureRef}
          component={onShowWindows ? ButtonBase : 'div'}
          title={onShowWindows ? showWindowsLabel : undefined}
          onClick={onShowWindows ? (e: { currentTarget: HTMLElement }) => onShowWindows(e.currentTarget) : undefined}
          sx={{
            position: 'relative',
            display: 'block',
            width: '100%',
            aspectRatio: aspect,
            overflow: 'hidden',
            borderRadius: 0.5,
            outline: 2,
            outlineColor: live ? 'error.main' : 'divider',
            bgcolor: '#000',
            ...(onShowWindows && { cursor: 'pointer', '&:hover': { outlineColor: live ? 'error.light' : 'text.secondary' } }),
          }}
        >
          {picture}
          {!picture && style && (media || showBackground) && (
            <Box sx={{ position: 'absolute', inset: 0, '& > div': { border: 0, borderRadius: 0, height: '100%', aspectRatio: 'auto' } }}>
              <BackgroundThumb data={media ?? { ...backgroundOf(style), ...background }} />
            </Box>
          )}
          {!picture && style && lines && showText && !media && lines.length > 0 && (
            <Stack
              sx={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                p: '6%',
              }}
            >
              {lines.map((line, index) => (
                <Typography
                  key={index}
                  sx={{ ...textCss, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
                >
                  {line}
                </Typography>
              ))}
            </Stack>
          )}
          {black && (
            <Stack sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: 'error.light', fontWeight: 600 }}>
                {blackLabel}
              </Typography>
            </Stack>
          )}
        </Box>
      )}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          {live && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />}
          <Typography variant="caption" noWrap sx={{ fontWeight: 600, fontSize: '0.68rem', minWidth: 0 }}>
            {label}
          </Typography>
        </Stack>
        {sublabel && (
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', minWidth: 0 }}>
            {sublabel}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
};
