/**
 * Correcting a running countdown or count-up on the fly — the sermon has to be shortened, the
 * service started late. Steps of ±10 s / 1 min / 5 min, or a time to jump to. It adjusts the
 * layer's runtime offset (`stageAdjust`), never the saved cue, so the next service starts from
 * the planned length again.
 */
import { useState, type ReactNode } from 'react';
import { Box, ButtonBase, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { stageAdjust } from '@/store/stageSlice';
import { resolveCue } from '@/stage/types';
import type { StageLayerStatus } from '@/hooks/useStageEngine';

const STEPS = [-300, -60, -10, 10, 60, 300];

const stepLabel = (seconds: number) => {
  const sign = seconds < 0 ? '−' : '+';
  const abs = Math.abs(seconds);
  return abs >= 60 ? `${sign}${abs / 60}m` : `${sign}${abs}s`;
};

/** A correction as "+1:00" / "−14:47". */
const signedMinutes = (ms: number) => {
  const total = Math.round(Math.abs(ms) / 1000);
  return `${ms < 0 ? '−' : '+'}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** "5" = five minutes, "4:30", "1:05:00". Null for anything else. */
export const parseTimerInput = (text: string): number | null => {
  const parts = text.trim().split(':');
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 1) return n[0] * 60;
  if (n.length === 2) return n[0] * 60 + n[1];
  return n[0] * 3600 + n[1] * 60 + n[2];
};

/** Whether this layer is running a timer that can be corrected. */
export const isAdjustableTimer = (status: StageLayerStatus): boolean =>
  status.started && !status.finished && (status.cue?.kind === 'countdown' || status.cue?.kind === 'countup');

/** The timer's value right now: seconds left on a countdown, seconds elapsed on a count-up. */
const currentSeconds = (status: StageLayerStatus): number | null => {
  if (!status.cue) return null;
  const wire = resolveCue(
    status.cue,
    { cueIndex: status.cueIndex, startedAt: status.startedAt, pausedAt: status.pausedAt, hidden: status.hidden, adjustMs: status.adjustMs },
    'en',
  );
  if (wire?.kind !== 'timer') return null;
  const now = wire.frozenAt ?? Date.now();
  return (wire.direction === 'down' ? wire.anchor - now : now - wire.anchor) / 1000;
};

/** The step buttons and "set to" field — inline in the drawer, inside the popover on the bar. */
export const TimerAdjustControls = ({ status, dense = false }: { status: StageLayerStatus; dense?: boolean }) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const [text, setText] = useState('');
  const layerId = status.layer.id;
  const countdown = status.cue?.kind === 'countdown';

  const setTo = () => {
    const target = parseTimerInput(text);
    const current = currentSeconds(status);
    if (target === null || current === null) return;
    dispatch(stageAdjust({ layerId, deltaMs: Math.round((target - current) * 1000) }));
    setText('');
  };

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Stack direction="row" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        {STEPS.map((step, index) => (
          <Tooltip
            key={step}
            title={countdown ? LL.STAGE.ADJUST_STEP_DOWN({ step: stepLabel(step) }) : LL.STAGE.ADJUST_STEP_UP({ step: stepLabel(step) })}
          >
            <ButtonBase
              onClick={() => dispatch(stageAdjust({ layerId, deltaMs: step * 1000 }))}
              sx={{
                px: dense ? 0.75 : 1,
                py: 0.4,
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 600,
                color: 'text.secondary',
                borderLeft: index > 0 ? 1 : 0,
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
              }}
            >
              {stepLabel(step)}
            </ButtonBase>
          </Tooltip>
        ))}
      </Stack>
      <TextField
        size="small"
        value={text}
        placeholder={LL.STAGE.ADJUST_SET_TO()}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setTo();
        }}
        error={text !== '' && parseTimerInput(text) === null}
        slotProps={{ htmlInput: { style: { fontFamily: 'monospace', width: 92, padding: '4px 8px', fontSize: 13 } } }}
        sx={{ '& .MuiInputBase-root': { height: 28 } }}
      />
      {(status.adjustMs ?? 0) !== 0 && (
        <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'warning.main' }}>
          {LL.STAGE.ADJUSTED({ by: signedMinutes(status.adjustMs ?? 0) })}
        </Typography>
      )}
    </Stack>
  );
};

/** Wraps a running timer's digits: a click opens the adjuster. Anything else renders as it is. */
export const TimerAdjustTrigger = ({ status, children }: { status: StageLayerStatus; children: ReactNode }) => {
  const { LL } = useI18nContext();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!isAdjustableTimer(status)) return <>{children}</>;
  return (
    <>
      <Tooltip title={LL.STAGE.ADJUST_TIME()}>
        <ButtonBase
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ borderRadius: 0.75, px: 0.5, mx: -0.5, '&:hover': { bgcolor: 'action.hover' } }}
        >
          {children}
        </ButtonBase>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ p: 1.25 }}>
          <Typography
            sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}
          >
            {status.layer.name} · {LL.STAGE.ADJUST_TIME()}
          </Typography>
          <TimerAdjustControls status={status} />
        </Box>
      </Popover>
    </>
  );
};
