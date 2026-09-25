/**
 * The stage overlay layers — countdowns, count-ups, messages and clocks on the stage screens.
 *
 * Built like the media inspector, an editing suite's viewer over its inspector: the layer list
 * on the left ending in "New layer", the picked layer on the right as a viewer (tally lamp, the
 * real `StageOverlay` at 16:9, transport, a running timer's quick correction) over three tabs of
 * folding inspector sections — Content, Where, Look. Red only for what is on screen.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  IconButton,
  InputBase,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Add as AddIcon,
  Check as CheckIcon,
  ContentCopy as DuplicateIcon,
  DriveFileRenameOutline as RenameIcon,
  Close as CloseIcon,
  DeleteOutlined as DeleteIcon,
  DragIndicator as DragIcon,
  FormatAlignCenter as AlignCenterIcon,
  FormatAlignLeft as AlignLeftIcon,
  FormatAlignRight as AlignRightIcon,
  HourglassEmpty as BlankIcon,
  Layers as EmptyLayerIcon,
  Message as MessageIcon,
  MoreVert as MoreIcon,
  PowerSettingsNew as EnableIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Schedule as ClockIcon,
  SkipNext as GoIcon,
  SkipPrevious as BackIcon,
  Stop as StopIcon,
  Timelapse as CountupIcon,
  Timer as CountdownIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { useGetSettings } from '@/store/settingsSlice';
import { stageBack, stageGo, stageSetCue, stageSetHidden, stageStart, stageStop, stageTogglePause } from '@/store/stageSlice';
import {
  useCreateStageLayerMutation,
  useDeleteStageLayerMutation,
  useGetStageLayersQuery,
  useUpdateStageLayerMutation,
  patchStageLayerCache,
  reorderStageLayersCache,
} from '@/api/stage.api';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { normaliseScreenGroupData } from '@/screens/types';
import { useStageStatus, type StageLayerStatus } from '@/hooks/useStageEngine';
import {
  STAGE_LAYER_PRESETS,
  newCue,
  resolveCue,
  stageLayerPreset,
  type StageAnchor,
  type StageCue,
  type StageCueKind,
  type StageLayerData,
  type StageLayerEntity,
  type StageLayerPreset,
  type StagePlacement,
} from '@/stage/types';
import { StageOverlay } from '@/presentation/StageOverlay';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import { SectionLabel } from '@/components/operator/SectionLabel';
import { InspectorRow, InspectorSection, Segmented, ViewerFrame, type LampState } from '@/components/media/Viewer';
import { TransportButton, TransportCluster, TransportDivider, PLAYHEAD } from '@/components/media/Transport';
import { StageCueEditor, cueKindLabel } from './StageCueEditor';
import { StageLiveValue } from './StageTransport';
import { TimerAdjustControls, TimerAdjustTrigger, isAdjustableTimer } from './TimerAdjust';
import { stillWhileClosed } from '@/components/common/stillWhileClosed';

const CUE_KINDS: Array<{ kind: StageCueKind; Icon: typeof ClockIcon }> = [
  { kind: 'clock', Icon: ClockIcon },
  { kind: 'countdown', Icon: CountdownIcon },
  { kind: 'countup', Icon: CountupIcon },
  { kind: 'message', Icon: MessageIcon },
  { kind: 'blank', Icon: BlankIcon },
];

const PRESET_ICONS: Record<StageLayerPreset, typeof ClockIcon> = {
  countdown: CountdownIcon,
  countup: CountupIcon,
  message: MessageIcon,
  clock: ClockIcon,
  empty: EmptyLayerIcon,
};

const ANCHORS: StageAnchor[] = [
  'top left',
  'top center',
  'top right',
  'center left',
  'center',
  'center right',
  'bottom left',
  'bottom center',
  'bottom right',
];

type EditorTab = 'content' | 'where' | 'look';

/** A slider in an inspector row, its value in monospace on the right. */
const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  format = (v) => `${v}%`,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) => (
  <InspectorRow label={label}>
    <Slider
      size="small"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(_e, v) => onChange(v as number)}
      sx={{ flex: 1, minWidth: 120 }}
    />
    <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', width: 44, textAlign: 'right' }}>
      {format(value)}
    </Typography>
  </InspectorRow>
);

