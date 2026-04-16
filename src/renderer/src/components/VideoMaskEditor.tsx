/**
 * Video Mask Editor — visual editor for percentage-based video crop regions (§12.6).
 * Allows the user to drag a resizable rectangle on a preview area to define a mask.
 */
import { useState, useRef, useCallback, useMemo, MouseEvent } from 'react';
import { useI18nContext } from '@/i18n/i18n-react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { CropFree as CropIcon, RestartAlt as ResetIcon } from '@mui/icons-material';

export interface VideoMask {
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100
  height: number; // 0-100
}

const PRESETS: { id: string; mask: VideoMask }[] = [
  { id: 'full', mask: { x: 0, y: 0, width: 100, height: 100 } },
  { id: 'left_half', mask: { x: 0, y: 0, width: 50, height: 100 } },
  { id: 'right_half', mask: { x: 50, y: 0, width: 50, height: 100 } },
  { id: 'top_half', mask: { x: 0, y: 0, width: 100, height: 50 } },
  { id: 'bottom_half', mask: { x: 0, y: 50, width: 100, height: 50 } },
  { id: 'center_third', mask: { x: 33, y: 0, width: 34, height: 100 } },
];

interface VideoMaskEditorProps {
  open: boolean;
  onClose: () => void;
  initialMask?: VideoMask | null;
  onSave: (mask: VideoMask | null) => void;
}

export const VideoMaskEditor = ({ open, onClose, initialMask, onSave }: VideoMaskEditorProps) => {
  const { LL } = useI18nContext();
  const [mask, setMask] = useState<VideoMask>(initialMask || { x: 0, y: 0, width: 100, height: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const updateField = useCallback((field: keyof VideoMask, value: number) => {
    setMask((prev) => ({
      ...prev,
      [field]: clamp(value, 0, 100),
    }));
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDragging(true);
    setDragStart({ x, y });
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStart) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setMask({
        x: clamp(Math.min(dragStart.x, x), 0, 100),
        y: clamp(Math.min(dragStart.y, y), 0, 100),
        width: clamp(Math.abs(x - dragStart.x), 1, 100),
        height: clamp(Math.abs(y - dragStart.y), 1, 100),
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleSave = useCallback(() => {
    // If mask covers everything, save null (no mask)
    if (mask.x === 0 && mask.y === 0 && mask.width === 100 && mask.height === 100) {
      onSave(null);
    } else {
      onSave({
        x: Math.round(mask.x),
        y: Math.round(mask.y),
        width: Math.round(mask.width),
        height: Math.round(mask.height),
      });
    }
    onClose();
  }, [mask, onSave, onClose]);

  // CSS clip-path preview
  const clipPath = useMemo(() => {
    const { x, y, width, height } = mask;
    const right = x + width;
    const bottom = y + height;
    return `inset(${y}% ${100 - right}% ${100 - bottom}% ${x}%)`;
  }, [mask]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CropIcon />
          <Typography variant="h6">{LL.VIDEO.MASK_TITLE()}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Presets */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {PRESETS.map((p) => (
              <Button key={p.id} size="small" variant="outlined" onClick={() => setMask(p.mask)}>
                {(p.id === 'full' && LL.VIDEO.PRESET_FULL()) ||
                  (p.id === 'left_half' && LL.VIDEO.PRESET_LEFT_HALF()) ||
                  (p.id === 'right_half' && LL.VIDEO.PRESET_RIGHT_HALF()) ||
                  (p.id === 'top_half' && LL.VIDEO.PRESET_TOP_HALF()) ||
                  (p.id === 'bottom_half' && LL.VIDEO.PRESET_BOTTOM_HALF()) ||
                  (p.id === 'center_third' && LL.VIDEO.PRESET_CENTER_THIRD())}
              </Button>
            ))}
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<ResetIcon />}
              onClick={() => setMask({ x: 0, y: 0, width: 100, height: 100 })}
            >
              {LL.VIDEO.MASK_RESET()}
            </Button>
          </Stack>

          {/* Visual editor */}
          <Box
            ref={containerRef}
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              bgcolor: '#111',
              borderRadius: 1,
              overflow: 'hidden',
              cursor: isDragging ? 'crosshair' : 'crosshair',
              userSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Background placeholder */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#333',
              }}
            >
              <Typography variant="h4" fontWeight={700}>
                {LL.VIDEO.PREVIEW()}
              </Typography>
            </Box>

            {/* Dimmed overlay (outside mask) */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(0,0,0,0.6)',
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${mask.x}% ${mask.y}%, ${mask.x}% ${mask.y + mask.height}%, ${mask.x + mask.width}% ${mask.y + mask.height}%, ${mask.x + mask.width}% ${mask.y}%, ${mask.x}% ${mask.y}%)`,
                pointerEvents: 'none',
              }}
            />

            {/* Mask border */}
            <Box
              sx={{
                position: 'absolute',
                left: `${mask.x}%`,
                top: `${mask.y}%`,
                width: `${mask.width}%`,
                height: `${mask.height}%`,
                border: '2px dashed #4fc3f7',
                pointerEvents: 'none',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  bottom: -18,
                  left: 0,
                  color: '#4fc3f7',
                  fontSize: '0.6rem',
                }}
              >
                {Math.round(mask.x)}%, {Math.round(mask.y)}% — {Math.round(mask.width)}×{Math.round(mask.height)}%
              </Typography>
            </Box>
          </Box>

          {/* Numeric inputs */}
          <Stack direction="row" spacing={2}>
            <TextField
              label={LL.VIDEO.MASK_LABEL_X()}
              type="number"
              size="small"
              value={Math.round(mask.x)}
              onChange={(e) => updateField('x', Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0, max: 100 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={LL.VIDEO.MASK_LABEL_Y()}
              type="number"
              size="small"
              value={Math.round(mask.y)}
              onChange={(e) => updateField('y', Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0, max: 100 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={LL.VIDEO.MASK_LABEL_WIDTH()}
              type="number"
              size="small"
              value={Math.round(mask.width)}
              onChange={(e) => updateField('width', Number(e.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 100 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={LL.VIDEO.MASK_LABEL_HEIGHT()}
              type="number"
              size="small"
              value={Math.round(mask.height)}
              onChange={(e) => updateField('height', Number(e.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 100 } }}
              sx={{ flex: 1 }}
            />
          </Stack>

          {/* CSS preview */}
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
            {LL.VIDEO.CLIP_PATH_PREFIX()} {clipPath}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={handleSave}>
          {LL.VIDEO.MASK_APPLY()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
