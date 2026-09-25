/**
 * The stage monitor's transport, as it appears in the operator's layer bar (and the phone's
 * output panel).
 *
 * Every stage layer as a block: running ones show what the stage screen shows, their cue
 * position, and Pause / Next / Stop plus the eye; the rest offer Start. During a service the
 * countdown is the thing the operator is watching — and starting it must not need a panel.
 *
 * It ticks locally, exactly like the overlay does — the operator's number comes from the
 * same absolute anchors and the same renderer, so the two cannot drift apart.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  SkipNext as GoIcon,
  Stop as StopIcon,
  Timer as StageIcon,
  Visibility as ShownIcon,
  VisibilityOff as HiddenIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { stageGo, stageSetHidden, stageStart, stageStop, stageTogglePause } from '@/store/stageSlice';
import { cueKindLabel } from './StageCueEditor';
import { TimerAdjustTrigger } from './TimerAdjust';
import { useGetSettings } from '@/store/settingsSlice';
import { STAGE_MONO_FONT, renderStageCue, resolveCue, stageUrgency } from '@/stage/types';
import type { StageLayerStatus } from '@/hooks/useStageEngine';

/** Same cadence as the overlay: fast enough that a seconds digit never appears to skip. */
const TICK_MS = 250;

/**
 * The value a layer is showing right now — digits in tabular figures, turning amber and red at a
 * countdown's thresholds. Shared by the layer bar and the stage panel.
 */
export const StageLiveValue = ({ status, fontSize = '0.8125rem' }: { status: StageLayerStatus; fontSize?: string }) => {
  const { uiLanguage } = useGetSettings('uiLanguage');
  const locale = uiLanguage || 'en';
  const [now, setNow] = useState(() => Date.now());

  const wire = status.cue
    ? resolveCue(
        status.cue,
        {
          cueIndex: status.cueIndex,
          startedAt: status.startedAt,
          pausedAt: status.pausedAt,
          hidden: status.hidden,
          adjustMs: status.adjustMs,
        },
        locale,
      )
    : null;
  const live = !!wire && (wire.kind === 'clock' || (wire.kind === 'timer' && !status.paused));

  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [live]);

  const rendered = wire ? renderStageCue(wire, now, locale) : null;
  const urgency = wire && rendered ? stageUrgency(wire, rendered.remainingSec) : 'normal';
  // A blank or empty-message cue has nothing to render but is still a real position in the
  // sequence, so the row shows a dash and Go still works.
  const value = rendered?.text || '—';

  return (
    <Typography
      component="span"
      noWrap
      sx={{
        fontFamily: STAGE_MONO_FONT,
        fontSize,
        fontWeight: 600,
        // Tabular figures so the bar does not jitter as the digits change width.
        fontVariantNumeric: 'tabular-nums',
        color: urgency === 'danger' ? 'error.main' : urgency === 'warn' ? 'warning.main' : 'text.primary',
        opacity: status.hidden ? 0.5 : 1,
        minWidth: 0,
      }}
    >
      {value}
    </Typography>
  );
};

/** Small square transport button, the same size everywhere on the row. */
const RowButton = ({ title, onClick, children, color }: { title: string; onClick: () => void; children: ReactNode; color?: 'warning' }) => (
  <Tooltip title={title}>
    <IconButton size="small" color={color ?? 'default'} onClick={onClick} sx={{ p: 0.5 }}>
      {children}
    </IconButton>
  </Tooltip>
);

/**
 * One layer as a compact block: its eye, name, what it shows, its position in the cue list and
 * the transport. A layer that is not running offers only Start — the one thing to do with it.
 */
