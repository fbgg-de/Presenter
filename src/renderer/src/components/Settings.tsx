import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  FileDownload as ExportIcon,
  FileUpload as ImportIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { updateSetting, type SettingsState } from '@/store/settingsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { KeyboardMappingEditor } from '@/components/KeyboardMappingEditor';
import { exportSettings, importSettings, applyImportedSettings } from '@/utils/settingsExport';

type SettingConfig = {
  key: keyof SettingsState;
  type: 'string' | 'number' | 'boolean' | 'select' | 'color';
  values?: string[];
  group: string;
  label?: string;
  description?: string;
};

const SETTINGS_CONFIG: SettingConfig[] = [
  // General
  { key: 'uiLanguage', type: 'select', values: ['en', 'de'], group: 'General', label: 'Language / Sprache' },
  { key: 'backendUrl', type: 'string', group: 'General', label: 'Backend URL' },
  { key: 'showLimit', type: 'number', group: 'General', label: 'Shows per page' },
  { key: 'showSaveFormat', type: 'string', group: 'General', label: 'Show title template' },
  // Behavior
  { key: 'songClick', type: 'select', values: ['click', 'double-click'], group: 'Behavior', label: 'Song click' },
  { key: 'verseClick', type: 'select', values: ['click', 'double-click'], group: 'Behavior', label: 'Block click' },
  { key: 'songOrder', type: 'select', values: ['lexicographic', 'numeric'], group: 'Behavior', label: 'Song sort order' },
  { key: 'defaultNewVerseName', type: 'string', group: 'Behavior', label: 'Default new block name' },
  { key: 'defaultVerseName', type: 'string', group: 'Behavior', label: 'Default first block name' },
  { key: 'overrideSongImport', type: 'boolean', group: 'Behavior', label: 'Override on import' },
  { key: 'reloadSongAfterEdit', type: 'boolean', group: 'Behavior', label: 'Reload song after edit' },
  { key: 'resetBlackOnSwitch', type: 'boolean', group: 'Behavior', label: 'Reset black on song switch' },
  { key: 'showDeleteFromDb', type: 'boolean', group: 'Behavior', label: 'Show delete from DB' },
  { key: 'touchDuration', type: 'number', group: 'Behavior', label: 'Long-press duration (ms)' },
  // Keyboard
  { key: 'keyboardNavigationSongs', type: 'boolean', group: 'Keyboard', label: 'Keyboard: navigate songs' },
  { key: 'keyboardNavigationBlocks', type: 'boolean', group: 'Keyboard', label: 'Keyboard: navigate blocks' },
  { key: 'keyboardNavigationLines', type: 'boolean', group: 'Keyboard', label: 'Keyboard: navigate lines' },
  // Confirmations
  { key: 'confirmPageLeave', type: 'boolean', group: 'Confirmations', label: 'Confirm page leave' },
  { key: 'confirmShowDeletion', type: 'boolean', group: 'Confirmations', label: 'Confirm show deletion' },
  { key: 'confirmShowOverwrite', type: 'boolean', group: 'Confirmations', label: 'Confirm show overwrite' },
  { key: 'confirmSongDelete', type: 'boolean', group: 'Confirmations', label: 'Confirm song delete' },
  // Notifications
  { key: 'notificationCount', type: 'number', group: 'Notifications', label: 'Max visible' },
  { key: 'notificationTime', type: 'number', group: 'Notifications', label: 'Auto-dismiss (ms)' },
  { key: 'uploadNotifications', type: 'boolean', group: 'Notifications', label: 'Song upload notifications' },
  // Presentation
  { key: 'controlLayout', type: 'select', values: ['boxed', 'list'], group: 'Presentation', label: 'Control layout' },
  { key: 'nextLinePreview', type: 'boolean', group: 'Presentation', label: 'Next-line preview' },
  { key: 'nextLinePreviewColor', type: 'color', group: 'Presentation', label: 'Preview line color' },
  { key: 'nextLineTranslation', type: 'boolean', group: 'Presentation', label: 'Preview translations' },
  { key: 'bibleTranslation', type: 'string', group: 'Presentation', label: 'Default Bible translation' },
  { key: 'windowFooterVisible', type: 'boolean', group: 'Presentation', label: 'Show window footer bar' },
  // Musician
  { key: 'musicianName', type: 'string', group: 'Musician', label: 'Musician name' },
  { key: 'musicianBand', type: 'string', group: 'Musician', label: 'Band / order' },
  { key: 'musicianPageView', type: 'select', values: ['one-page', 'two-page'], group: 'Musician', label: 'Default page view' },
  { key: 'musicianBlockIndicator', type: 'boolean', group: 'Musician', label: 'Show block indicator' },
  { key: 'midiTrackingMaster', type: 'select', values: ['operator', 'midi'], group: 'Musician', label: 'Tracking master' },
  // Electron
  { key: 'mediaPath', type: 'string', group: 'Electron', label: 'Media directory path' },
  { key: 'wsPort', type: 'number', group: 'Electron', label: 'WebSocket port' },
  { key: 'autoCheckUpdates', type: 'boolean', group: 'Electron', label: 'Auto-check updates' },
];

