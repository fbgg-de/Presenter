/**
 * The edge between two operator view columns: drag to resize, double-click to hide the column.
 * While dragging only the live width changes (`onResize`); the setting is written once on release
 * (`onCommit`), so a drag does not persist settings on every pointer move.
 */
import { useRef } from 'react';
import { Box } from '@mui/material';
import type { SizeRange } from './tileSize';

export const ColumnResizer = ({
  width,
  range,
  direction,
  label,
  onResize,
  onCommit,
  onHide,
}: {
  width: number;
  range: SizeRange;
  /** 1 when the column is left of the handle (dragging right widens it), -1 when it is right of it. */
  direction: 1 | -1;
  label: string;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
  onHide: () => void;
}) => {
  const start = useRef<{ x: number; width: number } | null>(null);
  const widthAt = (clientX: number) => {
    const from = start.current ?? { x: clientX, width };
    return Math.round(Math.min(range.max, Math.max(range.min, from.width + (clientX - from.x) * direction)));
  };

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        if (start.current) onResize(widthAt(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const next = widthAt(e.clientX);
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(next);
      }}
      onDoubleClick={onHide}
      sx={{
        width: 6,
        flexShrink: 0,
        cursor: 'col-resize',
        touchAction: 'none',
        transition: 'background-color 120ms',
        '&:hover, &:active': { bgcolor: 'action.hover' },
      }}
    />
  );
};
