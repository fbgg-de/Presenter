/**
 * The editor for one cue, and the format control shared by all of them.
 *
 * The format control is the interesting part. Most operators want "a clock, with or without
 * seconds" and should never meet a pattern; a few want `EEE dd.MM. HH:mm` and should not be
 * denied it. So presets and a seconds switch are the surface, and the pattern field only
 * appears once *Custom…* is chosen — pre-filled with the preset that was showing, so expert
 * mode starts from something that already works rather than an empty box.
 */
import { useMemo, useState } from 'react';
import { Alert, Box, Chip, FormControlLabel, MenuItem, Select, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { StageCue } from '@/stage/types';
import { InspectorRow, Segmented } from '@/components/media/Viewer';
import { parseTimerInput } from './TimerAdjust';
import {
  DURATION_PRESET_PATTERNS,
  LDML_TOKENS,
  clockPattern,
  formatClockPattern,
  formatDuration,
  parseTimeOfDay,
  validateClockPattern,
  validateDurationPattern,
  type ClockFormat,
  type ClockPreset,
  type DurationFormat,
  type DurationPreset,
} from '@/utils/timeFormat';

type Patch = (patch: Partial<StageCue>) => void;

/**
 * The name of a cue kind. A switch rather than an index into LL, because typesafe-i18n types
 * each key as its own function and a computed key defeats that entirely.
 */
export const cueKindLabel = (kind: StageCue['kind'], LL: ReturnType<typeof useI18nContext>['LL']): string => {
  switch (kind) {
    case 'clock':
      return LL.STAGE.CUE_CLOCK();
    case 'countdown':
      return LL.STAGE.CUE_COUNTDOWN();
    case 'countup':
      return LL.STAGE.CUE_COUNTUP();
    case 'message':
      return LL.STAGE.CUE_MESSAGE();
    case 'blank':
      return LL.STAGE.CUE_BLANK();
  }
};

// ── Format controls ───────────────────────────────────────────────────────────

const CLOCK_PRESETS: Array<{
  value: ClockPreset;
  labelKey: 'PRESET_TIME24' | 'PRESET_TIME12' | 'PRESET_DATE_TIME' | 'PRESET_WEEKDAY_TIME';
}> = [
  { value: 'time24', labelKey: 'PRESET_TIME24' },
  { value: 'time12', labelKey: 'PRESET_TIME12' },
  { value: 'dateTime', labelKey: 'PRESET_DATE_TIME' },
  { value: 'weekdayTime', labelKey: 'PRESET_WEEKDAY_TIME' },
];

const DURATION_PRESETS: Array<{ value: DurationPreset; labelKey: 'DURATION_AUTO' | 'DURATION_MMSS' | 'DURATION_HMMSS' }> = [
  { value: 'auto', labelKey: 'DURATION_AUTO' },
  { value: 'mmss', labelKey: 'DURATION_MMSS' },
  { value: 'hmmss', labelKey: 'DURATION_HMMSS' },
];

/** The pattern cheat-sheet, shown only in custom mode where it is actually needed. */
const TokenReference = () => {
  const { LL } = useI18nContext();
  const meaning = (m: (typeof LDML_TOKENS)[number]['meaning']): string => {
    switch (m) {
      case 'hour24':
        return LL.STAGE.TOKEN_HOUR24();
      case 'hour12':
        return LL.STAGE.TOKEN_HOUR12();
      case 'minute':
        return LL.STAGE.TOKEN_MINUTE();
      case 'second':
        return LL.STAGE.TOKEN_SECOND();
      case 'dayPeriod':
        return LL.STAGE.TOKEN_DAY_PERIOD();
      case 'day':
        return LL.STAGE.TOKEN_DAY();
      case 'month':
        return LL.STAGE.TOKEN_MONTH();
      case 'year':
        return LL.STAGE.TOKEN_YEAR();
      case 'weekday':
        return LL.STAGE.TOKEN_WEEKDAY();
      case 'literal':
        return LL.STAGE.TOKEN_LITERAL();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {LDML_TOKENS.map((t) => (
        <Tooltip key={t.token} title={`${meaning(t.meaning)} — ${t.example}`}>
          <Chip label={t.token} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.62rem', fontFamily: 'monospace' }} />
        </Tooltip>
      ))}
    </Box>
  );
};

/** Turns the validator's findings into a sentence the operator can act on. */
const PatternWarnings = ({ problems }: { problems: ReturnType<typeof validateClockPattern> }) => {
  const { LL } = useI18nContext();
  if (problems.length === 0) return null;
  return (
    <Stack spacing={0.5}>
      {problems.map((p, i) => (
        <Alert key={i} severity={p.kind === 'minutesVsMonths' ? 'warning' : 'info'} sx={{ py: 0, fontSize: '0.75rem' }}>
          {p.kind === 'minutesVsMonths'
            ? LL.STAGE.WARN_MINUTES_VS_MONTHS()
            : p.kind === 'unknownTokens'
              ? LL.STAGE.WARN_UNKNOWN_TOKENS({ letters: p.letters.join(', ') })
              : LL.STAGE.WARN_NO_FIELDS()}
        </Alert>
      ))}
    </Stack>
  );
};

const ClockFormatControl = ({ format, onChange }: { format: ClockFormat; onChange: (f: ClockFormat) => void }) => {
  const { LL } = useI18nContext();
  const pattern = clockPattern(format);
  const problems = useMemo(() => (format.preset === 'custom' ? validateClockPattern(format.pattern) : []), [format]);
  const preview = useMemo(() => formatClockPattern(new Date(), pattern), [pattern]);

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Select
          size="small"
          value={format.preset}
          onChange={(e) => {
            const next = e.target.value as ClockPreset | 'custom';
            // Carry the pattern that was showing into custom mode, so switching to expert
            // never means starting from a blank field.
            if (next === 'custom') onChange({ preset: 'custom', pattern });
            else onChange({ preset: next, seconds: format.preset === 'custom' ? false : format.seconds });
          }}
          sx={{ flex: 1 }}
        >
          {CLOCK_PRESETS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {LL.STAGE[p.labelKey]()}
            </MenuItem>
          ))}
          <MenuItem value="custom">{LL.STAGE.PRESET_CUSTOM()}</MenuItem>
        </Select>
        {format.preset !== 'custom' && (
          <FormControlLabel
            control={
              <Switch size="small" checked={!!format.seconds} onChange={(e) => onChange({ ...format, seconds: e.target.checked })} />
            }
            label={<Typography variant="caption">{LL.STAGE.SHOW_SECONDS()}</Typography>}
          />
        )}
      </Stack>

      {format.preset === 'custom' && (
        <Stack spacing={1}>
          <TextField
            size="small"
            label={LL.STAGE.CUSTOM_PATTERN()}
            value={format.pattern}
            onChange={(e) => onChange({ preset: 'custom', pattern: e.target.value })}
            helperText={LL.STAGE.PATTERN_HELP()}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
          />
          <TokenReference />
          <PatternWarnings problems={problems} />
        </Stack>
      )}

      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {LL.STAGE.PATTERN_PREVIEW()}: <strong>{preview}</strong>
      </Typography>
    </Stack>
  );
};