const StageRow = ({ status, onOpen }: { status: StageLayerStatus; onOpen?: () => void }) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const layerId = status.layer.id;
  const at = () => Date.now();
  const running = status.started && !status.finished && !!status.cue;
  const cues = status.layer.data.cues;
  const next = cues[status.cueIndex + 1];
  const timer = status.cue?.kind === 'countdown' || status.cue?.kind === 'countup';

  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: 'center',
        flexShrink: 0,
        pl: running ? 0.25 : 1,
        pr: 0.25,
        height: 30,
        borderRadius: 1,
        border: 1,
        borderColor: running && !status.hidden ? 'divider' : 'transparent',
        bgcolor: running ? 'action.hover' : 'transparent',
      }}
    >
      {running && (
        <RowButton
          title={status.hidden ? LL.STAGE.SHOW() : LL.STAGE.HIDE()}
          color={status.hidden ? 'warning' : undefined}
          onClick={() => dispatch(stageSetHidden({ layerId, hidden: !status.hidden, at: at() }))}
        >
          {status.hidden ? <HiddenIcon sx={{ fontSize: 16 }} /> : <ShownIcon sx={{ fontSize: 16 }} />}
        </RowButton>
      )}
      <Tooltip title={onOpen ? LL.STAGE.EDIT_LAYER({ name: status.layer.name }) : ''}>
        <Typography
          variant="body2"
          noWrap
          onClick={onOpen}
          sx={{
            fontWeight: 600,
            maxWidth: 140,
            color: running ? 'text.primary' : 'text.secondary',
            cursor: onOpen ? 'pointer' : 'default',
            '&:hover': onOpen ? { textDecoration: 'underline' } : undefined,
          }}
        >
          {status.layer.name}
        </Typography>
      </Tooltip>
      {running ? (
        <>
          <TimerAdjustTrigger status={status}>
            <StageLiveValue status={status} />
          </TimerAdjustTrigger>
          <Typography
            component="span"
            title={LL.STAGE.CUE_OF({ index: status.cueIndex + 1, total: status.cueCount })}
            sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}
          >
            {status.cueIndex + 1}/{status.cueCount}
          </Typography>
          {timer && (
            <RowButton
              title={status.paused ? LL.STAGE.RESUME() : LL.STAGE.PAUSE()}
              color={status.paused ? 'warning' : undefined}
              onClick={() => dispatch(stageTogglePause({ layerId, at: at() }))}
            >
              {status.paused ? <ResumeIcon sx={{ fontSize: 16 }} /> : <PauseIcon sx={{ fontSize: 16 }} />}
            </RowButton>
          )}
          <RowButton
            title={next ? LL.STAGE.NEXT_CUE({ name: next.name || cueKindLabel(next.kind, LL) }) : LL.STAGE.GO_TO_END()}
            onClick={() => dispatch(stageGo({ layerId, cueCount: status.cueCount, at: at() }))}
          >
            <GoIcon sx={{ fontSize: 16 }} />
          </RowButton>
          <RowButton title={LL.STAGE.STOP()} onClick={() => dispatch(stageStop({ layerId, cueCount: status.cueCount, at: at() }))}>
            <StopIcon sx={{ fontSize: 16 }} />
          </RowButton>
        </>
      ) : (
        <Button
          size="small"
          color="inherit"
          variant="outlined"
          startIcon={<ResumeIcon sx={{ fontSize: 16 }} />}
          onClick={() => dispatch(stageStart({ layerId, at: at() }))}
          sx={{ textTransform: 'none', py: 0, minWidth: 0, height: 24 }}
        >
          {LL.STAGE.START()}
        </Button>
      )}
    </Stack>
  );
};

export interface StageTransportProps {
  statuses: StageLayerStatus[];
  allHidden: boolean;
  onOpenPanel: () => void;
  /** A click on a layer's name opens the setup on that layer. */
  onOpenLayer?: (layerId: number) => void;
  /** Off where a separate "Stage…" button already opens the panel (the layer bar). */
  showPanelButton?: boolean;
}

/**
 * Every enabled layer with cues, running ones first — so a countdown is started from the bar
 * itself, not from a panel that has to be opened first mid-service.
 */
export const StageTransport = ({ statuses, allHidden, onOpenPanel, onOpenLayer, showPanelButton = true }: StageTransportProps) => {
  const { LL } = useI18nContext();
  const layers = statuses.filter((s) => s.layer.enabled && s.cueCount > 0);
  if (layers.length === 0) return null;
  const isRunning = (s: StageLayerStatus) => s.started && !s.finished;
  const ordered = [...layers.filter(isRunning), ...layers.filter((s) => !isRunning(s))];

  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0, overflowX: 'auto', opacity: allHidden ? 0.45 : 1 }}>
      {showPanelButton && (
        <Tooltip title={LL.STAGE.OPEN_PANEL()}>
          <IconButton size="small" onClick={onOpenPanel}>
            <StageIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {ordered.map((status) => (
        <StageRow key={status.layer.id} status={status} onOpen={onOpenLayer ? () => onOpenLayer(status.layer.id) : undefined} />
      ))}
    </Stack>
  );
};