const Swatch = ({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) => (
  <InspectorRow label={label}>
    <ColorSwatchButton value={value} onChange={onChange} ariaLabel={label} size={24} />
    <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>{value.toUpperCase()}</Typography>
  </InspectorRow>
);

/** The anchor for a point in the preview, by thirds — what a drag snaps to. */
const anchorAt = (fx: number, fy: number): StageAnchor => {
  const h = fx < 1 / 3 ? 'left' : fx > 2 / 3 ? 'right' : 'center';
  const v = fy < 1 / 3 ? 'top' : fy > 2 / 3 ? 'bottom' : 'center';
  if (v === 'center') return (h === 'center' ? 'center' : `center ${h}`) as StageAnchor;
  return `${v} ${h}` as StageAnchor;
};

const horizontalOf = (anchor: StageAnchor): 'left' | 'center' | 'right' => {
  const h = anchor.split(' ')[1];
  return h === 'left' || h === 'right' ? h : 'center';
};

type DragMode = 'move' | 'left' | 'right';

/**
 * The layer as it will actually look, at 16:9, over faint stand-in lyrics — the shipping
 * `StageOverlay`, so what looks right here cannot look wrong on the stage screen.
 *
 * With `onPlacement` it is also where the layer is placed, like transforming a clip in an editor's
 * viewer: drag the box (or click anywhere) to move it — it snaps to the nine positions, shown as
 * thirds while dragging — and drag its free side to change the width.
 */
const LayerPreview = ({
  layer,
  cueIndex,
  locale,
  onPlacement,
}: {
  layer: StageLayerEntity;
  cueIndex: number;
  locale: string;
  onPlacement?: (placement: StagePlacement) => void;
}) => {
  const { LL } = useI18nContext();
  const stored = layer.data.cues[cueIndex];
  // An empty message would preview as nothing, hiding exactly what is being placed.
  const cue = stored?.kind === 'message' && !stored.text.trim() ? { ...stored, text: String(LL.STAGE.MESSAGE_PREVIEW()) } : stored;
  const wire = cue ? resolveCue(cue, { cueIndex, startedAt: Date.now(), hidden: false }, locale) : null;
  const placement = layer.data.placement;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);

  // Where the overlay actually drew the layer box. The overlay sizes itself from its own measured
  // height, so the box can settle a frame later — measure now and once more after the next paint.
  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      const el = box?.querySelector('[data-stage-layer]');
      if (!box || !el) {
        setFrame((f) => (f ? null : f));
        return;
      }
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const next = { l: r.left - b.left, t: r.top - b.top, w: r.width, h: r.height };
      setFrame((f) =>
        f && Math.abs(f.l - next.l) + Math.abs(f.t - next.t) + Math.abs(f.w - next.w) + Math.abs(f.h - next.h) < 0.5 ? f : next,
      );
    };
    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  });

  const pointAt = (e: React.PointerEvent) => {
    const b = boxRef.current!.getBoundingClientRect();
    return {
      fx: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      fy: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    };
  };

  const apply = (mode: DragMode, e: React.PointerEvent) => {
    if (!onPlacement) return;
    const { fx, fy } = pointAt(e);
    if (mode === 'move') {
      const anchor = anchorAt(fx, fy);
      if (anchor !== placement.anchor) onPlacement({ ...placement, anchor });
      return;
    }
    // Width from the free side: symmetric around the centre, else measured from the anchored edge.
    const side = horizontalOf(placement.anchor);
    const raw =
      side === 'center'
        ? Math.abs(fx - 0.5) * 200
        : side === 'left'
          ? fx * 100 - placement.marginPct
          : (1 - fx) * 100 - placement.marginPct;
    const widthPct = Math.round(Math.min(100, Math.max(10, raw)));
    if (widthPct !== placement.widthPct) onPlacement({ ...placement, widthPct });
  };

  const start = (mode: DragMode) => (e: React.PointerEvent) => {
    if (!onPlacement || e.button !== 0) return;
    e.stopPropagation();
    try {
      boxRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // No capture (a synthetic pointer) — moves over the preview still work.
    }
    setDrag(mode);
    apply(mode, e);
  };

  const anchoredSide = horizontalOf(placement.anchor);
  const handle = (side: 'left' | 'right') => (
    <Box
      onPointerDown={start(side)}
      sx={{
        position: 'absolute',
        top: '50%',
        [side]: -5,
        width: 8,
        height: 22,
        transform: 'translateY(-50%)',
        borderRadius: 0.5,
        bgcolor: 'primary.main',
        cursor: 'ew-resize',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
      }}
    />
  );

  return (
    <Box
      ref={boxRef}
      // A tooltip rather than text on the picture, which would sit on top of a layer placed low.
      title={onPlacement && !drag ? String(LL.STAGE.DRAG_HINT()) : undefined}
      onPointerDown={start('move')}
      onPointerMove={(e) => drag && apply(drag, e)}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        bgcolor: '#000',
        overflow: 'hidden',
        cursor: onPlacement ? (drag === 'move' ? 'grabbing' : 'crosshair') : 'default',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: '3%' }}>
        {[62, 48, 55].map((width, index) => (
          <Box key={index} sx={{ width: `${width}%`, height: '5%', borderRadius: 1, bgcolor: 'rgba(255,255,255,0.08)' }} />
        ))}
      </Stack>
      {wire && <StageOverlay payload={{ layers: [{ id: layer.id, placement, style: layer.data.style, cue: wire }] }} />}

      {/* The thirds a move snaps to — only while moving, like an editor's guides. */}
      {drag === 'move' &&
        [1, 2].map((n) => (
          <Box key={n}>
            <Box
              sx={{ position: 'absolute', top: 0, bottom: 0, left: `${(n * 100) / 3}%`, borderLeft: '1px dashed rgba(255,214,0,0.5)' }}
            />
            <Box sx={{ position: 'absolute', left: 0, right: 0, top: `${(n * 100) / 3}%`, borderTop: '1px dashed rgba(255,214,0,0.5)' }} />
          </Box>
        ))}

      {onPlacement && frame && (
        <Box
          onPointerDown={start('move')}
          sx={{
            position: 'absolute',
            left: frame.l,
            top: frame.t,
            width: frame.w,
            height: frame.h,
            border: '1px solid',
            borderColor: 'primary.main',
            borderStyle: drag ? 'solid' : 'dashed',
            cursor: drag === 'move' ? 'grabbing' : 'grab',
            zIndex: 600,
          }}
        >
          {anchoredSide !== 'right' && handle('right')}
          {anchoredSide !== 'left' && handle('left')}
        </Box>
      )}
    </Box>
  );
};

