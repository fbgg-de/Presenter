import { useEffect, useMemo, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Skeleton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  MusicNote,
  Repeat,
  Pause,
  PlayArrow,
  Stop,
  Edit,
  Delete,
  MoreHoriz,
  Undo,
  Refresh,
  Keyboard,
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  SkipPrevious,
  SkipNext,
  Logout,
  Add,
} from '@mui/icons-material';
import type { CueCommand, CuePacket, MediaCue, MediaCueBinding, MediaRegion, LyricOccurrence, RegionKind } from './types';
import { defaultFrame, mediaId, REGION_HIGHLIGHT, REGION_HIGHLIGHT_FILL, REGION_INK } from './types';
import { clamp, isEnabled, isLoop, milliseconds } from './engine';
import { useMediaLabels } from './labels';
import { useWaveform } from './useWaveform';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { CueSource } from './CueMedia';
import { Timecode, TransportButton, TransportCluster } from '@/components/media/Transport';

export const cueTime = (seconds: number) => {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
const icons = { section: <MusicNote fontSize="small" />, loop: <Repeat fontSize="small" />, pause: <Pause fontSize="small" /> };
const ink = REGION_INK;
const colors = { section: 'info', loop: 'secondary', pause: 'error' } as const;
type Props = {
  cue: MediaCue;
  binding: MediaCueBinding;
  packet?: CuePacket;
  occurrences: LyricOccurrence[];
  onChange: (cue: MediaCue, binding: MediaCueBinding) => void;
  /** Transport commands for the version being edited. */
  onCommand: (command: CueCommand) => void;
  /** Move the mapped song to a slide, when that song is the active item. */
  onLyricJump?: (blockIndex: number) => void;
};
export function CueTimeline({ cue, binding, packet, occurrences, onChange, onCommand, onLyricJump }: Props) {
  const l = useMediaLabels();
  const jump = (section: MediaRegion) => {
    const target = binding.lyrics[section.id];
    const index = target === 'clear' ? -1 : occurrences.find((o) => o.id === target)?.index;
    if (section.kind !== 'pause' && index !== undefined) onLyricJump?.(index);
    onCommand({ type: 'seek', time: section.start, navigate: true });
  };
  const [selected, setSelected] = useState<string>();
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState(0),
    [snap, setSnap] = useState(0.01),
    [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Partial<MediaRegion> & { start: number; end: number }>();
  const [mapping, setMapping] = useState(''),
    [custom, setCustom] = useState(false),
    [error, setError] = useState(false);
  const [menu, setMenu] = useState<{ left: number; top: number }>();
  const [working, setWorking] = useState<MediaRegion[]>();
  const [range, setRange] = useState<{ start: number; end: number }>();
  const [history, setHistory] = useState<{ cue: MediaCue; binding: MediaCueBinding }[]>([]);
  const [audition, setAudition] = useState<{ packet: CuePacket; end: number }>();
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<
      | {
          x: number;
          anchor: number;
          id?: string;
          edge?: 'start' | 'end';
          original?: MediaRegion;
          moved: boolean;
          range?: { start: number; end: number };
          regions: MediaRegion[];
        }
      | undefined
    >(undefined);
  const [width, setWidth] = useState(700);
  const time = packet?.transport.time ?? 0,
    transport = packet?.transport;
  const duration = Math.max(0.001, cue.duration),
    span = duration / zoom,
    view = Math.min(pan, Math.max(0, duration - span));
  const sections = working ?? cue.regions,
    current = sections.find((s) => s.id === selected);
  const waveformSource = cue.sources.find((s) => s.id === cue.waveformSourceId) ?? cue.sources.find((s) => s.type === 'video');
  const waveform = useWaveform(waveformSource?.type === 'video' ? resolveMediaUrl(waveformSource.path) : undefined);
  const amplitude = useMemo(() => Math.max(0.01, ...waveform.peaks), [waveform.peaks]);
  useEffect(() => {
    if (!board.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    observer.observe(board.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!audition) return;
    const timer = setTimeout(() => setAudition(undefined), Math.max(0, audition.end - audition.packet.transport.time) * 1000);
    return () => clearTimeout(timer);
  }, [audition]);
  useEffect(() => {
    setAudition(undefined);
  }, [cue.id, selected]);
  const position = (x: number) => clamp(view + ((x - (board.current?.getBoundingClientRect().left ?? 0)) / width) * span, 0, duration);
  const snapped = (t: number) => milliseconds(Math.round(t / snap) * snap);
  const commit = (next: MediaCue, nextBinding = binding) => {
    setHistory((h) => [...h.slice(-29), { cue, binding }]);
    onChange(next, nextBinding);
  };
  const open = (s: Partial<MediaRegion> & { start: number; end: number }) => {
    onCommand({ type: 'pause' });
    setDraft(
      s.kind === 'pause' ? { ...s, end: milliseconds(s.start + 0.001) } : { ...s, kind: s.kind ? 'section' : undefined, loop: isLoop(s) },
    );
    setMapping(s.id ? (binding.lyrics[s.id] ?? '') : '');
    setCustom(s.nameFromBlock === false);
    setError(false);
    setMenu(undefined);
    setAudition(undefined);
  };
  const state = (s: MediaRegion) =>
    s.id === transport?.pausedAt
      ? l('paused')
      : s.id === transport?.activeLoop
        ? l('active')
        : s.id === transport?.nextLoop
          ? l('next')
          : (transport ? isEnabled(s, transport) : s.enabled !== false)
            ? l('enabled')
            : l('off');
  const enabled = (s: MediaRegion) => (transport ? isEnabled(s, transport) : s.enabled !== false);
  const toggle = (s: MediaRegion) => onCommand({ type: 'enable', id: s.id, enabled: !enabled(s) });
  const auditionEdge = (s: { start: number; end: number }, edge: 'start' | 'end') => {
    if (!packet || !waveformSource || !Number.isFinite(s[edge])) return;
    const start = Math.max(0, s[edge] - (edge === 'start' ? 1 : 2)),
      end = Math.min(duration, s[edge] + (edge === 'start' ? 2 : 1));
    setAudition({
      end,
      packet: {
        ...packet,
        at: Date.now(),
        cue: { ...cue, regions: [] },
        transport: {
          ...packet.transport,
          time: start,
          playing: true,
          activeLoop: undefined,
          nextLoop: undefined,
          pausedAt: undefined,
          exitLoop: false,
          revision: Date.now(),
        },
      },
    });
  };
  const boundaryButtons = (s: { start: number; end: number; kind?: RegionKind }) => (
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      {(['start', 'end'] as const)
        .filter((edge) => s.kind !== 'pause' || edge === 'start')
        .map((edge) => (
          <Stack key={edge} direction="row" sx={{ alignItems: 'center' }}>
            <Typography variant="caption">{l(edge)}</Typography>
            <Tooltip title={l(edge === 'start' ? 'seekStart' : 'seekEnd')}>
              <IconButton
                aria-label={l(edge === 'start' ? 'seekStart' : 'seekEnd')}
                onClick={() => {
                  onCommand({ type: 'pause' });
                  onCommand({ type: 'seek', time: s[edge] });
                }}
              >
                {edge === 'start' ? <SkipPrevious /> : <SkipNext />}
              </IconButton>
            </Tooltip>
            <Tooltip title={l(edge === 'start' ? 'previewStart' : 'previewEnd')}>
              <span>
                <IconButton
                  aria-label={l(edge === 'start' ? 'previewStart' : 'previewEnd')}
                  disabled={!waveformSource || waveformSource.type !== 'video'}
                  onClick={() => auditionEdge(s, edge)}
                >
                  <PlayArrow />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ))}
    </Stack>
  );
  const layout = new Map<string, { x: number; w: number; y: number }>();
  let top = 120;
  const lanes: { y: number; kind: RegionKind }[] = [];
  for (const kind of ['section', 'pause'] as const) {
    lanes.push({ y: top - 21, kind });
    const ends: number[] = [];
    for (const s of sections
      .filter((s) => (kind === 'pause' ? s.kind === 'pause' : s.kind !== 'pause'))
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
      if (kind === 'pause' ? s.start < view || s.start > view + span : s.end <= view || s.start >= view + span) continue;
      const x =
        kind === 'pause' ? clamp(((s.start - view) / span) * width - 22, 0, width - 44) : Math.max(0, ((s.start - view) / span) * width);
      const w = kind === 'pause' ? 44 : Math.max(3, Math.min(width, ((s.end - view) / span) * width) - x);
      let row = ends.findIndex((end) => end <= x + 0.01);
      if (row < 0) row = ends.length;
      ends[row] = x + w;
      layout.set(s.id, { x, w, y: top + row * 40 });
    }
    top += Math.max(1, ends.length) * 40 + 22;
  }
  const finish = (cancel = false) => {
    const d = drag.current;
    if (!d) return;
    drag.current = undefined;
    setWorking(undefined);
    setRange(undefined);
    if (cancel || !d.moved) {
      if (!cancel && !d.id) onCommand({ type: 'seek', time: d.anchor });
      return;
    }
    if (d.id) commit({ ...cue, regions: d.regions });
    else if (d.range && d.range.end - d.range.start >= 0.001) {
      setDrawing(false);
      open(d.range);
    }
  };
  const auditionPreview = audition && waveformSource && (
    <Stack spacing={0.5}>
      <Typography variant="caption">{l('preview')}</Typography>
      <Box sx={{ position: 'relative', aspectRatio: '16 / 9', width: 220, maxWidth: '100%', bgcolor: '#000' }}>
        <CueSource
          packet={audition.packet}
          source={{ ...waveformSource, path: resolveMediaUrl(waveformSource.path) || waveformSource.path }}
          frame={defaultFrame()}
          audible
        />
      </Box>
      <IconButton aria-label={l('stop')} onClick={() => setAudition(undefined)}>
        <Stop />
      </IconButton>
    </Stack>
  );
  return (
    <Stack
      spacing={1}
      sx={{
        p: 1.5,
        '& .MuiButton-root': { textTransform: 'none', fontSize: 12 },
        // Transport buttons keep their own size.
        '& .MuiIconButton-root:not(.transport-button)': { borderRadius: 1, padding: '7px' },
        '& .MuiFormControlLabel-label': { fontSize: 12 },
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' && !(e.target as HTMLElement).closest('input, textarea, button, [role=dialog], [role=slider], [role=combobox]')) {
          e.preventDefault();
          onCommand({ type: 'toggle' });
        }
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <TransportCluster>
          <TransportButton primary label={l('play')} disabled={!packet} onClick={() => onCommand({ type: 'toggle' })}>
            {transport?.playing ? <Pause /> : <PlayArrow />}
          </TransportButton>
          <TransportButton label={l('stop')} onClick={() => onCommand({ type: 'stop' })}>
            <Stop />
          </TransportButton>
          <TransportButton
            label={l('exit')}
            disabled={!transport?.activeLoop}
            active={!!transport?.exitLoop}
            onClick={() => onCommand({ type: transport?.exitLoop ? 'cancel' : 'exit' })}
          >
            <Logout />
          </TransportButton>
        </TransportCluster>
        {transport?.pausedAt && (
          <Chip color="error" icon={<Pause />} label={`${l('paused')} · ${cue.regions.find((s) => s.id === transport.pausedAt)?.name}`} />
        )}
        <Stack direction="row" spacing={0.75} sx={{ ml: 'auto', alignItems: 'center' }}>
          <Timecode time={time} duration={duration} />
          <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>{cueTime(duration)}</Typography>
        </Stack>
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 1, px: 0.5 }}>
        <FormControlLabel
          control={<Checkbox size="small" checked={binding.followVideo} onChange={(_, v) => commit(cue, { ...binding, followVideo: v })} />}
          label={l('followVideo')}
        />
        <FormControlLabel
          control={<Checkbox checked={binding.followLyrics} onChange={(_, v) => commit(cue, { ...binding, followLyrics: v })} />}
          label={l('followLyrics')}
        />
      </Stack>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.25, p: 0.5, borderBottom: 1, borderColor: 'divider' }}>
          <Tooltip title={l('timelineKeys')}>
            <IconButton aria-label={l('timelineKeys')} onClick={() => board.current?.focus()}>
              <Keyboard fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={l('draw')}>
            <IconButton
              aria-label={l('draw')}
              aria-pressed={drawing}
              color={drawing ? 'primary' : 'default'}
              onClick={() => setDrawing((v) => !v)}
            >
              <Edit />
            </IconButton>
          </Tooltip>
          <Typography variant="caption">{l('drag')}</Typography>
          <Tooltip title={l('createRegion')}>
            <IconButton
              aria-label={l('createRegion')}
              onClick={() => open({ start: Math.min(time, duration - 0.001), end: Math.min(duration, time + 1) })}
            >
              <Add />
            </IconButton>
          </Tooltip>
          <Tooltip title={l('undo')}>
            <span>
              <IconButton
                aria-label={l('undo')}
                disabled={!history.length}
                onClick={() => {
                  const h = history.at(-1)!;
                  setHistory((v) => v.slice(0, -1));
                  onChange(h.cue, h.binding);
                }}
              >
                <Undo />
              </IconButton>
            </span>
          </Tooltip>
          <Select
            sx={{ ml: 'auto', fontSize: 12, height: 30, '& fieldset': { border: 0 } }}
            size="small"
            value={snap}
            inputProps={{ 'aria-label': l('snap') }}
            onChange={(e) => setSnap(Number(e.target.value))}
          >
            <MenuItem value={0.001}>1 ms</MenuItem>
            <MenuItem value={0.01}>10 ms</MenuItem>
            <MenuItem value={0.1}>100 ms</MenuItem>
          </Select>
          <IconButton aria-label={l('zoom')} onClick={() => setZoom((v) => Math.max(1, v / 2))}>
            <ZoomOut />
          </IconButton>
          <Typography variant="caption">{zoom}×</Typography>
          <IconButton
            aria-label={l('zoom')}
            onClick={() => {
              setZoom((v) => Math.min(128, v * 2));
              setPan(Math.max(0, time - span / 4));
            }}
          >
            <ZoomIn />
          </IconButton>
          <Tooltip title={l('fit')}>
            <span>
              <IconButton
                aria-label={l('fit')}
                disabled={!current}
                onClick={() => {
                  if (!current) return;
                  const z = Math.min(
                    128,
                    Math.max(1, 2 ** Math.floor(Math.log2(duration / Math.max(0.01, current.end - current.start) / 1.4))),
                  );
                  setZoom(z);
                  setPan(Math.max(0, current.start - (duration / z) * 0.15));
                }}
              >
                <CenterFocusStrong />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            px: 0.5,
            py: 0.5,
            bgcolor: 'action.hover',
            color: 'text.secondary',
            '& .MuiTypography-root': { fontSize: 10, fontVariantNumeric: 'tabular-nums' },
          }}
        >
          {Array.from({ length: width < 420 ? 3 : 5 }, (_, i) => (
            <Typography key={i} variant="caption">
              {cueTime(view + (span * i) / (width < 420 ? 2 : 4))}
            </Typography>
          ))}
        </Box>
        <Box
          ref={board}
          data-testid="media-cue-timeline"
          tabIndex={0}
          aria-label={l('waveform')}
          sx={{
            position: 'relative',
            height: top,
            overflow: 'hidden',
            touchAction: 'none',
            userSelect: 'none',
            bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#15191f' : '#f4f6fa'),
            cursor: drawing ? 'crosshair' : 'default',
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest('[data-menu-button]')) return;
            e.currentTarget.focus({ preventScroll: true });
            const region = (e.target as HTMLElement).closest<HTMLElement>('[data-region-id]');
            const s = !drawing && region ? sections.find((s) => s.id === region.dataset.regionId) : undefined;
            const anchor = snapped(position(e.clientX));
            drag.current = {
              x: e.clientX,
              anchor,
              id: s?.id,
              edge: (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined,
              original: s,
              moved: false,
              regions: cue.regions,
            };
            if (s) setSelected(s.id);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || (Math.abs(d.x - e.clientX) < 3 && !d.moved)) return;
            if (!d.moved) onCommand({ type: 'pause' });
            d.moved = true;
            const t = snapped(position(e.clientX));
            if (!d.original) {
              d.range = { start: Math.min(d.anchor, t), end: Math.max(d.anchor, t) };
              setRange(d.range);
              return;
            }
            const original = d.original;
            const s = { ...original };
            if (d.edge === 'start') s.start = clamp(t, 0, s.end - 0.001);
            else if (d.edge === 'end') s.end = clamp(t, s.start + 0.001, duration);
            else {
              s.start = clamp(milliseconds(original.start + t - d.anchor), 0, duration - (original.end - original.start));
              s.end = milliseconds(s.start + original.end - original.start);
            }
            d.regions = cue.regions.map((r) => (r.id === s.id ? s : r));
            setWorking(d.regions);
          }}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => {
            if (drag.current) finish(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') finish(true);
            if (e.defaultPrevented || (e.target as HTMLElement).closest('[data-edge]')) return;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            let target = time;
            if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = duration;
            else if (e.altKey) {
              const boundaries = [...new Set(cue.regions.flatMap((s) => (s.kind === 'pause' ? [s.start] : [s.start, s.end])))].sort(
                (a, b) => a - b,
              );
              target =
                e.key === 'ArrowRight'
                  ? (boundaries.find((t) => t > time + 0.0001) ?? duration)
                  : (boundaries.findLast((t) => t < time - 0.0001) ?? 0);
            } else target += (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : snap);
            target = clamp(milliseconds(target), 0, duration);
            onCommand({ type: 'seek', time: target });
            if (target < view || target > view + span) setPan(clamp(target - span / 2, 0, duration - span));
          }}
        >
          <svg
            width="100%"
            height="96"
            style={{ position: 'absolute', pointerEvents: 'none', color: '#83a5c8' }}
            aria-label={l('waveform')}
          >
            {Array.from({ length: Math.ceil(width / 3) }, (_, i) => {
              const t = view + ((i * 3) / width) * span + (waveformSource?.offset ?? 0);
              const nextT = t + (3 / width) * span;
              let peak = 0;
              const first = Math.max(0, Math.floor((t / waveform.duration) * waveform.peaks.length));
              const last = Math.min(waveform.peaks.length - 1, Math.ceil((nextT / waveform.duration) * waveform.peaks.length));
              for (let bin = first; bin <= last; bin++) peak = Math.max(peak, waveform.peaks[bin]);
              peak /= amplitude;
              return <rect key={i} x={i * 3} y={48 - peak * 42} width={2} height={Math.max(1, peak * 84)} fill="currentColor" />;
            })}
          </svg>
          {waveformSource && waveform.state === 'loading' && (
            <Box
              data-testid="waveform-loading"
              aria-label={l('loading')}
              sx={{
                position: 'absolute',
                inset: '0 0 auto 0',
                height: 96,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                px: 1,
                bgcolor: 'background.paper',
                pointerEvents: 'none',
              }}
            >
              {Array.from({ length: 50 }, (_, i) => (
                <Skeleton
                  key={i}
                  variant="rounded"
                  animation="wave"
                  sx={{ flex: 1, height: 18 + Math.abs(Math.sin(i * 1.7)) * 58, bgcolor: 'action.selected' }}
                />
              ))}
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={28} color="warning" aria-label={l('loading')} />
              </Box>
            </Box>
          )}
          {lanes.map((row) => (
            <Typography
              key={row.kind}
              variant="caption"
              sx={{ position: 'absolute', top: row.y, left: 6, color: 'text.secondary', fontSize: 10, pointerEvents: 'none' }}
            >
              {l(row.kind === 'section' ? 'sections' : row.kind)}
            </Typography>
          ))}
          {sections.map((s) => {
            const pos = layout.get(s.id);
            const visualKind = isLoop(s) ? 'loop' : s.kind;
            if (!pos) return null;
            return (
              <Box
                key={s.id}
                data-region-id={s.id}
                sx={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: pos.w,
                  height: 32,
                  border: selected === s.id ? 2 : 1,
                  borderColor: selected === s.id ? REGION_HIGHLIGHT : ink[visualKind],
                  borderStyle: (s.kind === 'pause' || isLoop(s)) && !enabled(s) ? 'dashed' : 'solid',
                  bgcolor: alpha(selected === s.id ? REGION_HIGHLIGHT_FILL : ink[visualKind], 0.18),
                  borderRadius: 1,
                  opacity: (s.kind === 'pause' || isLoop(s)) && !enabled(s) ? 0.55 : 1,
                  pointerEvents: drawing ? 'none' : 'auto',
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelected(s.id);
                  setMenu({ left: e.clientX, top: e.clientY });
                }}
              >
                <Tooltip title={`${s.name} · ${cueTime(s.start)}`}>
                  <Button
                    color={colors[visualKind]}
                    aria-label={`${s.name} · ${cueTime(s.start)}`}
                    sx={{
                      minWidth: 0,
                      width: '100%',
                      height: '100%',
                      px: 0.5,
                      gap: 0.5,
                      color: (theme) => (theme.palette.mode === 'dark' ? ink[visualKind] : theme.palette[colors[visualKind]].dark),
                      overflow: 'hidden',
                      justifyContent: s.kind === 'pause' ? 'center' : 'flex-start',
                    }}
                    onClick={() => setSelected(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                        e.preventDefault();
                        setSelected(s.id);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenu({ left: rect.left, top: rect.bottom });
                      }
                    }}
                  >
                    {icons[visualKind]}
                    {s.kind !== 'pause' && pos.w > 85 && (
                      <Typography variant="caption" noWrap>
                        {s.name}
                      </Typography>
                    )}
                  </Button>
                </Tooltip>
                {s.kind !== 'pause' &&
                  selected === s.id &&
                  pos.w > 44 &&
                  (['start', 'end'] as const).map((edge) => (
                    <Box
                      component="button"
                      key={edge}
                      data-edge={edge}
                      aria-label={l(edge)}
                      sx={{
                        position: 'absolute',
                        [edge === 'start' ? 'left' : 'right']: 0,
                        bottom: 0,
                        width: 10,
                        height: 30,
                        cursor: 'ew-resize',
                        color: 'text.primary',
                        bgcolor: REGION_HIGHLIGHT,
                        fontSize: 8,
                        padding: 0,
                        border: 0,
                        borderColor: 'divider',
                      }}
                      onKeyDown={(e) => {
                        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                        e.preventDefault();
                        const value = s[edge] + (e.key === 'ArrowLeft' ? -snap : snap);
                        commit({
                          ...cue,
                          regions: cue.regions.map((r) =>
                            r.id === s.id
                              ? {
                                  ...s,
                                  [edge]: clamp(value, edge === 'start' ? 0 : s.start + 0.001, edge === 'start' ? s.end - 0.001 : duration),
                                }
                              : r,
                          ),
                        });
                      }}
                    >
                      ↔
                    </Box>
                  ))}
              </Box>
            );
          })}
          {range && (
            <Box
              sx={{
                position: 'absolute',
                left: ((range.start - view) / span) * width,
                width: ((range.end - range.start) / span) * width,
                top: 0,
                bottom: 0,
                border: '2px dashed',
                borderColor: 'primary.main',
                bgcolor: 'action.selected',
                pointerEvents: 'none',
              }}
            />
          )}
          {time >= view && time <= view + span && (
            <Box
              sx={{
                position: 'absolute',
                left: ((time - view) / span) * width,
                top: 0,
                bottom: 0,
                borderLeft: '2px solid',
                borderColor: 'warning.main',
                pointerEvents: 'none',
              }}
            />
          )}
        </Box>
      </Box>
      <Stack direction="row" sx={{ gap: 2, px: 0.5 }}>
        {(['section', 'loop', 'pause'] as const).map((kind) => (
          <Stack
            key={kind}
            direction="row"
            sx={{ alignItems: 'center', gap: 0.5, color: 'text.secondary', '& svg': { color: ink[kind], fontSize: 14 } }}
          >
            {icons[kind]}
            <Typography sx={{ fontSize: 11 }}>{l(kind === 'section' ? 'sections' : kind)}</Typography>
          </Stack>
        ))}
        {waveformSource && (
          <Tooltip title={l('refreshWaveform')}>
            <span style={{ marginLeft: 'auto' }}>
              <IconButton size="small" aria-label={l('refreshWaveform')} disabled={waveform.state === 'loading'} onClick={waveform.retry}>
                <Refresh sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
      {waveformSource && waveform.state === 'unavailable' && (
        <Stack data-testid="waveform-error" direction="row" sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {l(waveform.reason ?? 'unavailable')}
          </Typography>
          {waveform.state === 'unavailable' && (
            <Button size="small" onClick={waveform.retry}>
              {l('retry')}
            </Button>
          )}
        </Stack>
      )}
      <Slider
        size="small"
        color="warning"
        sx={{ py: 1, '& .MuiSlider-thumb': { width: 10, height: 10 } }}
        aria-label={l('jump')}
        min={0}
        max={duration}
        step={snap}
        value={clamp(time, 0, duration)}
        onChange={(_, v) => onCommand({ type: 'seek', time: v as number })}
      />
      {zoom > 1 && (
        <Slider aria-label={l('pan')} min={0} max={duration - span} step={0.001} value={view} onChange={(_, v) => setPan(v as number)} />
      )}
      {current && (
        <>
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {current.name} · {cueTime(current.start)}
              {current.kind !== 'pause' ? `–${cueTime(current.end)}` : ''}
            </Typography>
            <IconButton
              aria-label={l('editRegion')}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu({ left: rect.left, top: rect.bottom });
              }}
            >
              <MoreHoriz />
            </IconButton>
          </Stack>
          {boundaryButtons(current)}
        </>
      )}
      {(['section', 'pause'] as const).map((kind) => {
        const regions = cue.regions.filter((s) => (kind === 'pause' ? s.kind === 'pause' : s.kind !== 'pause'));
        if (!regions.length) return null;
        return (
          <Stack key={kind} spacing={0.5}>
            <Typography variant="caption">{l(kind === 'pause' ? 'pause' : 'sections')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 0.75 }}>
              {regions.map((s) => {
                const k = isLoop(s) ? 'loop' : s.kind;
                return (
                  <Stack
                    key={s.id}
                    direction="row"
                    sx={{
                      alignItems: 'center',
                      border: 1,
                      borderColor: alpha(ink[k], 0.45),
                      borderRadius: 1.5,
                      bgcolor: alpha(ink[k], selected === s.id ? 0.16 : 0.05),
                      // Disarmed pauses and loops look as they do in the layer bar: dashed and dim.
                      ...(!enabled(s) ? { borderStyle: 'dashed', opacity: 0.6 } : {}),
                    }}
                  >
                    <Button
                      startIcon={icons[k]}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        justifyContent: 'flex-start',
                        color: (theme) => (theme.palette.mode === 'dark' ? ink[k] : theme.palette[colors[k]].dark),
                      }}
                      onClick={() => {
                        setSelected(s.id);
                        if (kind === 'pause') toggle(s);
                        else jump(s);
                      }}
                    >
                      <Stack sx={{ alignItems: 'flex-start', minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 12, maxWidth: '100%' }}>
                          {s.name}
                        </Typography>
                        <Typography variant="caption">{state(s)}</Typography>
                      </Stack>
                    </Button>
                    {isLoop(s) && (
                      <Tooltip
                        title={s.id === transport?.activeLoop ? l(transport.exitLoop ? 'keep' : 'exit') : l(enabled(s) ? 'disarm' : 'arm')}
                      >
                        <IconButton
                          size="small"
                          aria-label={
                            (s.id === transport?.activeLoop ? l(transport.exitLoop ? 'keep' : 'exit') : l(enabled(s) ? 'disarm' : 'arm')) +
                            ' · ' +
                            s.name
                          }
                          aria-pressed={enabled(s)}
                          sx={{ color: enabled(s) ? ink.loop : 'text.disabled' }}
                          onClick={() => {
                            setSelected(s.id);
                            if (s.id === transport?.activeLoop) onCommand({ type: transport.exitLoop ? 'cancel' : 'exit' });
                            else toggle(s);
                          }}
                        >
                          {s.id === transport?.activeLoop && !transport.exitLoop ? (
                            <Logout fontSize="small" />
                          ) : (
                            <Repeat fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    <IconButton
                      size="small"
                      aria-label={l('editRegion') + ' · ' + s.name}
                      onClick={(e) => {
                        setSelected(s.id);
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu({ left: r.left, top: r.bottom });
                      }}
                    >
                      <MoreHoriz fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Box>
          </Stack>
        );
      })}
      {!draft && auditionPreview}

      <Menu open={!!menu && !!current} onClose={() => setMenu(undefined)} anchorReference="anchorPosition" anchorPosition={menu}>
        <MenuItem onClick={() => current && open(current)}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          {l('editRegion')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (current) jump(current);
            setMenu(undefined);
          }}
        >
          {l('jump')}
        </MenuItem>
        {current && (
          <MenuItem
            onClick={() => {
              if (current) toggle(current);
              setMenu(undefined);
            }}
          >
            {l(current && enabled(current) ? 'disarm' : 'arm')}
          </MenuItem>
        )}
        {current &&
          isLoop(current) && [
            <MenuItem
              key="enter"
              onClick={() => {
                onCommand({ type: 'enter', id: current.id });
                setMenu(undefined);
              }}
            >
              {l('enter')}
            </MenuItem>,
            <MenuItem
              key="queue"
              disabled={!transport?.activeLoop || transport.activeLoop === current.id}
              onClick={() => {
                onCommand({ type: 'queue', id: current.id });
                setMenu(undefined);
              }}
            >
              {l('queue')}
            </MenuItem>,
            <MenuItem
              key="cancel"
              onClick={() => {
                onCommand({ type: 'cancel' });
                setMenu(undefined);
              }}
            >
              {l('cancel')}
            </MenuItem>,
          ]}
        <MenuItem
          onClick={() => {
            const lyrics = { ...binding.lyrics };
            if (selected) delete lyrics[selected];
            commit({ ...cue, regions: cue.regions.filter((s) => s.id !== selected) }, { ...binding, lyrics });
            setSelected(undefined);
            setMenu(undefined);
          }}
        >
          <Delete fontSize="small" sx={{ mr: 1 }} />
          {l('remove')}
        </MenuItem>
      </Menu>
      <Dialog
        open={!!draft}
        onClose={() => {
          setDraft(undefined);
          setAudition(undefined);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{l(draft?.id ? 'editRegion' : 'classify')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" sx={{ gap: 1 }}>
              {(['section', 'pause'] as const).map((kind) => (
                <Button
                  key={kind}
                  startIcon={icons[kind]}
                  variant={draft?.kind === kind ? 'contained' : 'outlined'}
                  onClick={() => setDraft((d) => d && { ...d, kind, end: kind === 'pause' ? milliseconds(d.start + 0.001) : d.end })}
                >
                  {l(kind === 'section' ? 'section' : kind)}
                </Button>
              ))}
            </Stack>
            {draft?.kind === 'section' && (
              <>
                <TextField
                  select
                  label={l('mapping')}
                  slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                  value={mapping}
                  onChange={(e) => {
                    setMapping(e.target.value);
                    if (!custom && e.target.value)
                      setDraft((d) => d && { ...d, name: occurrences.find((o) => o.id === e.target.value)?.name ?? l('clear') });
                  }}
                >
                  <MenuItem value="">{l('noMapping')}</MenuItem>
                  <MenuItem value="clear">{l('clear')}</MenuItem>
                  {occurrences.map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.name}
                    </MenuItem>
                  ))}
                </TextField>
                {!!mapping && (
                  <FormControlLabel control={<Checkbox checked={custom} onChange={(_, v) => setCustom(v)} />} label={l('custom')} />
                )}
                <FormControlLabel
                  control={<Checkbox checked={draft.loop === true} onChange={(_, loop) => setDraft((d) => d && { ...d, loop })} />}
                  label={
                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                      <Repeat fontSize="small" />
                      {l('loopSection')}
                    </Stack>
                  }
                />
              </>
            )}
            {draft?.kind && (draft.kind !== 'section' || !mapping || custom) && (
              <TextField
                label={l('name')}
                value={draft.name ?? ''}
                onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
              />
            )}
            {draft?.kind && (draft.kind === 'pause' || isLoop(draft)) && (
              <FormControlLabel
                control={<Checkbox checked={draft.enabled !== false} onChange={(_, v) => setDraft((d) => d && { ...d, enabled: v })} />}
                label={draft.kind === 'pause' ? l('pauseHint') : l('arm')}
              />
            )}
            {draft && (
              <Box component="details">
                <Box component="summary" sx={{ cursor: 'pointer' }}>
                  {l('exact')}
                </Box>
                <Stack direction="row" sx={{ gap: 1, mt: 1 }}>
                  <TextField
                    type="number"
                    label={l('start')}
                    value={draft.start}
                    slotProps={{ htmlInput: { step: 0.001, min: 0, max: duration } }}
                    onChange={(e) =>
                      setDraft(
                        (d) =>
                          d && {
                            ...d,
                            start: e.target.value === '' ? NaN : Number(e.target.value),
                            end: d.kind === 'pause' ? milliseconds(Number(e.target.value) + 0.001) : d.end,
                          },
                      )
                    }
                  />
                  {draft.kind !== 'pause' && (
                    <TextField
                      type="number"
                      label={l('end')}
                      value={draft.end}
                      slotProps={{ htmlInput: { step: 0.001, min: 0, max: duration } }}
                      onChange={(e) => setDraft((d) => d && { ...d, end: e.target.value === '' ? NaN : Number(e.target.value) })}
                    />
                  )}
                </Stack>
                {boundaryButtons(draft)}
              </Box>
            )}
            {auditionPreview}
            {error && <Alert severity="error">{l('invalid')}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDraft(undefined);
              setAudition(undefined);
            }}
          >
            {l('cancel')}
          </Button>
          <Button
            disabled={!draft?.kind}
            onClick={() => {
              if (
                !draft?.kind ||
                !Number.isFinite(draft.start) ||
                !Number.isFinite(draft.end) ||
                draft.start < 0 ||
                draft.end > duration ||
                draft.end - draft.start < 0.001 - 1e-7
              ) {
                setError(true);
                return;
              }
              const id = draft.id ?? mediaId(),
                name =
                  draft.kind === 'section' && mapping && !custom
                    ? (occurrences.find((o) => o.id === mapping)?.name ?? l('clear'))
                    : draft.name?.trim() || l(draft.kind === 'section' ? 'section' : draft.kind);
              const region: MediaRegion = {
                ...draft,
                id,
                kind: draft.kind,
                name,
                start: milliseconds(draft.start),
                end: milliseconds(draft.end),
                nameFromBlock: !!mapping && !custom,
                loop: draft.kind !== 'pause' && isLoop(draft),
              };
              const lyrics = { ...binding.lyrics };
              if (region.kind === 'section' && mapping) lyrics[id] = mapping;
              else delete lyrics[id];
              commit({ ...cue, regions: [...cue.regions.filter((s) => s.id !== id), region] }, { ...binding, lyrics });
              setSelected(id);
              setDraft(undefined);
              setAudition(undefined);
            }}
          >
            {l('save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
