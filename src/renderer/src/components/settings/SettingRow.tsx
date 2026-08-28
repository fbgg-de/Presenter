import { useState, type ReactNode } from 'react';
import { Box, IconButton, InputAdornment, MenuItem, OutlinedInput, Select, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { FolderOpen as FolderOpenIcon, InfoOutlined as InfoIcon, RestartAlt as ResetIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings, SETTINGS_DEFAULTS, type SettingsState } from '@/store/settingsSlice';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import { useTrackedUpdateSetting } from '@/hooks/useTrackedUpdateSetting';
import { splitUnit, type SettingDef } from '@/components/settings/settingsCatalog';

/** Control column: wide enough for a select, and narrower on a phone so the label keeps room. */
const CONTROL_WIDTH = { xs: 140, sm: 190 };

/**
 * Frame shared by everything in the panel: a label with its explanation on the left, the
 * control on the right. Descriptions are shown rather than hidden in a tooltip — reading
 * what a setting does should not require finding out that hovering it is a thing.
 */
export const SettingFrame = ({
  label,
  description,
  info,
  action,
  control,
}: {
  label: ReactNode;
  description?: ReactNode;
  /**
   * The long version, behind an info icon beside the label. For a setting whose consequences
   * are worth spelling out but would bury the row if they were always on screen.
   */
  info?: ReactNode;
  /** Rendered between label and control (the reset button). */
  action?: ReactNode;
  control: ReactNode;
}) => (
  <Stack
    direction="row"
    spacing={2}
    sx={{
      alignItems: 'flex-start',
      py: 1,
      // The reset button only shows up once the row is worth resetting.
      '&:hover .setting-row-action': { opacity: 1 },
    }}
  >
    <Stack sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Typography variant="body2">{label}</Typography>
        {info && (
          // enterTouchDelay 0 because on a phone the icon is the whole affordance — waiting out
          // a long press to find out what it does is not a discovery anyone makes.
          <Tooltip title={info} enterTouchDelay={0} leaveTouchDelay={10000}>
            <InfoIcon sx={{ fontSize: 15, color: 'text.secondary', cursor: 'help' }} />
          </Tooltip>
        )}
        {action}
      </Stack>
      {description && (
        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
          {description}
        </Typography>
      )}
    </Stack>
    <Box sx={{ width: CONTROL_WIDTH, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', pt: 0.25 }}>{control}</Box>
  </Stack>
);

/** One catalog row, wired to the store. */
export const SettingRow = ({ def }: { def: SettingDef }) => {
  const { LL } = useI18nContext();
  const settings = useGetSettings();
  const updateSetting = useTrackedUpdateSetting();

  const value = settings[def.key];
  const defaultValue = SETTINGS_DEFAULTS[def.key];
  const isModified = JSON.stringify(value) !== JSON.stringify(defaultValue);
  const { label, unit } = splitUnit(def.label);

  const reset = () => updateSetting(def.key, defaultValue as SettingsState[typeof def.key]);

  return (
    <SettingFrame
      label={label}
      description={def.description}
      action={
        isModified ? (
          <Tooltip title={LL.SETTINGS.RESET_TO_DEFAULT()}>
            <IconButton
              className="setting-row-action"
              size="small"
              onClick={reset}
              sx={{ opacity: 0, transition: 'opacity 120ms', p: 0.25 }}
            >
              <ResetIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        ) : null
      }
      control={<SettingControlInput def={def} value={value} unit={unit} onChange={(v) => updateSetting(def.key, v as never)} />}
    />
  );
};

const SettingControlInput = ({
  def,
  value,
  unit,
  onChange,
}: {
  def: SettingDef;
  value: unknown;
  unit?: string;
  onChange: (value: unknown) => void;
}) => {
  const { LL } = useI18nContext();
  const control = def.control;

  switch (control.kind) {
    case 'boolean':
      return <Switch size="small" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;

    case 'select':
      return (
        <Select size="small" fullWidth value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {control.options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      );

    case 'color':
      return <ColorSwatchButton value={String(value ?? '') || '#000000'} onChange={(c) => onChange(c)} />;

    case 'number':
      return (
        <CommittedInput
          value={String(value ?? '')}
          type="number"
          unit={unit}
          inputProps={{ min: control.min, max: control.max, step: control.step }}
          onCommit={(v) => onChange(Number(v))}
        />
      );

    case 'path':
      return (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', width: '100%' }}>
          <CommittedInput value={String(value ?? '')} type="text" onCommit={(v) => onChange(v)} />
          {window.api?.pickDirectory && (
            <Tooltip title={LL.STYLE.BROWSE()}>
              <IconButton
                size="small"
                onClick={async () => {
                  const dir = await window.api.pickDirectory({ title: LL.SETTINGS.OPTIONS.MEDIA_PATH.DESCRIPTION() });
                  if (dir) onChange(dir);
                }}
              >
                <FolderOpenIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      );

    default:
      return <CommittedInput value={String(value ?? '')} type="text" placeholder={control.placeholder} onCommit={(v) => onChange(v)} />;
  }
};

/**
 * Text and number fields keep their own draft and report it on blur or Enter, so a value
 * is not written (and persisted, and broadcast) once per keystroke.
 */
export const CommittedInput = ({
  value,
  type,
  unit,
  placeholder,
  inputProps,
  onCommit,
}: {
  value: string;
  type: 'text' | 'number';
  unit?: string;
  placeholder?: string;
  inputProps?: Record<string, unknown>;
  onCommit: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // Adopt a value that changed underneath us (a reset, an import) without an effect.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  return (
    <OutlinedInput
      size="small"
      fullWidth
      type={type}
      value={draft}
      placeholder={placeholder}
      inputProps={inputProps}
      endAdornment={
        unit ? (
          <InputAdornment position="end">
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {unit}
            </Typography>
          </InputAdornment>
        ) : undefined
      }
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
};
