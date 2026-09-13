import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { RestartAlt, Crop, OpenWith } from '@mui/icons-material';
import { CueSource } from './CueMedia';
import { defaultFrame, type CuePacket, type MediaFrame, type MediaSource } from './types';
import { clamp } from './engine';
import { useMediaLabels } from './labels';
import { resolveMediaUrl } from '@/utils/mediaUrl';

export function FrameEditor({
  value,
  source,
  packet,
  aspectRatio = 16 / 9,
  onClose,
  onApply,
}: {
  aspectRatio?: number;
  value: MediaFrame;
  source: MediaSource;
  packet: CuePacket;
  onClose: () => void;
  onApply: (frame: MediaFrame) => void;
}) {
  const l = useMediaLabels(),
    [frame, setFrame] = useState<MediaFrame>(() => structuredClone(value));
  const drag = useRef<
    { x: number; y: number; before: MediaFrame; stage: 'crop' | 'placement'; corner?: string; width: number; height: number } | undefined
  >(undefined);
  const [sourceRatio, setSourceRatio] = useState(16 / 9);
  const url = resolveMediaUrl(source.path) || source.path;
  const previewPacket = { ...packet, at: Date.now(), transport: { ...packet.transport, playing: false } };
  const begin = (e: React.PointerEvent<HTMLDivElement>, stage: 'crop' | 'placement') => {
    if (e.button !== 0) return;
    if (stage === 'crop' && !(e.target as HTMLElement).closest('[data-crop]')) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      before: structuredClone(frame),
      stage,
      corner: (e.target as HTMLElement).dataset.corner,
      width: rect.width,
      height: rect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.width,
      dy = (e.clientY - d.y) / d.height,
      f = structuredClone(d.before),
      c = f.crop;
    if (d.stage === 'placement') {
      f.x = clamp(f.x + dx * 100, -50, 150);
      f.y = clamp(f.y + dy * 100, -50, 150);
    } else if (!d.corner) {
      c.x = clamp(c.x + dx, 0, 1 - c.w);
      c.y = clamp(c.y + dy, 0, 1 - c.h);
    } else {
      if (d.corner.includes('w')) {
        c.x = clamp(c.x + dx, 0, d.before.crop.x + c.w - 0.02);
        c.w = d.before.crop.x + d.before.crop.w - c.x;
      }
      if (d.corner.includes('e')) c.w = clamp(c.w + dx, 0.02, 1 - c.x);
      if (d.corner.includes('n')) {
        c.y = clamp(c.y + dy, 0, d.before.crop.y + c.h - 0.02);
        c.h = d.before.crop.y + d.before.crop.h - c.y;
      }
      if (d.corner.includes('s')) c.h = clamp(c.h + dy, 0.02, 1 - c.y);
    }
    setFrame(f);
  };
  const cancelDrag = () => {
    if (drag.current) setFrame(drag.current.before);
    drag.current = undefined;
  };
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {l('framing')} · {source.name}
      </DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography>
              <Crop fontSize="small" /> {l('crop')}
            </Typography>
            <Box
              sx={{ position: 'relative', aspectRatio: sourceRatio, bgcolor: '#000', touchAction: 'none', userSelect: 'none' }}
              onPointerDown={(e) => begin(e, 'crop')}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = undefined;
              }}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
            >
              {source.type === 'video' ? (
                <video
                  src={url}
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    setSourceRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9);
                    e.currentTarget.currentTime = clamp(
                      packet.transport.time + source.offset,
                      0,
                      Math.max(0, e.currentTarget.duration - 0.001),
                    );
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }}
                />
              ) : (
                <img
                  src={url}
                  alt={source.name}
                  onLoad={(e) => setSourceRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 16 / 9)}
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }}
                />
              )}
              <Box
                data-crop
                sx={{
                  position: 'absolute',
                  left: `${frame.crop.x * 100}%`,
                  top: `${frame.crop.y * 100}%`,
                  width: `${frame.crop.w * 100}%`,
                  height: `${frame.crop.h * 100}%`,
                  border: '2px solid',
                  borderColor: 'warning.main',
                  cursor: 'move',
                }}
              >
                {frame.crop.w > 0.18 &&
                  frame.crop.h > 0.18 &&
                  ['nw', 'ne', 'sw', 'se'].map((corner) => (
                    <Box
                      component="button"
                      key={corner}
                      data-corner={corner}
                      aria-label={`${l('crop')} ${corner}`}
                      sx={{
                        position: 'absolute',
                        [corner.includes('w') ? 'left' : 'right']: 0,
                        [corner.includes('n') ? 'top' : 'bottom']: 0,
                        width: 24,
                        height: 24,
                        bgcolor: 'background.paper',
                        border: '2px solid',
                        borderColor: 'warning.main',
                        cursor: 'nwse-resize',
                      }}
                    />
                  ))}
              </Box>
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography>
              <OpenWith fontSize="small" /> {l('placement')}
            </Typography>
            <Box
              sx={{ position: 'relative', aspectRatio, bgcolor: '#000', touchAction: 'none', overflow: 'hidden' }}
              onPointerDown={(e) => begin(e, 'placement')}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = undefined;
              }}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
            >
              <CueSource packet={previewPacket} source={{ ...source, path: url }} frame={frame} />
              <Box
                sx={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  left: `${frame.x - frame.scale / 2}%`,
                  top: `${frame.y - frame.scale / 2}%`,
                  width: `${frame.scale}%`,
                  height: `${frame.scale}%`,
                  border: '1px dashed',
                  borderColor: 'warning.main',
                }}
              />
            </Box>
          </Box>
        </Stack>
        <Stack spacing={2} sx={{ mt: 2 }}>
          <TextField
            select
            label={l('placement')}
            value={frame.fit}
            onChange={(e) => setFrame((f) => ({ ...f, fit: e.target.value as MediaFrame['fit'] }))}
          >
            {(['contain', 'cover', 'fill'] as const).map((fit) => (
              <MenuItem key={fit} value={fit}>
                {l(fit)}
              </MenuItem>
            ))}
          </TextField>
          {(['scale', 'x', 'y', 'blur'] as const).map((key) => (
            <Stack key={key} direction="row" sx={{ alignItems: 'center', gap: 2 }}>
              <Typography sx={{ minWidth: 100 }}>{key === 'x' ? 'X (%)' : key === 'y' ? 'Y (%)' : l(key)}</Typography>
              <Slider
                aria-label={key}
                value={frame[key]}
                min={key === 'scale' ? 20 : key === 'blur' ? 0 : -50}
                max={key === 'scale' ? 180 : key === 'blur' ? 30 : 150}
                step={0.5}
                valueLabelDisplay="auto"
                onChange={(_, v) => setFrame((f) => ({ ...f, [key]: v as number }))}
              />
            </Stack>
          ))}
          <Box component="details">
            <Box component="summary">{l('crop')} (%)</Box>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {(['x', 'y', 'w', 'h'] as const).map((key) => (
                <TextField
                  key={key}
                  label={key.toUpperCase()}
                  type="number"
                  size="small"
                  value={Math.round(frame.crop[key] * 10000) / 100}
                  sx={{ width: 110 }}
                  slotProps={{ htmlInput: { min: key === 'w' || key === 'h' ? 2 : 0, max: 100, step: 0.1 } }}
                  onChange={(e) => {
                    if (e.target.value === '') return;
                    const n = Number(e.target.value) / 100;
                    if (!Number.isFinite(n)) return;
                    setFrame((f) => {
                      const c = { ...f.crop };
                      if (key === 'x') c.x = clamp(n, 0, 1 - c.w);
                      if (key === 'y') c.y = clamp(n, 0, 1 - c.h);
                      if (key === 'w') c.w = clamp(n, 0.02, 1 - c.x);
                      if (key === 'h') c.h = clamp(n, 0.02, 1 - c.y);
                      return { ...f, crop: c };
                    });
                  }}
                />
              ))}
            </Stack>
          </Box>
          <Button startIcon={<RestartAlt />} onClick={() => setFrame(defaultFrame())}>
            {l('reset')}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{l('cancel')}</Button>
        <Button onClick={() => onApply(frame)}>{l('save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