const DurationFormatControl = ({ format, onChange }: { format: DurationFormat; onChange: (f: DurationFormat) => void }) => {
  const { LL } = useI18nContext();
  const problems = useMemo(() => (format.preset === 'custom' ? validateDurationPattern(format.pattern) : []), [format]);
  // Four and a half minutes: long enough to show the shape, short enough that `auto` still
  // demonstrates dropping the hours group.
  const preview = formatDuration(272_000, format);

  return (
    <Stack spacing={1}>
      <Select
        size="small"
        value={format.preset}
        onChange={(e) => {
          const next = e.target.value as DurationPreset | 'custom';
          if (next === 'custom') {
            onChange({ preset: 'custom', pattern: format.preset === 'auto' ? 'm:ss' : DURATION_PRESET_PATTERNS[format.preset] });
          } else {
            onChange({ preset: next });
          }
        }}
      >
        {DURATION_PRESETS.map((p) => (
          <MenuItem key={p.value} value={p.value}>
            {LL.STAGE[p.labelKey]()}
          </MenuItem>
        ))}
        <MenuItem value="custom">{LL.STAGE.PRESET_CUSTOM()}</MenuItem>
      </Select>

      {format.preset === 'custom' && (
        <Stack spacing={1}>
          <TextField
            size="small"
            label={LL.STAGE.CUSTOM_PATTERN()}
            value={format.pattern}
            onChange={(e) => onChange({ preset: 'custom', pattern: e.target.value })}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
          />
          <PatternWarnings problems={problems} />
        </Stack>
      )}

      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {LL.STAGE.PATTERN_PREVIEW()}: <strong>{preview}</strong>
      </Typography>
    </Stack>
  );
};

