/**
 * Crop & place for one screen: which part of the file shows (the crop, drawn on the source) and
 * where it sits on the screen (fit, scale, position, blur). Both pictures can be dragged and the
 * sliders snap to the usual steps. The video wall tiles crop one screen's share of the file in a
 * click — and a clip shaped like several screens (32:9 = two 16:9 side by side) gets its own wall
 * offered first.
 */
import { useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { RestartAlt } from '@mui/icons-material';
import { InspectorRow, MonitorFrame, Segmented } from '@/components/media/Viewer';
import { TRANSPORT_ACTIVE } from '@/components/media/Transport';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { CueSource } from './CueMedia';
import { defaultFrame, type CuePacket, type MediaFrame, type MediaSource } from './types';
import { clamp } from './engine';
import { isFullCrop, tileFrame, tileOf, wallFor, type WallTile } from './framing';
import { useMediaLabels } from './labels';

const FITS = ['cover', 'contain', 'fill'] as const;

type Labels = ReturnType<typeof useMediaLabels>;

/** "3×3 · row 1 · column 2"; a one-row wall only names the column. */
const tileName = (t: WallTile, l: Labels): string =>
  t.cols * t.rows === 1
    ? l('wholePicture')
    : [`${t.cols}×${t.rows}`, t.rows > 1 && `${l('row')} ${t.row + 1}`, t.cols > 1 && `${l('column')} ${t.col + 1}`]
        .filter(Boolean)
        .join(' · ');

/** 3840×1080 → "32:9"; sizes without a short ratio as a decimal (2560×1080 → "2.37:1"). */
const ratioName = (w: number, h: number): string => {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return w / g <= 64 && h / g <= 64 ? `${w / g}:${h / g}` : `${(w / h).toFixed(2)}:1`;
};

/** What a frame does, in a few words — for the screen rows, so nobody has to open the editor to know. */
export function useFrameSummary() {
  const l = useMediaLabels();
  return (frame: MediaFrame): string => {
    const parts: string[] = [];
    const tile = tileOf(frame);
    if (tile) {
      if (tile.cols * tile.rows > 1) parts.push(tileName(tile, l));
    } else {
      if (frame.scale !== 100 || frame.x !== 50 || frame.y !== 50)
        parts.push(`${Math.round(frame.scale)} % · ${Math.round(frame.x)} / ${Math.round(frame.y)}`);
      if (!isFullCrop(frame)) parts.push(`${l('cropShort')} ${Math.round(frame.crop.w * 100)}×${Math.round(frame.crop.h * 100)} %`);
    }
    if (frame.blur > 0) parts.push(`${l('blur')} ${frame.blur}`);
    return parts.join(' · ') || l('wholePicture');
  };
}

/**
 * Where the picture sits, as a sketch: the placement as an amber box, the screen as a white
 * outline, both to scale — so a screen showing one tile of a wall reads as that tile.
 */
export function FrameMap({ frame, width = 64, height = 36 }: { frame: MediaFrame; width?: number; height?: number }) {
  const box = {
    width,
    height,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: '#000',
    borderRadius: 0.5,
  };
  const tile = tileOf(frame);
  if (tile && tile.cols * tile.rows > 1) {
    const k = Math.min(width / (tile.cols * 16), height / (tile.rows * 9));
    return (
      <Box sx={box}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${tile.cols}, 1fr)`,
            gap: '1px',
            width: tile.cols * 16 * k,
            height: tile.rows * 9 * k,
          }}
        >
          {Array.from({ length: tile.cols * tile.rows }, (_, i) => {
            const on = i === tile.row * tile.cols + tile.col;
            return (
              <Box
                key={i}
                sx={{
                  bgcolor: on ? TRANSPORT_ACTIVE : alpha(TRANSPORT_ACTIVE, 0.22),
                  outline: on ? '1.5px solid #fff' : 'none',
                  zIndex: on ? 1 : 0,
                }}
              />
            );
          })}
        </Box>
      </Box>
    );
  }
  const half = frame.scale / 2;
  const left = Math.min(0, frame.x - half);
  const top = Math.min(0, frame.y - half);
  const right = Math.max(100, frame.x + half);
  const bottom = Math.max(100, frame.y + half);
  // In screen percent a 16:9 screen is 100×100, so one unit is 16 wide and 9 high before fitting.
  const k = Math.min(width / ((right - left) * 16), height / ((bottom - top) * 9));
  const rect = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: (x - left) * 16 * k,
    top: (y - top) * 9 * k,
    width: w * 16 * k,
    height: h * 9 * k,
  });
  return (
    <Box sx={box}>
      <Box sx={{ position: 'relative', width: (right - left) * 16 * k, height: (bottom - top) * 9 * k }}>
        <Box
          sx={{
            ...rect(frame.x - half, frame.y - half, frame.scale, frame.scale),
            bgcolor: alpha(TRANSPORT_ACTIVE, 0.35),
            border: `1px solid ${TRANSPORT_ACTIVE}`,
          }}
        />
        <Box sx={{ ...rect(0, 0, 100, 100), border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)' }} />
      </Box>
    </Box>
  );
}

/** A slider with marked steps it snaps to when dragged near (not when stepped by keys), and its value beside it. */
const StepSlider = ({
  label,
  value,
  min,
  max,
  marks,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  marks: number[];
  unit: string;
  onChange: (value: number) => void;
}) => (
  <Stack direction="row" spacing={2} sx={{ alignItems: 'center', width: '100%', pr: 0.5, pb: 1.5 }}>
    <Slider
      size="small"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={0.5}
      marks={marks.map((mark) => ({ value: mark, label: String(Math.round(mark)) }))}
      onChange={(event, v) => {
        const next = v as number;
        const snapped = marks.find((mark) => Math.abs(mark - next) <= (max - min) * 0.02);
        onChange(snapped !== undefined && /mouse|pointer|touch/.test(event.type) ? snapped : next);
      }}
      sx={{ flex: 1, mb: 1, '& .MuiSlider-markLabel': { fontSize: 10.5, color: 'text.secondary' } }}
    />
    <Typography sx={{ fontFamily: 'monospace', fontSize: 12.5, minWidth: 56, textAlign: 'right', mb: 1 }}>
      {Math.round(value * 10) / 10}
      {unit}
    </Typography>
  </Stack>
);

export function FrameEditor({
  value,
  source,
  packet,
  screenName,
  aspectRatio = 16 / 9,
  onClose,
  onApply,
}: {
  aspectRatio?: number;
  value: MediaFrame;
  source: MediaSource;
  packet: CuePacket;
  /** The screen group this framing is for, named in the title. */
  screenName?: string;
  onClose: () => void;
  onApply: (frame: MediaFrame) => void;
}) {
  const l = useMediaLabels(),
    [frame, setFrame] = useState<MediaFrame>(() => structuredClone(value));
  const drag = useRef<
    { x: number; y: number; before: MediaFrame; stage: 'crop' | 'placement'; corner?: string; width: number; height: number } | undefined
  >(undefined);
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number }>();
  const sourceRatio = sourceSize ? sourceSize.w / sourceSize.h : 16 / 9;
  // A clip shaped like several screens offers its own wall first.
  const clipWall = sourceSize && wallFor(sourceRatio, aspectRatio);
  const walls = [...(clipWall ? [clipWall] : []), { cols: 1, rows: 1 }, { cols: 2, rows: 2 }, { cols: 3, rows: 3 }];
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
  const set = (key: 'scale' | 'x' | 'y' | 'blur') => (v: number) => setFrame((f) => ({ ...f, [key]: v }));
  const tile = tileOf(frame);
  const overflows =
    frame.x - frame.scale / 2 < -0.5 ||
    frame.y - frame.scale / 2 < -0.5 ||
    frame.x + frame.scale / 2 > 100.5 ||
    frame.y + frame.scale / 2 > 100.5;

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {l('cropPlace')}
        {screenName ? ` · ${screenName}` : ''}
        <Typography component="div" sx={{ fontSize: 12.5, color: 'text.secondary' }} noWrap>
          {source.name}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ alignItems: 'flex-start' }}>
          {/* ── The screen: what the audience sees, and how the picture is placed on it ── */}
          <Stack spacing={1.25} sx={{ flex: 3, minWidth: 0, width: '100%' }}>
            <MonitorFrame label={l('screen')} info={`${Math.round(frame.scale)} % · ${Math.round(frame.x)} / ${Math.round(frame.y)}`}>
              <Box
                sx={{
                  position: 'relative',
                  aspectRatio,
                  bgcolor: '#000',
                  touchAction: 'none',
                  overflow: 'hidden',
                  cursor: 'grab',
                  '&:active': { cursor: 'grabbing' },
                }}
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
                {/* Larger than the screen: where this screen sits in the whole picture. */}
                {overflows && (
                  <Box
                    sx={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      p: 0.5,
                      borderRadius: 0.75,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                    }}
                  >
                    <FrameMap frame={frame} width={112} height={63} />
                  </Box>
                )}
              </Box>
            </MonitorFrame>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: '4px !important' }}>
              {l('dragPlace')}
            </Typography>
            <InspectorRow label={l('fitLabel')} labelWidth={110}>
              <Segmented
                value={frame.fit}
                options={FITS.map((fit) => ({ value: fit, label: <span title={l(fit)}>{l(`${fit}Short`)}</span> }))}
                onChange={(fit) => setFrame((f) => ({ ...f, fit }))}
              />
            </InspectorRow>
            <InspectorRow label={l('wallTile')} labelWidth={110} align="start">
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {walls.map((wall) => {
                    const fits = wall === clipWall;
                    const current = tile?.cols === wall.cols && tile.rows === wall.rows;
                    return (
                      <Stack key={`${wall.cols}x${wall.rows}`} spacing={0.25} sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${wall.cols}, 1fr)`,
                            gap: '2px',
                            height: 40,
                            width: (40 * wall.cols * 16) / (wall.rows * 9),
                            p: '2px',
                            borderRadius: 0.75,
                            border: 1,
                            borderColor: current ? 'warning.main' : fits ? alpha(TRANSPORT_ACTIVE, 0.6) : 'divider',
                            borderStyle: fits && !current ? 'dashed' : 'solid',
                          }}
                        >
                          {Array.from({ length: wall.cols * wall.rows }, (_, i) => {
                            const at = { ...wall, col: i % wall.cols, row: Math.floor(i / wall.cols) };
                            const on = current && tile.col === at.col && tile.row === at.row;
                            const name = tileName(at, l);
                            return (
                              <ButtonBase
                                key={i}
                                title={name}
                                aria-label={name}
                                aria-pressed={on}
                                onClick={() => setFrame((f) => tileFrame(f, at))}
                                sx={{
                                  borderRadius: '2px',
                                  bgcolor: on ? 'warning.main' : 'action.selected',
                                  '&:hover': { bgcolor: on ? 'warning.main' : 'action.focus' },
                                }}
                              />
                            );
                          })}
                        </Box>
                        <Typography sx={{ fontSize: 10.5, color: fits ? 'warning.main' : 'text.secondary', whiteSpace: 'nowrap' }}>
                          {wall.cols}×{wall.rows}
                          {fits && ` · ${l('fitsClip')}`}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {l('wallHint')}
                </Typography>
              </Stack>
            </InspectorRow>
            <InspectorRow label={l('scale')} labelWidth={110}>
              <StepSlider
                label={l('scale')}
                value={frame.scale}
                min={20}
                max={300}
                marks={[100 / 3, 50, 100, 150, 200, 300]}
                unit=" %"
                onChange={set('scale')}
              />
            </InspectorRow>
            <InspectorRow label={l('x')} labelWidth={110}>
              <StepSlider label={l('x')} value={frame.x} min={-50} max={150} marks={[-50, 0, 50, 100, 150]} unit=" %" onChange={set('x')} />
            </InspectorRow>
            <InspectorRow label={l('y')} labelWidth={110}>
              <StepSlider label={l('y')} value={frame.y} min={-50} max={150} marks={[-50, 0, 50, 100, 150]} unit=" %" onChange={set('y')} />
            </InspectorRow>
          </Stack>

          {/* ── The source: which part of the file is used ── */}
          <Stack spacing={1.25} sx={{ flex: 2, minWidth: 0, width: '100%' }}>
            <MonitorFrame
              label={l('source')}
              info={[
                sourceSize && `${sourceSize.w}×${sourceSize.h} · ${ratioName(sourceSize.w, sourceSize.h)}`,
                isFullCrop(frame) ? l('wholePicture') : `${Math.round(frame.crop.w * 100)} × ${Math.round(frame.crop.h * 100)} %`,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <Box
                sx={{
                  position: 'relative',
                  aspectRatio: sourceRatio,
                  bgcolor: '#000',
                  touchAction: 'none',
                  userSelect: 'none',
                  overflow: 'hidden',
                }}
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
                      if (e.currentTarget.videoWidth) setSourceSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
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
                    onLoad={(e) =>
                      e.currentTarget.naturalWidth && setSourceSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
                    }
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
                    // Everything cropped away is dimmed, so the part that is used stands out.
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                    cursor: 'move',
                  }}
                >
                  {frame.crop.w > 0.12 &&
                    frame.crop.h > 0.12 &&
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
                          width: 16,
                          height: 16,
                          p: 0,
                          borderRadius: '2px',
                          bgcolor: '#fff',
                          border: '2px solid',
                          borderColor: 'warning.main',
                          cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                        }}
                      />
                    ))}
                </Box>
              </Box>
            </MonitorFrame>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: '4px !important' }}>
              {l('dragCrop')}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {(['x', 'y', 'w', 'h'] as const).map((key) => (
                <TextField
                  key={key}
                  label={`${key.toUpperCase()} %`}
                  type="number"
                  size="small"
                  value={Math.round(frame.crop[key] * 10000) / 100}
                  sx={{ width: 74 }}
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
              <Button
                size="small"
                color="inherit"
                disabled={isFullCrop(frame)}
                onClick={() => setFrame((f) => ({ ...f, crop: defaultFrame().crop }))}
                sx={{ textTransform: 'none' }}
              >
                {l('noCrop')}
              </Button>
            </Stack>
            <InspectorRow label={l('blur')} labelWidth={70}>
              <StepSlider label={l('blur')} value={frame.blur} min={0} max={30} marks={[0, 5, 10, 20, 30]} unit="" onChange={set('blur')} />
            </InspectorRow>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {/* Everything back to the whole picture; the fit has its own switch and stays. */}
        <Button
          startIcon={<RestartAlt />}
          color="inherit"
          onClick={() => setFrame((f) => ({ ...defaultFrame(), fit: f.fit }))}
          sx={{ mr: 'auto' }}
        >
          {l('reset')}
        </Button>
        <Button onClick={onClose}>{l('cancel')}</Button>
        <Button variant="contained" onClick={() => onApply(frame)}>
          {l('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