/** What a cue amounts to, on the right of its row: "25:00", "→ 10:00", the message text. */
const cueSummary = (cue: StageCue): string => {
  switch (cue.kind) {
    case 'countdown':
      if (cue.source === 'timeOfDay') return `→ ${cue.atTime ?? ''}`;
      return `${Math.floor((cue.durationSec ?? 0) / 60)}:${String((cue.durationSec ?? 0) % 60).padStart(2, '0')}`;
    case 'message':
      return cue.text;
    default:
      return '';
  }
};

const CueRow = ({
  cue,
  index,
  onScreen,
  editing,
  onSelect,
  onDelete,
  onDragStart,
  onDrop,
}: {
  cue: StageCue;
  index: number;
  /** The cue the layer is showing. */
  onScreen: boolean;
  /** The cue open in the editor below. */
  editing: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) => {
  const { LL } = useI18nContext();
  const Icon = CUE_KINDS.find((k) => k.kind === cue.kind)?.Icon ?? ClockIcon;

  return (
    <Stack
      direction="row"
      spacing={0.75}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={onSelect}
      sx={(theme) => ({
        alignItems: 'center',
        pl: 0.5,
        pr: 0.25,
        height: 32,
        cursor: 'pointer',
        borderRadius: 0.75,
        borderLeft: '3px solid',
        borderLeftColor: onScreen ? PLAYHEAD : 'transparent',
        bgcolor: editing ? alpha(theme.palette.text.primary, 0.08) : 'transparent',
        '&:hover': { bgcolor: alpha(theme.palette.text.primary, editing ? 0.1 : 0.05) },
        '&:hover .cue-delete': { opacity: 1 },
      })}
    >
      <DragIcon sx={{ fontSize: 15, color: 'text.disabled', cursor: 'grab' }} />
      <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.disabled', width: 16 }}>{index + 1}</Typography>
      <Icon sx={{ fontSize: 16, color: onScreen ? PLAYHEAD : 'text.secondary' }} />
      <Typography variant="body2" noWrap sx={{ fontWeight: editing ? 600 : 500, flexShrink: 0, maxWidth: '45%' }}>
        {cue.name || cueKindLabel(cue.kind, LL)}
      </Typography>
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'monospace', color: 'text.secondary', textAlign: 'right' }}>
        {cueSummary(cue)}
      </Typography>
      <IconButton
        size="small"
        className="cue-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        sx={{ opacity: editing ? 1 : 0, p: 0.5 }}
      >
        <DeleteIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Stack>
  );
};

/**
 * The layer's name in the viewer header, renamed in place: click it (or Rename in the layer's
 * menu), Enter or leaving the field keeps it, Escape drops it. The draft lives in the panel so the
 * menu can start it.
 */
const InlineName = ({
  value,
  draft,
  onDraft,
  onCommit,
  hint,
}: {
  value: string;
  draft: string | null;
  onDraft: (draft: string | null) => void;
  onCommit: (name: string) => void;
  hint: string;
}) => {
  if (draft === null) {
    return (
      <Tooltip title={hint}>
        <Typography
          noWrap
          onClick={() => onDraft(value)}
          sx={{ fontSize: 13, fontWeight: 600, minWidth: 0, cursor: 'text', '&:hover': { textDecoration: 'underline dotted' } }}
        >
          {value}
        </Typography>
      </Tooltip>
    );
  }
  const commit = () => {
    const name = draft.trim();
    if (name && name !== value) onCommit(name);
    onDraft(null);
  };
  return (
    <InputBase
      autoFocus
      value={draft}
      onChange={(e) => onDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDraft(null);
      }}
      onFocus={(e) => e.target.select()}
      sx={{
        fontSize: 13,
        fontWeight: 600,
        color: 'inherit',
        minWidth: 0,
        flex: '0 1 220px',
        px: 0.5,
        borderRadius: 0.5,
        bgcolor: 'rgba(255,255,255,0.08)',
        '& input': { p: '1px 0' },
      }}
    />
  );
};

/** The tally lamp a layer shows in its viewer. */
const lampOf = (status: StageLayerStatus | undefined): LampState => {
  if (!status?.started) return 'off';
  if (status.finished) return 'stopped';
  if (status.hidden) return 'cleared';
  if (status.paused) return 'paused';
  return 'live';
};