// ── Cue editor ────────────────────────────────────────────────────────────────

/** Seconds as "m:ss" ("25:00", "1:05:00" past an hour). */
export const formatMmss = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/**
 * A length typed the way it is read — "25:00", "4:30", or just "5" for five minutes — instead
 * of separate minute and second boxes. The typed text is kept while the field has focus and
 * committed on Enter or leaving it; otherwise it shows the stored value.
 */
const DurationField = ({
  seconds,
  onChange,
  placeholder,
  allowEmpty = false,
}: {
  seconds: number | undefined;
  onChange: (seconds: number | undefined) => void;
  placeholder?: string;
  /** Empty means "not set" (no warning, never move on) rather than 0:00. */
  allowEmpty?: boolean;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (seconds === undefined ? '' : formatMmss(seconds));
  const parsed = draft === null ? null : draft.trim() === '' ? undefined : parseTimerInput(draft);
  const invalid = draft !== null && parsed === null && !(allowEmpty && draft.trim() === '');
  const commit = () => {
    if (draft === null) return;
    if (draft.trim() === '' && allowEmpty) onChange(undefined);
    else if (parsed != null) onChange(parsed);
    setDraft(null);
  };
  return (
    <TextField
      size="small"
      value={text}
      placeholder={placeholder ?? 'm:ss'}
      error={invalid}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      slotProps={{ htmlInput: { style: { fontFamily: 'monospace', width: 84 } } }}
    />
  );
};

const LABEL_WIDTH = 110;

export const StageCueEditor = ({ cue, onChange }: { cue: StageCue; onChange: Patch }) => {
  const { LL } = useI18nContext();
  const S = LL.STAGE;
  const set = (patch: Record<string, unknown>) => onChange(patch as Partial<StageCue>);
  const timeError = cue.kind === 'countdown' && cue.source === 'timeOfDay' && !!cue.atTime && parseTimeOfDay(cue.atTime) === null;

  return (
    <Stack spacing={0.75}>
      <InspectorRow label={S.CUE_NAME()} labelWidth={LABEL_WIDTH}>
        <TextField
          size="small"
          fullWidth
          value={cue.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value || undefined })}
          placeholder={cueKindLabel(cue.kind, LL)}
        />
      </InspectorRow>

      {cue.kind === 'clock' && (
        <InspectorRow label={S.SHOWS_AS()} labelWidth={LABEL_WIDTH} align="start">
          <Box sx={{ flex: 1 }}>
            <ClockFormatControl format={cue.format} onChange={(format) => set({ format })} />
          </Box>
        </InspectorRow>
      )}

      {cue.kind === 'countdown' && (
        <>
          <InspectorRow label={S.COUNTS()} labelWidth={LABEL_WIDTH}>
            <Segmented
              value={cue.source}
              onChange={(source) => set({ source })}
              options={[
                { value: 'duration', label: S.SOURCE_DURATION() },
                { value: 'timeOfDay', label: S.SOURCE_TIME_OF_DAY() },
              ]}
            />
          </InspectorRow>
          {cue.source === 'duration' ? (
            <InspectorRow label={S.LENGTH()} labelWidth={LABEL_WIDTH}>
              <DurationField seconds={cue.durationSec ?? 0} onChange={(durationSec) => set({ durationSec: durationSec ?? 0 })} />
            </InspectorRow>
          ) : (
            <InspectorRow label={S.AT_TIME()} labelWidth={LABEL_WIDTH}>
              <TextField
                size="small"
                value={cue.atTime ?? ''}
                placeholder="10:00"
                error={timeError}
                onChange={(e) => set({ atTime: e.target.value })}
                slotProps={{ htmlInput: { style: { fontFamily: 'monospace', width: 84 } } }}
              />
              <Typography variant="caption" sx={{ color: timeError ? 'error.main' : 'text.secondary' }}>
                {timeError ? 'HH:mm' : S.AT_TIME_HINT()}
              </Typography>
            </InspectorRow>
          )}
          <InspectorRow label={S.AT_ZERO()} labelWidth={LABEL_WIDTH}>
            <Select size="small" value={cue.onZero} onChange={(e) => set({ onZero: e.target.value })} sx={{ minWidth: 200 }}>
              <MenuItem value="hold">{S.ON_ZERO_HOLD()}</MenuItem>
              <MenuItem value="countUp">{S.ON_ZERO_COUNT_UP()}</MenuItem>
              <MenuItem value="next">{S.ON_ZERO_NEXT()}</MenuItem>
              <MenuItem value="hide">{S.ON_ZERO_HIDE()}</MenuItem>
            </Select>
          </InspectorRow>
          <InspectorRow label={S.WARN_AT()} labelWidth={LABEL_WIDTH}>
            <DurationField seconds={cue.warnSec} allowEmpty placeholder="—" onChange={(warnSec) => set({ warnSec })} />
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FFB300', opacity: cue.warnSec == null ? 0.3 : 1 }} />
          </InspectorRow>
          <InspectorRow label={S.DANGER_AT()} labelWidth={LABEL_WIDTH}>
            <DurationField seconds={cue.dangerSec} allowEmpty placeholder="—" onChange={(dangerSec) => set({ dangerSec })} />
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#E53935', opacity: cue.dangerSec == null ? 0.3 : 1 }} />
          </InspectorRow>
        </>
      )}

      {(cue.kind === 'countdown' || cue.kind === 'countup') && (
        <>
          <InspectorRow label={S.SHOWS_AS()} labelWidth={LABEL_WIDTH} align="start">
            <Box sx={{ flex: 1 }}>
              <DurationFormatControl format={cue.format} onChange={(format) => set({ format })} />
            </Box>
          </InspectorRow>
          <InspectorRow label={S.LABEL()} labelWidth={LABEL_WIDTH}>
            <TextField
              size="small"
              fullWidth
              value={cue.label ?? ''}
              placeholder={S.LABEL_HINT()}
              onChange={(e) => set({ label: e.target.value || undefined })}
            />
          </InspectorRow>
        </>
      )}

      {cue.kind === 'message' && (
        <InspectorRow label={S.TEXT()} labelWidth={LABEL_WIDTH} align="start">
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={cue.text}
            placeholder={S.MESSAGE_PREVIEW()}
            onChange={(e) => set({ text: e.target.value })}
          />
        </InspectorRow>
      )}

      {(cue.kind === 'message' || cue.kind === 'blank') && (
        <InspectorRow label={S.AUTO_NEXT()} labelWidth={LABEL_WIDTH}>
          <DurationField
            seconds={cue.autoNextSec}
            allowEmpty
            placeholder={S.AUTO_NEXT_NEVER()}
            onChange={(autoNextSec) => set({ autoNextSec })}
          />
        </InspectorRow>
      )}
    </Stack>
  );
};