const GROUP_ORDER = ['General', 'Behavior', 'Keyboard', 'Confirmations', 'Notifications', 'Presentation', 'Musician', 'Electron'];

export const Settings = (props: { open: boolean; setOpen: (open: boolean) => void }) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);
  const { data: styles = [] } = useGetStylesQuery();
  const [filter, setFilter] = useState('');

  const getGroupLabel = (group: string): string => {
    switch (group) {
      case 'General':
        return LL.SETTINGS.GROUP_GENERAL();
      case 'Behavior':
        return LL.SETTINGS.GROUP_BEHAVIOR();
      case 'Keyboard':
        return LL.SETTINGS.GROUP_KEYBOARD();
      case 'Confirmations':
        return LL.SETTINGS.GROUP_CONFIRMATIONS();
      case 'Notifications':
        return LL.SETTINGS.GROUP_NOTIFICATIONS();
      case 'Presentation':
        return LL.SETTINGS.GROUP_PRESENTATION();
      case 'Musician':
        return LL.SETTINGS.GROUP_MUSICIAN();
      case 'Electron':
        return LL.SETTINGS.GROUP_ELECTRON();
      default:
        return group;
    }
  };

  // Group and filter settings
  const groups: Record<string, SettingConfig[]> = {};
  const filterLower = filter.toLowerCase();

  for (const config of SETTINGS_CONFIG) {
    const label = config.label || config.key;
    if (filterLower && !label.toLowerCase().includes(filterLower) && !config.key.toLowerCase().includes(filterLower)) {
      continue;
    }
    if (!groups[config.group]) groups[config.group] = [];
    groups[config.group].push(config);
  }

  return (
    <Drawer open={props.open} onClose={() => props.setOpen(false)} anchor="right">
      <Stack sx={{ width: 'min(90vw, 600px)', height: '100%' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {LL.SETTINGS.SETTINGS()}
          </Typography>
          <Box flexGrow={1} />
          <IconButton onClick={() => props.setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Search */}
        <Box sx={{ px: 2, py: 1 }}>
          <TextField size="small" fullWidth placeholder={LL.SETTINGS.FILTER()} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </Box>

        <Stack sx={{ flex: 1, overflow: 'auto', px: 1 }}>
          {/* Global Style selector */}
          {(!filterLower || 'global style'.includes(filterLower)) && (
            <Accordion defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>{LL.SETTINGS.GLOBAL_STYLE()}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <FormControl size="small" fullWidth>
                  <InputLabel>{LL.STYLE.SELECT()}</InputLabel>
                  <Select
                    value={settings.globalStyleId || 0}
                    label={LL.STYLE.SELECT()}
                    onChange={(e) => dispatch(updateSetting({ key: 'globalStyleId', value: Number(e.target.value) }))}
                  >
                    <MenuItem value={0}>{LL.STYLE.NONE()}</MenuItem>
                    {styles.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Setting groups */}
          {GROUP_ORDER.filter((g) => groups[g] && groups[g].length > 0).map((groupName) => (
            <Accordion key={groupName} defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>{getGroupLabel(groupName)}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {groups[groupName].map((config) => (
                    <SettingRow key={config.key} config={config} value={settings[config.key]} dispatch={dispatch} />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}

          {/* Keyboard Mapping */}
          {(!filterLower || 'keyboard shortcut'.includes(filterLower)) && (
            <Accordion defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>{LL.SETTINGS.GROUP_KEYBOARD()}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <KeyboardMappingEditor />
              </AccordionDetails>
            </Accordion>
          )}

          {/* Settings Export/Import */}
          {(!filterLower || 'export import backup'.includes(filterLower)) && (
            <Accordion defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>{LL.SETTINGS.EXPORT_IMPORT()}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    {LL.SETTINGS.EXPORT_IMPORT_DESC()}
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<ExportIcon />} onClick={() => exportSettings()}>
                      {LL.SETTINGS.EXPORT_BUTTON()}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<ImportIcon />}
                      onClick={async () => {
                        const diff = await importSettings();
                        if (diff) {
                          const changeCount = Object.keys(diff.added).length + Object.keys(diff.changed).length;
                          if (changeCount > 0) {
                            if (
                              window.confirm(
                                LL.SETTINGS.IMPORT_CONFIRM({
                                  count: changeCount,
                                  added: Object.keys(diff.added).length,
                                  changed: Object.keys(diff.changed).length,
                                }),
                              )
                            ) {
                              await applyImportedSettings(diff);
                            }
                          } else {
                            window.alert(LL.SETTINGS.NO_CHANGES());
                          }
                        }
                      }}
                    >
                      {LL.SETTINGS.IMPORT_BUTTON()}
                    </Button>
                  </Stack>
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </Stack>
      </Stack>
    </Drawer>
  );
};

/** Individual setting row */
const SettingRow = ({
  config,
  value,
  dispatch,
}: {
  config: SettingConfig;
  value: unknown;
  dispatch: ReturnType<typeof useAppDispatch>;
}) => {
  const { LL } = useI18nContext();

  const getLabel = (cfg: SettingConfig) => {
    switch (cfg.key) {
      case 'uiLanguage':
        return LL.COMMON.LANGUAGE();
      case 'backendUrl':
        return LL.SETTINGS.OPTIONS.BACKEND_URL.TITLE();
      case 'showLimit':
        return LL.SETTINGS.OPTIONS.SHOW_LIMIT.TITLE();
      case 'showSaveFormat':
        return LL.SETTINGS.OPTIONS.SHOW_TITLE_TEMPLATE.TITLE();
      case 'songClick':
        return LL.SETTINGS.OPTIONS.SONG_CLICK_BEHAVIOUR.TITLE();
      case 'verseClick':
        return LL.SETTINGS.OPTIONS.VERSE_CLICK_BEHAVIOUR.TITLE();
      case 'songOrder':
        return LL.SETTINGS.OPTIONS.SONG_OVERVIEW_ORDER.TITLE();
      case 'defaultNewVerseName':
        return LL.SETTINGS.OPTIONS.DEFAULT_NEW_VERSE_NAME.TITLE();
      case 'defaultVerseName':
        return LL.SETTINGS.OPTIONS.DEFAULT_VERSE_NAME.TITLE();
      case 'overrideSongImport':
        return LL.SETTINGS.OPTIONS.OVERRIDE_SONG_BY_IMPORT.TITLE();
      case 'reloadSongAfterEdit':
        return LL.SETTINGS.OPTIONS.RELOAD_SONG_AFTER_EDIT.TITLE();
      case 'resetBlackOnSwitch':
        return LL.SETTINGS.OPTIONS.RESET_BLACK_ON_SONG_SWITCH.TITLE();
      case 'showDeleteFromDb':
        return LL.SETTINGS.OPTIONS.SHOW_REMOVE_SONG_FROM_DATABASE.TITLE();
      case 'touchDuration':
        return LL.SETTINGS.OPTIONS.TOUCH_DURATION.TITLE();
      case 'keyboardNavigationSongs':
        return LL.SETTINGS.OPTIONS.KEYBOARD_NAV_SONGS.TITLE();
      case 'keyboardNavigationBlocks':
        return LL.SETTINGS.OPTIONS.KEYBOARD_NAV_BLOCKS.TITLE();
      case 'keyboardNavigationLines':
        return LL.SETTINGS.OPTIONS.KEYBOARD_NAV_LINES.TITLE();
      case 'confirmPageLeave':
        return LL.SETTINGS.OPTIONS.CONFIRM_PAGE_LEAVE.TITLE();
      case 'confirmShowDeletion':
        return LL.SETTINGS.OPTIONS.CONFIRM_SHOW_DELETION.TITLE();
      case 'confirmShowOverwrite':
        return LL.SETTINGS.OPTIONS.CONFIRM_SHOW_OVERWRITE.TITLE();
      case 'confirmSongDelete':
        return LL.SETTINGS.OPTIONS.CONFIRM_SONG_DELETE.TITLE();
      case 'notificationCount':
        return LL.SETTINGS.OPTIONS.NOTIFICATION_COUNT.TITLE();
      case 'notificationTime':
        return LL.SETTINGS.OPTIONS.NOTIFICATION_DISAPPEAR_TIME.TITLE();
      case 'uploadNotifications':
        return LL.SETTINGS.OPTIONS.SHOW_SONG_UPLOAD_NOTIFICATIONS.TITLE();
      case 'controlLayout':
        return LL.SETTINGS.OPTIONS.CONTROL_LAYOUT.TITLE();
      case 'nextLinePreview':
        return LL.SETTINGS.OPTIONS.NEXT_LINE_PREVIEW.TITLE();
      case 'nextLinePreviewColor':
        return LL.SETTINGS.OPTIONS.NEXT_LINE_PREVIEW_COLOR.TITLE();
      case 'nextLineTranslation':
        return LL.SETTINGS.OPTIONS.NEXT_LINE_TRANSLATION.TITLE();
      case 'bibleTranslation':
        return LL.SETTINGS.OPTIONS.BIBLE_TRANSLATION.TITLE();
      case 'windowFooterVisible':
        return LL.SETTINGS.OPTIONS.WINDOW_FOOTER_VISIBLE.TITLE();
      case 'musicianName':
        return LL.SETTINGS.OPTIONS.MUSICIAN_NAME.TITLE();
      case 'musicianBand':
        return LL.SETTINGS.OPTIONS.MUSICIAN_BAND.TITLE();
      case 'musicianPageView':
        return LL.SETTINGS.OPTIONS.MUSICIAN_PAGE_VIEW.TITLE();
      case 'musicianBlockIndicator':
        return LL.SETTINGS.OPTIONS.MUSICIAN_BLOCK_INDICATOR.TITLE();
      case 'midiTrackingMaster':
        return LL.SETTINGS.OPTIONS.MIDI_TRACKING_MASTER.TITLE();
      case 'mediaPath':
        return LL.SETTINGS.OPTIONS.MEDIA_PATH.TITLE();
      case 'wsPort':
        return LL.SETTINGS.OPTIONS.WS_PORT.TITLE();
      case 'autoCheckUpdates':
        return LL.SETTINGS.OPTIONS.AUTO_CHECK_UPDATES.TITLE();
      default:
        return cfg.label || String(cfg.key);
    }
  };

  const label = getLabel(config);

  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
      <Tooltip title={config.description || label}>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {label}
        </Typography>
      </Tooltip>
      <Box sx={{ flex: 1 }}>
        {config.type === 'boolean' ? (
          <Switch
            size="small"
            checked={Boolean(value)}
            onChange={(e) => dispatch(updateSetting({ key: config.key, value: e.target.checked }))}
          />
        ) : config.type === 'select' && config.values ? (
          <Select
            size="small"
            fullWidth
            value={String(value)}
            onChange={(e) => dispatch(updateSetting({ key: config.key, value: e.target.value }))}
          >
            {config.values.map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </Select>
        ) : config.type === 'color' ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <input
              type="color"
              value={String(value) || '#000000'}
              onChange={(e) => dispatch(updateSetting({ key: config.key, value: e.target.value }))}
              style={{ width: 36, height: 28, border: 'none', cursor: 'pointer' }}
            />
            <Typography variant="caption" fontFamily="monospace">
              {String(value)}
            </Typography>
          </Stack>
        ) : (
          <SettingInput
            value={value}
            type={config.type === 'number' ? 'number' : 'string'}
            onChange={(v) => dispatch(updateSetting({ key: config.key, value: v }))}
          />
        )}
      </Box>
    </Stack>
  );
};

/** Controlled input with local state for blur-to-save behavior */
const SettingInput = ({ value, type, onChange }: { value: unknown; type: 'string' | 'number'; onChange: (v: unknown) => void }) => {
  const [localValue, setLocalValue] = useState(String(value));

  return (
    <OutlinedInput
      size="small"
      value={localValue}
      fullWidth
      type={type === 'number' ? 'number' : 'text'}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        onChange(type === 'number' ? Number(localValue) : localValue);
      }}
    />
  );
};