const StagePanelBody = ({ open, onClose, layerId }: { open: boolean; onClose: () => void; layerId?: number | null }) => {
  const { LL } = useI18nContext();
  const S = LL.STAGE;
  const dispatch = useAppDispatch();
  const { uiLanguage } = useGetSettings('uiLanguage');
  const locale = uiLanguage || 'en';

  const { data: layers = [] } = useGetStageLayersQuery();
  const [createLayer] = useCreateStageLayerMutation();
  const [saveLayer] = useUpdateStageLayerMutation();

  /**
   * Every edit shows at once (cache) and is saved once it settles: a slider drag or a typed name
   * is one save, not one per pixel or keystroke. Pending edits of a layer are merged, and any
   * still waiting are saved when the drawer closes.
   */
  const pendingSaves = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; patch: Partial<StageLayerEntity> }>());
  const flushSave = useCallback(
    (id: number) => {
      const entry = pendingSaves.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pendingSaves.current.delete(id);
      void saveLayer({ id, ...entry.patch });
    },
    [saveLayer],
  );
  const updateLayer = useCallback(
    ({ id, ...patch }: { id: number } & Partial<StageLayerEntity>) => {
      dispatch(patchStageLayerCache(id, patch));
      const previous = pendingSaves.current.get(id);
      if (previous) clearTimeout(previous.timer);
      pendingSaves.current.set(id, { patch: { ...previous?.patch, ...patch }, timer: setTimeout(() => flushSave(id), 400) });
    },
    [dispatch, flushSave],
  );
  useEffect(() => {
    const pending = pendingSaves.current;
    if (!open) pending.forEach((_entry, id) => flushSave(id));
    return () => pending.forEach((_entry, id) => flushSave(id));
  }, [open, flushSave]);
  const [deleteLayer] = useDeleteStageLayerMutation();
  const { statuses } = useStageStatus();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<EditorTab>('content');
  const [newAnchor, setNewAnchor] = useState<HTMLElement | null>(null);
  const [addCueAnchor, setAddCueAnchor] = useState<HTMLElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StageLayerEntity | null>(null);
  const [editingCueIndex, setEditingCueIndex] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [layerDragFrom, setLayerDragFrom] = useState<number | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; layer: StageLayerEntity } | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const selected = layers.find((l) => l.id === selectedId);
  const status = statuses.find((s) => s.layer.id === selectedId);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    setEditingCueIndex(0);
  }, []);

  // Opened from a layer in the layer bar: that layer. Otherwise whatever is there, so the right
  // side is never empty while layers exist.
  useEffect(() => {
    if (!open) return;
    if (layerId != null && layers.some((l) => l.id === layerId)) select(layerId);
    else if (selectedId === null && layers.length > 0) select(layers[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layerId, layers.length]);

  const { data: screenGroups = [] } = useGetScreenGroupsQuery();
  /** The groups a layer can be shown on: enabled, and not switched to hide overlays. */
  const overlayGroups = useMemo(
    () => screenGroups.filter((g) => g.enabled && normaliseScreenGroupData(g.data).layers.overlays),
    [screenGroups],
  );

  /** Where a layer is actually going to appear — the thing people forget. */
  const shownOnFor = useCallback(
    (layer: StageLayerEntity) => overlayGroups.filter((g) => layer.data.screenGroupIds?.includes(g.id)).map((g) => g.name),
    [overlayGroups],
  );

  const toggleGroup = useCallback(
    (layer: StageLayerEntity, groupId: number) => {
      const current = layer.data.screenGroupIds ?? [];
      const screenGroupIds = current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId];
      void updateLayer({ id: layer.id, data: { ...layer.data, screenGroupIds } });
    },
    [updateLayer],
  );

  const patchData = useCallback(
    (layer: StageLayerEntity, patch: Partial<StageLayerData>) => {
      void updateLayer({ id: layer.id, data: { ...layer.data, ...patch } });
    },
    [updateLayer],
  );

  const patchCue = useCallback(
    (layer: StageLayerEntity, index: number, patch: Partial<StageCue>) => {
      const cues = layer.data.cues.map((c, i) => (i === index ? ({ ...c, ...patch } as StageCue) : c));
      patchData(layer, { cues });
    },
    [patchData],
  );

  const addCue = useCallback(
    (layer: StageLayerEntity, kind: StageCueKind) => {
      const cues = [...layer.data.cues, newCue(kind)];
      patchData(layer, { cues });
      setEditingCueIndex(cues.length - 1);
      setAddCueAnchor(null);
    },
    [patchData],
  );

  const presetLabel = (preset: StageLayerPreset) => (preset === 'empty' ? S.PRESET_EMPTY() : cueKindLabel(preset, LL));
  const presetHint = (preset: StageLayerPreset) => {
    switch (preset) {
      case 'countdown':
        return S.PRESET_COUNTDOWN_HINT();
      case 'countup':
        return S.PRESET_COUNTUP_HINT();
      case 'message':
        return S.PRESET_MESSAGE_HINT();
      case 'clock':
        return S.PRESET_CLOCK_HINT();
      case 'empty':
        return S.PRESET_EMPTY_HINT();
    }
  };

  /** Names are unique per account in the database: number a second "Countdown". */
  const uniqueName = useCallback(
    (base: string) => {
      const taken = new Set(layers.map((l) => l.name));
      let name = base;
      for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
      return name;
    },
    [layers],
  );

  /** A second layer with the same look and cues — "Sermon" → "Sermon copy", right below it. */
  const duplicateLayer = useCallback(
    async (layer: StageLayerEntity) => {
      const created = await createLayer({
        name: uniqueName(`${layer.name} ${S.COPY_SUFFIX()}`),
        enabled: layer.enabled,
        data: structuredClone(layer.data),
        sort_order: layers.length,
      }).unwrap();
      if (created?.id) select(created.id);
    },
    [createLayer, uniqueName, S, layers.length, select],
  );

  /** Drop a dragged layer onto another: it takes that place, the rest move up or down. */
  const moveLayer = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const ids = layers.map((l) => l.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      dispatch(reorderStageLayersCache(ids));
      ids.forEach((id, index) => {
        if (layers.find((l) => l.id === id)?.sort_order !== index) void saveLayer({ id, sort_order: index });
      });
    },
    [layers, dispatch, saveLayer],
  );

  const handleCreate = useCallback(
    async (preset: StageLayerPreset) => {
      setNewAnchor(null);
      const name = uniqueName(preset === 'empty' ? String(LL.STAGE.NEW_LAYER_NAME()) : cueKindLabel(preset, LL));
      // A new layer starts on every Stage group, so it shows up where stage content is expected.
      const screenGroupIds = overlayGroups.filter((g) => normaliseScreenGroupData(g.data).kind === 'stage').map((g) => g.id);
      const created = await createLayer({
        name,
        data: { ...stageLayerPreset(preset), screenGroupIds },
        sort_order: layers.length,
      }).unwrap();
      if (created?.id) {
        select(created.id);
        setTab('content');
      }
    },
    [createLayer, layers, LL, overlayGroups, select, uniqueName],
  );

  const style = selected?.data.style;
  const setStyle = (patch: Partial<StageLayerData['style']>) =>
    selected && patchData(selected, { style: { ...selected.data.style, ...patch } });
  const running = !!status?.started && !status.finished;
  const timerCue = status?.cue?.kind === 'countdown' || status?.cue?.kind === 'countup';
  const at = () => Date.now();

  /** The presets as big choices — the empty state, so the first step is obvious. */
  const presetCards = (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 1, width: '100%', maxWidth: 640 }}>
      {STAGE_LAYER_PRESETS.map((preset) => {
        const Icon = PRESET_ICONS[preset];
        return (
          <ButtonBase
            key={preset}
            onClick={() => void handleCreate(preset)}
            sx={{
              p: 1.5,
              gap: 1.25,
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              textAlign: 'left',
              borderRadius: 1,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'rgba(255,255,255,0.02)',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Icon sx={{ color: 'text.secondary', mt: 0.25 }} />
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {presetLabel(preset)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {presetHint(preset)}
              </Typography>
            </Stack>
          </ButtonBase>
        );
      })}
    </Box>
  );

  return (
    <Drawer open={open} anchor="right" onClose={onClose}>
      <Stack sx={{ width: 'min(96vw, 940px)', height: '100%' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            {S.PANEL_TITLE()}
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
          {/* Layers, ending in "New layer" — like the agenda's groups end in "Add group". */}
          <Stack sx={{ width: 240, minWidth: 200, borderRight: 1, borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.12)' }}>
            <SectionLabel sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>{S.LAYERS()}</SectionLabel>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {layers.map((layer, layerIndex) => {
                const st = statuses.find((s) => s.layer.id === layer.id);
                const shownOn = shownOnFor(layer);
                const nowhere = shownOn.length === 0;
                const isSelected = selectedId === layer.id;
                const live = lampOf(st) === 'live';
                return (
                  <Stack
                    key={layer.id}
                    onClick={() => select(layer.id)}
                    draggable
                    onDragStart={() => setLayerDragFrom(layerIndex)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (layerDragFrom !== null) moveLayer(layerDragFrom, layerIndex);
                      setLayerDragFrom(null);
                    }}
                    sx={(theme) => ({
                      pl: 1.5,
                      pr: 0.5,
                      py: 0.75,
                      cursor: 'pointer',
                      '& .layer-menu': { opacity: isSelected ? 1 : 0 },
                      '&:hover .layer-menu': { opacity: 1 },
                      borderLeft: '3px solid',
                      borderLeftColor: isSelected ? 'primary.main' : 'transparent',
                      bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                      '&:hover': { bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.14) : 'action.hover' },
                      opacity: layer.enabled ? 1 : 0.5,
                    })}
                  >
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          flexShrink: 0,
                          bgcolor: live ? PLAYHEAD : 'rgba(255,255,255,0.18)',
                          boxShadow: live ? `0 0 5px ${PLAYHEAD}` : 'none',
                        }}
                      />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                        {layer.name}
                      </Typography>
                      {st?.cue && st.started && !st.finished && <StageLiveValue status={st} fontSize="0.75rem" />}
                      <IconButton
                        size="small"
                        className="layer-menu"
                        aria-label={S.LAYER_MENU()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowMenu({ anchor: e.currentTarget, layer });
                        }}
                        sx={{ p: 0.25 }}
                      >
                        <MoreIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                    <Typography variant="caption" noWrap sx={{ pl: 1.75, color: nowhere ? 'warning.main' : 'text.secondary' }}>
                      {nowhere ? S.ASSIGNED_TO_NONE() : shownOn.join(' · ')}
                    </Typography>
                  </Stack>
                );
              })}
            </Box>
            <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
              <Button
                size="small"
                color="inherit"
                startIcon={<AddIcon />}
                onClick={(e) => setNewAnchor(e.currentTarget)}
                sx={{ textTransform: 'none', color: 'text.secondary', width: '100%', justifyContent: 'flex-start' }}
              >
                {S.ADD_LAYER()}
              </Button>
            </Box>
          </Stack>

          {/* Selected layer */}
          {selected && style ? (
            <Stack sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              <Stack sx={{ p: 2, pb: 1, gap: 1.25 }}>
                {/* The viewer: lamp, what the layer shows now, the real overlay, and its transport. */}
                <ViewerFrame
                  lamp={lampOf(status)}
                  title={
                    <InlineName
                      value={selected.name}
                      draft={nameDraft}
                      onDraft={setNameDraft}
                      onCommit={(name) => updateLayer({ id: selected.id, name })}
                      hint={S.RENAME_LAYER()}
                    />
                  }
                  subtitle={
                    running && status
                      ? S.CUE_OF({ index: status.cueIndex + 1, total: status.cueCount })
                      : status?.finished
                        ? S.FINISHED()
                        : S.NOT_RUNNING()
                  }
                  headerRight={
                    <>
                      {!selected.enabled && (
                        <Chip
                          size="small"
                          label={S.DISABLED()}
                          sx={{ height: 20, fontSize: 11 }}
                          onClick={() => updateLayer({ id: selected.id, enabled: true })}
                        />
                      )}
                      {running && status?.cue && (
                        <TimerAdjustTrigger status={status}>
                          <StageLiveValue status={status} fontSize="1.05rem" />
                        </TimerAdjustTrigger>
                      )}
                    </>
                  }
                  transport={
                    <>
                      <TransportCluster>
                        {running ? (
                          <>
                            <TransportButton label={S.BACK()} onClick={() => dispatch(stageBack({ layerId: selected.id, at: at() }))}>
                              <BackIcon />
                            </TransportButton>
                            {timerCue && (
                              <TransportButton
                                label={status?.paused ? S.RESUME() : S.PAUSE()}
                                active={status?.paused}
                                onClick={() => dispatch(stageTogglePause({ layerId: selected.id, at: at() }))}
                              >
                                {status?.paused ? <PlayIcon /> : <PauseIcon />}
                              </TransportButton>
                            )}
                            <TransportButton
                              primary
                              label={S.GO()}
                              onClick={() => dispatch(stageGo({ layerId: selected.id, cueCount: selected.data.cues.length, at: at() }))}
                            >
                              <GoIcon />
                            </TransportButton>
                            <TransportButton
                              danger
                              label={S.STOP()}
                              onClick={() => dispatch(stageStop({ layerId: selected.id, cueCount: selected.data.cues.length, at: at() }))}
                            >
                              <StopIcon />
                            </TransportButton>
                            <TransportDivider />
                            <TransportButton
                              label={status?.hidden ? S.SHOW() : S.HIDE()}
                              active={status?.hidden}
                              onClick={() => dispatch(stageSetHidden({ layerId: selected.id, hidden: !status?.hidden, at: at() }))}
                            >
                              {status?.hidden ? <HideIcon /> : <ShowIcon />}
                            </TransportButton>
                          </>
                        ) : (
                          <TransportButton
                            primary
                            label={S.START()}
                            disabled={selected.data.cues.length === 0}
                            onClick={() => dispatch(stageStart({ layerId: selected.id, at: at() }))}
                          >
                            <PlayIcon />
                          </TransportButton>
                        )}
                      </TransportCluster>
                      {/* Something unplanned: correct the running timer right here. */}
                      {status && isAdjustableTimer(status) && <TimerAdjustControls status={status} dense />}
                    </>
                  }
                >
                  <LayerPreview
                    layer={selected}
                    cueIndex={editingCueIndex}
                    locale={locale}
                    onPlacement={(placement) => patchData(selected, { placement })}
                  />
                </ViewerFrame>
              </Stack>

              <Tabs
                value={tab}
                onChange={(_e, v: EditorTab) => setTab(v)}
                sx={{ px: 2, minHeight: 36, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab value="content" label={S.TAB_CONTENT()} sx={{ minHeight: 36, textTransform: 'none' }} />
                <Tab value="where" label={S.TAB_WHERE()} sx={{ minHeight: 36, textTransform: 'none' }} />
                <Tab value="look" label={S.TAB_LOOK()} sx={{ minHeight: 36, textTransform: 'none' }} />
              </Tabs>

              <Box sx={{ pb: 2 }}>
                {tab === 'content' && (
                  <>
                    <InspectorSection id="stage-cues" title={S.CUES()} summary={String(selected.data.cues.length)}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {S.CUES_HINT()}
                      </Typography>
                      {selected.data.cues.length === 0 ? (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {S.NO_CUES()}
                        </Typography>
                      ) : (
                        <Stack spacing={0.25}>
                          {selected.data.cues.map((cue, index) => (
                            <CueRow
                              key={cue.id}
                              cue={cue}
                              index={index}
                              onScreen={running && status?.cueIndex === index && !status.hidden}
                              editing={editingCueIndex === index}
                              onSelect={() => {
                                setEditingCueIndex(index);
                                // A running layer follows the cue being edited, so the editor never
                                // previews something else than the screen shows. A layer that is not
                                // running stays off the screens — editing is not going live.
                                if (running) dispatch(stageSetCue({ layerId: selected.id, cueIndex: index, at: Date.now() }));
                              }}
                              onDelete={() => patchData(selected, { cues: selected.data.cues.filter((_c, i) => i !== index) })}
                              onDragStart={() => setDragFrom(index)}
                              onDrop={() => {
                                if (dragFrom === null || dragFrom === index) return;
                                const cues = [...selected.data.cues];
                                const [moved] = cues.splice(dragFrom, 1);
                                cues.splice(index, 0, moved);
                                patchData(selected, { cues });
                                setDragFrom(null);
                              }}
                            />
                          ))}
                        </Stack>
                      )}
                      <Button
                        size="small"
                        color="inherit"
                        startIcon={<AddIcon />}
                        onClick={(e) => setAddCueAnchor(e.currentTarget)}
                        sx={{ textTransform: 'none', color: 'text.secondary', alignSelf: 'flex-start' }}
                      >
                        {S.ADD_CUE()}
                      </Button>
                    </InspectorSection>
                    {selected.data.cues[editingCueIndex] && (
                      <InspectorSection
                        id="stage-cue"
                        title={`${S.CUE()} ${editingCueIndex + 1} · ${cueKindLabel(selected.data.cues[editingCueIndex].kind, LL)}`}
                      >
                        <StageCueEditor
                          cue={selected.data.cues[editingCueIndex]}
                          onChange={(patch) => patchCue(selected, editingCueIndex, patch)}
                        />
                      </InspectorSection>
                    )}
                  </>
                )}

                {tab === 'where' && (
                  <>
                    <InspectorSection
                      id="stage-show-on"
                      title={S.SHOW_ON()}
                      summary={shownOnFor(selected).join(' · ') || S.ASSIGNED_TO_NONE()}
                    >
                      {overlayGroups.length === 0 ? (
                        <Typography variant="body2" sx={{ color: 'warning.main' }}>
                          {S.SHOW_ON_NO_GROUPS()}
                        </Typography>
                      ) : (
                        <>
                          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                            {overlayGroups.map((group) => {
                              const on = !!selected.data.screenGroupIds?.includes(group.id);
                              return (
                                <Chip
                                  key={group.id}
                                  size="small"
                                  label={group.name}
                                  icon={on ? <CheckIcon /> : undefined}
                                  color={on ? 'primary' : 'default'}
                                  variant={on ? 'filled' : 'outlined'}
                                  onClick={() => toggleGroup(selected, group.id)}
                                />
                              );
                            })}
                          </Stack>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {S.SHOW_ON_HINT()}
                          </Typography>
                        </>
                      )}
                    </InspectorSection>
                    <InspectorSection id="stage-placement" title={S.PLACEMENT()} summary={selected.data.placement.anchor}>
                      <InspectorRow label={S.POSITION()} align="start">
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gap: 0.5 }}>
                          {ANCHORS.map((anchor) => {
                            const on = selected.data.placement.anchor === anchor;
                            return (
                              <Tooltip key={anchor} title={anchor}>
                                <ButtonBase
                                  aria-pressed={on}
                                  onClick={() => patchData(selected, { placement: { ...selected.data.placement, anchor } })}
                                  sx={(theme) => ({
                                    height: 24,
                                    borderRadius: 0.5,
                                    border: 1,
                                    borderColor: on ? 'primary.main' : 'divider',
                                    bgcolor: on ? alpha(theme.palette.primary.main, 0.2) : 'transparent',
                                  })}
                                >
                                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: on ? 'primary.main' : 'text.disabled' }} />
                                </ButtonBase>
                              </Tooltip>
                            );
                          })}
                        </Box>
                      </InspectorRow>
                      <SliderRow
                        label={S.WIDTH()}
                        value={selected.data.placement.widthPct}
                        min={10}
                        max={100}
                        onChange={(widthPct) => patchData(selected, { placement: { ...selected.data.placement, widthPct } })}
                      />
                      <SliderRow
                        label={S.MARGIN()}
                        value={selected.data.placement.marginPct}
                        min={0}
                        max={30}
                        onChange={(marginPct) => patchData(selected, { placement: { ...selected.data.placement, marginPct } })}
                      />
                    </InspectorSection>
                  </>
                )}

                {tab === 'look' && (
                  <>
                    <InspectorSection id="stage-text" title={S.TEXT()} summary={`${style.fontSizePct}%`}>
                      <SliderRow
                        label={S.FONT_SIZE()}
                        value={style.fontSizePct}
                        min={2}
                        max={40}
                        onChange={(fontSizePct) => setStyle({ fontSizePct })}
                      />
                      <InspectorRow label={S.ALIGN()}>
                        <Segmented
                          value={style.textAlign ?? 'center'}
                          onChange={(textAlign) => setStyle({ textAlign })}
                          options={[
                            { value: 'left', label: <AlignLeftIcon sx={{ fontSize: 16, display: 'block' }} /> },
                            { value: 'center', label: <AlignCenterIcon sx={{ fontSize: 16, display: 'block' }} /> },
                            { value: 'right', label: <AlignRightIcon sx={{ fontSize: 16, display: 'block' }} /> },
                          ]}
                        />
                      </InspectorRow>
                      <InspectorRow label={S.BOLD()}>
                        <Switch size="small" checked={!!style.bold} onChange={(e) => setStyle({ bold: e.target.checked })} />
                      </InspectorRow>
                    </InspectorSection>
                    <InspectorSection id="stage-colours" title={S.COLOURS()}>
                      <Swatch label={S.COLOR()} value={style.color} onChange={(color) => setStyle({ color })} />
                      <Swatch
                        label={S.WARN_COLOR()}
                        value={style.warnColor ?? '#FFB300'}
                        onChange={(warnColor) => setStyle({ warnColor })}
                      />
                      <Swatch
                        label={S.DANGER_COLOR()}
                        value={style.dangerColor ?? '#E53935'}
                        onChange={(dangerColor) => setStyle({ dangerColor })}
                      />
                    </InspectorSection>
                    <InspectorSection
                      id="stage-panel"
                      title={S.PANEL_COLOR()}
                      summary={`${Math.round((style.backgroundOpacity ?? 0) * 100)}%`}
                    >
                      <SliderRow
                        label={S.BACKGROUND_OPACITY()}
                        value={style.backgroundOpacity ?? 0}
                        min={0}
                        max={1}
                        step={0.05}
                        format={(v) => `${Math.round(v * 100)}%`}
                        onChange={(backgroundOpacity) =>
                          setStyle({
                            backgroundOpacity,
                            // A panel with no colour set would stay invisible however far the slider is
                            // pushed, so give it one the moment it is asked for.
                            background: style.background ?? '#000000',
                          })
                        }
                      />
                      <Swatch label={S.COLOR()} value={style.background ?? '#000000'} onChange={(background) => setStyle({ background })} />
                    </InspectorSection>
                  </>
                )}
              </Box>
            </Stack>
          ) : (
            <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', p: 3, gap: 2 }}>
              <Stack sx={{ alignItems: 'center', gap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {S.NO_LAYERS()}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                  {S.NO_LAYERS_HINT()}
                </Typography>
              </Stack>
              {presetCards}
            </Stack>
          )}
        </Stack>
      </Stack>

      {/* New layer: what it is for decides where it sits and how it looks. */}
      <Menu anchorEl={newAnchor} open={Boolean(newAnchor)} onClose={() => setNewAnchor(null)}>
        {STAGE_LAYER_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset];
          return (
            <MenuItem
              key={preset}
              onClick={() => void handleCreate(preset)}
              sx={preset === 'empty' ? { borderTop: 1, borderColor: 'divider' } : undefined}
            >
              <ListItemIcon>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={presetLabel(preset)} secondary={presetHint(preset)} />
            </MenuItem>
          );
        })}
      </Menu>

      <Menu anchorEl={rowMenu?.anchor} open={!!rowMenu} onClose={() => setRowMenu(null)}>
        {rowMenu && [
          <MenuItem
            key="rename"
            onClick={() => {
              select(rowMenu.layer.id);
              setNameDraft(rowMenu.layer.name);
              setRowMenu(null);
            }}
          >
            <ListItemIcon>
              <RenameIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{S.RENAME_LAYER()}</ListItemText>
          </MenuItem>,
          <MenuItem
            key="duplicate"
            onClick={() => {
              void duplicateLayer(rowMenu.layer);
              setRowMenu(null);
            }}
          >
            <ListItemIcon>
              <DuplicateIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{S.DUPLICATE_LAYER()}</ListItemText>
          </MenuItem>,
          <MenuItem
            key="enable"
            onClick={() => {
              updateLayer({ id: rowMenu.layer.id, enabled: !rowMenu.layer.enabled });
              setRowMenu(null);
            }}
          >
            <ListItemIcon>
              <EnableIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{rowMenu.layer.enabled ? S.DISABLE_LAYER() : S.ENABLE_LAYER()}</ListItemText>
          </MenuItem>,
          <MenuItem
            key="delete"
            onClick={() => {
              setPendingDelete(rowMenu.layer);
              setRowMenu(null);
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>{S.DELETE_LAYER()}</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Menu anchorEl={addCueAnchor} open={Boolean(addCueAnchor)} onClose={() => setAddCueAnchor(null)}>
        {CUE_KINDS.map(({ kind, Icon }) => (
          <MenuItem key={kind} onClick={() => selected && addCue(selected, kind)}>
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{cueKindLabel(kind, LL)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{S.DELETE_LAYER()}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">{S.DELETE_LAYER_CONFIRM({ name: pendingDelete?.name ?? '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (pendingDelete) {
                void deleteLayer({ id: pendingDelete.id });
                if (selectedId === pendingDelete.id) select(null);
              }
              setPendingDelete(null);
            }}
          >
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export const StagePanel = stillWhileClosed(StagePanelBody);
