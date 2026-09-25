/**
 * Resizing for the operator view's tiles (screen-group previews, song slides): a button with a
 * slider popover. Ctrl + wheel over the tiles comes from `useCtrlWheelSize` in tileSize.ts.
 */
import { useState } from 'react';
import { IconButton, Popover, Slider, Tooltip, Typography } from '@mui/material';
import { PhotoSizeSelectLarge as TileSizeIcon } from '@mui/icons-material';
import type { SizeRange } from './tileSize';

export const SizeButton = ({
  title,
  hint,
  range,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  range: SizeRange;
  value: number;
  onChange: (value: number) => void;
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={title}>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ flexShrink: 0 }}>
          <TileSizeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, width: 260 } } }}
      >
        <Typography variant="subtitle2">{title}</Typography>
        <Slider
          size="small"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}px`}
          onChange={(_, next) => onChange(next as number)}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {hint}
        </Typography>
      </Popover>
    </>
  );
};
