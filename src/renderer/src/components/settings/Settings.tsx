import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Drawer,
  IconButton,
  Menu,
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
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  FileDownload as ExportIcon,
  FileUpload as ImportIcon,
  FolderOpen as FolderOpenIcon,
  Cable as CableIcon,
  Language as LanguageIcon,
  LightMode,
  DarkMode,
  SettingsBrightness,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { useUpdateSetting, type SettingsState, useGetSettings, toggleTheme } from '@/store/settingsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { useGetAccountSettingsQuery, useUpdateAccountSettingsMutation } from '@/api/session.api';
import { KeyboardMappingEditor } from '@/components/settings/KeyboardMappingEditor';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import { exportSettings, importSettings, applyImportedSettings } from '@/utils/settingsExport';
import { CompanionHelper } from '@/components/settings/CompanionHelper';
import { DesktopAppDownloadModal } from '@/components/settings/DesktopAppBanner';

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
  { key: 'backendUrl', type: 'string', group: 'General', label: 'Backend URL' },
  { key: 'showSaveFormat', type: 'string', group: 'General', label: 'Show title template' },
  // Behavior
  { key: 'songClick', type: 'select', values: ['click', 'double-click'], group: 'Behavior', label: 'Song click' },
  { key: 'verseClick', type: 'select', values: ['click', 'double-click'], group: 'Behavior', label: 'Block click' },
  { key: 'defaultNewVerseName', type: 'string', group: 'Behavior', label: 'Default new block name' },
  { key: 'defaultVerseName', type: 'string', group: 'Behavior', label: 'Default first block name' },
  { key: 'overrideSongImport', type: 'boolean', group: 'Behavior', label: 'Override on import' },
  { key: 'showDeleteFromDb', type: 'boolean', group: 'Behavior', label: 'Show delete from DB' },
  { key: 'touchDuration', type: 'number', group: 'Behavior', label: 'Long-press duration (ms)' },
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
  { key: 'bibleTranslation', type: 'string', group: 'Presentation', label: 'Default Bible translation' },
  { key: 'windowFooterVisible', type: 'boolean', group: 'Presentation', label: 'Show window footer bar' },
  { key: 'transitionMode', type: 'select', values: ['cut', 'fade'], group: 'Presentation', label: 'Transition mode' },
  { key: 'transitionDuration', type: 'number', group: 'Presentation', label: 'Transition duration (ms)' },
  { key: 'hideTransitionMode', type: 'select', values: ['cut', 'fade'], group: 'Presentation', label: 'Hide transition' },
  { key: 'hideTransitionDuration', type: 'number', group: 'Presentation', label: 'Hide transition duration (ms)' },
  { key: 'videoFadeDuration', type: 'number', group: 'Presentation', label: 'Video play/stop fade duration (ms)' },
  { key: 'showLicenseNumber', type: 'boolean', group: 'Presentation', label: 'Show license number' },
  // Electron
  { key: 'mediaPath', type: 'string', group: 'Electron', label: 'Media directory path' },
  { key: 'wsPort', type: 'number', group: 'Electron', label: 'WebSocket port' },
  { key: 'autoCheckUpdates', type: 'boolean', group: 'Electron', label: 'Auto-check updates' },
  { key: 'restoreWindowsOnStart', type: 'boolean', group: 'Electron', label: 'Restore windows on start' },
];

const GROUP_ORDER = ['General', 'Behavior', 'Confirmations', 'Notifications', 'Presentation', 'Electron'];

export const Settings = (props: { open: boolean; setOpen: (open: boolean) => void }) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();

  const settings = useGetSettings();
  const updateSetting = useUpdateSetting();

  const { data: styles = [] } = useGetStylesQuery();
  const { data: accountSettings } = useGetAccountSettingsQuery(undefined, { skip: settings.offlineMode });
  const [updateAccountSettings] = useUpdateAccountSettingsMutation();
  const [filter, setFilter] = useState('');
  const [companionOpen, setCompanionOpen] = useState(false);
  const [desktopAppModalOpen, setDesktopAppModalOpen] = useState(false);
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null);

  const themeIcon =
    settings.themeMode === 'dark' ? (
      <DarkMode fontSize="small" />
    ) : settings.themeMode === 'light' ? (
      <LightMode fontSize="small" />
    ) : (
      <SettingsBrightness fontSize="small" />
    );

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
      <CompanionHelper open={companionOpen} onClose={() => setCompanionOpen(false)} />
      <DesktopAppDownloadModal open={desktopAppModalOpen} onClose={() => setDesktopAppModalOpen(false)} />
      <Stack sx={{ width: 'min(90vw, 600px)', height: '100%' }}>
        {/* Header */}
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700, mr: 2 }}>
            {LL.SETTINGS.SETTINGS()}
          </Typography>

          {/* Quick actions toolbar */}
          <Tooltip title={LL.SETTINGS.EXPORT_BUTTON()}>
            <IconButton size="small" onClick={() => exportSettings()}>
              <ExportIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.SETTINGS.IMPORT_BUTTON()}>
            <IconButton
              size="small"
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
              <ImportIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.COMPANION.HELPER_TITLE()}>
            <IconButton size="small" onClick={() => setCompanionOpen(true)}>
              <CableIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.SETTINGS.THEME()}>
            <IconButton size="small" onClick={() => dispatch(toggleTheme())}>
              {themeIcon}
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.COMMON.LANGUAGE()}>
            <IconButton size="small" onClick={(e) => setLangAnchor(e.currentTarget)}>
              <LanguageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={langAnchor} open={Boolean(langAnchor)} onClose={() => setLangAnchor(null)}>
            <MenuItem
              onClick={() => {
                updateSetting('uiLanguage', 'en');
                setLangAnchor(null);
              }}
              selected={settings.uiLanguage === 'en' || !settings.uiLanguage}
            >
              {LL.HEADER.LANGUAGE_EN()}
            </MenuItem>
            <MenuItem
              onClick={() => {
                updateSetting('uiLanguage', 'de');
                setLangAnchor(null);
              }}
              selected={settings.uiLanguage === 'de'}
            >
              {LL.HEADER.LANGUAGE_DE()}
            </MenuItem>
          </Menu>

          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <IconButton onClick={() => props.setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Search */}
        <Box sx={{ px: 2, py: 1 }}>
          <TextField size="small" fullWidth placeholder={LL.SETTINGS.FILTER()} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </Box>

        <Stack sx={{ flex: 1, overflow: 'auto', px: 1 }}>
          {/* Setting groups */}
          {GROUP_ORDER.filter((g) => groups[g] && groups[g].length > 0).map((groupName) => (
            <Accordion key={groupName} defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography
                  sx={{
                    fontWeight: 600,
                  }}
                >
                  {getGroupLabel(groupName)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {/* Global Style selector — inside General group */}
                  {groupName === 'General' && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: 'center',
                        py: 0.5,
                      }}
                    >
                      <Tooltip title={LL.SETTINGS.GLOBAL_STYLE_HINT()}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {LL.SETTINGS.GLOBAL_STYLE()}
                        </Typography>
                      </Tooltip>
                      <Box sx={{ flex: 1 }}>
                        <Select
                          size="small"
                          fullWidth
                          value={accountSettings?.defaultStyleId ?? settings.globalStyleId ?? 0}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            updateSetting('globalStyleId', id);
                            if (!settings.offlineMode) {
                              updateAccountSettings({ defaultStyleId: id || null });
                            }
                          }}
                        >
                          <MenuItem value={0}>{LL.STYLE.NONE()}</MenuItem>
                          {styles.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                    </Stack>
                  )}
                  {groups[groupName].map((config) => (
                    <SettingRow key={config.key} config={config} value={settings[config.key] as string} />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}

          {/* Keyboard Mapping */}
          {(!filterLower ||
            LL.KEYBOARD.MAPPING().toLowerCase().includes(filterLower) ||
            LL.SETTINGS.GROUP_KEYBOARD().toLowerCase().includes(filterLower)) && (
            <Accordion defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography
                  sx={{
                    fontWeight: 600,
                  }}
                >
                  {LL.SETTINGS.GROUP_KEYBOARD()}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <KeyboardMappingEditor />
              </AccordionDetails>
            </Accordion>
          )}

          {/* Desktop App Download — hidden inside Electron */}
          {(!filterLower || LL.DESKTOP_APP.SETTINGS_SECTION().toLowerCase().includes(filterLower)) &&
            !(typeof window !== 'undefined' && !!(window as { api?: unknown }).api) && (
              <Accordion defaultExpanded={false}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography
                    sx={{
                      fontWeight: 600,
                    }}
                  >
                    {LL.DESKTOP_APP.SETTINGS_SECTION()}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => setDesktopAppModalOpen(true)}>
                      {LL.DESKTOP_APP.SETTINGS_DOWNLOAD()}
                    </Button>
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
const SettingRow = ({ config, value }: { config: SettingConfig; value: string | number }) => {
  const { LL } = useI18nContext();
  const updateSetting = useUpdateSetting();

  const getLabel = (cfg: SettingConfig) => {
    switch (cfg.key) {
      case 'backendUrl':
        return LL.SETTINGS.OPTIONS.BACKEND_URL.TITLE();
      case 'showSaveFormat':
        return LL.SETTINGS.OPTIONS.SHOW_TITLE_TEMPLATE.TITLE();
      case 'songClick':
        return LL.SETTINGS.OPTIONS.SONG_CLICK_BEHAVIOUR.TITLE();
      case 'verseClick':
        return LL.SETTINGS.OPTIONS.VERSE_CLICK_BEHAVIOUR.TITLE();
      case 'defaultNewVerseName':
        return LL.SETTINGS.OPTIONS.DEFAULT_NEW_VERSE_NAME.TITLE();
      case 'defaultVerseName':
        return LL.SETTINGS.OPTIONS.DEFAULT_VERSE_NAME.TITLE();
      case 'overrideSongImport':
        return LL.SETTINGS.OPTIONS.OVERRIDE_SONG_BY_IMPORT.TITLE();
      case 'showDeleteFromDb':
        return LL.SETTINGS.OPTIONS.SHOW_REMOVE_SONG_FROM_DATABASE.TITLE();
      case 'touchDuration':
        return LL.SETTINGS.OPTIONS.TOUCH_DURATION.TITLE();
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
      case 'transitionMode':
        return LL.SETTINGS.OPTIONS.TRANSITION_MODE.TITLE();
      case 'transitionDuration':
        return LL.SETTINGS.OPTIONS.TRANSITION_DURATION.TITLE();
      case 'hideTransitionMode':
        return LL.SETTINGS.OPTIONS.HIDE_TRANSITION_MODE.TITLE();
      case 'hideTransitionDuration':
        return LL.SETTINGS.OPTIONS.HIDE_TRANSITION_DURATION.TITLE();
      case 'videoFadeDuration':
        return LL.SETTINGS.OPTIONS.VIDEO_FADE_DURATION.TITLE();
      case 'showLicenseNumber':
        return LL.SETTINGS.OPTIONS.SHOW_LICENSE_NUMBER.TITLE();
      case 'mediaPath':
        return LL.SETTINGS.OPTIONS.MEDIA_PATH.TITLE();
      case 'wsPort':
        return LL.SETTINGS.OPTIONS.WS_PORT.TITLE();
      case 'autoCheckUpdates':
        return LL.SETTINGS.OPTIONS.AUTO_CHECK_UPDATES.TITLE();
      case 'restoreWindowsOnStart':
        return LL.SETTINGS.OPTIONS.RESTORE_WINDOWS_ON_START.TITLE();
      default:
        return cfg.label || String(cfg.key);
    }
  };

  const label = getLabel(config);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        py: 0.5,
      }}
    >
      <Tooltip title={config.description || label}>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {label}
        </Typography>
      </Tooltip>
      <Box sx={{ flex: 1 }}>
        {config.type === 'boolean' ? (
          <Switch size="small" checked={Boolean(value)} onChange={(e) => updateSetting(config.key, e.target.checked)} />
        ) : config.type === 'select' && config.values ? (
          <Select size="small" fullWidth value={String(value)} onChange={(e) => updateSetting(config.key, e.target.value)}>
            {config.values.map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </Select>
        ) : config.type === 'color' ? (
          <ColorSwatchButton value={String(value) || '#000000'} onChange={(c) => updateSetting(config.key, c)} />
        ) : config.key === 'mediaPath' ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}
          >
            <SettingInput value={value} type="string" onChange={(v) => updateSetting(config.key, v)} />
            {window.api?.pickDirectory && (
              <Tooltip title={LL.STYLE.BROWSE()}>
                <IconButton
                  size="small"
                  onClick={async () => {
                    const dir = await window.api.pickDirectory({ title: LL.SETTINGS.OPTIONS.MEDIA_PATH.DESCRIPTION() });
                    if (dir) {
                      updateSetting('mediaPath', dir);
                    }
                  }}
                >
                  <FolderOpenIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ) : (
          <SettingInput
            value={value}
            type={config.type === 'number' ? 'number' : 'string'}
            onChange={(v) => updateSetting(config.key, v)}
          />
        )}
      </Box>
    </Stack>
  );
};

/** Controlled input with local state for blur-to-save behavior */
const SettingInput = <T extends string | number = string>({
  value,
  type,
  onChange,
}: {
  value: T;
  type: T extends number ? 'number' : 'string';
  onChange: (v: T) => void;
}) => {
  const [localValue, setLocalValue] = useState<string>(String(value));
  useEffect(() => {
    setLocalValue(String(value ?? ''));
  }, [value]);

  return (
    <OutlinedInput
      size="small"
      value={localValue}
      fullWidth
      type={type === 'number' ? 'number' : 'text'}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        onChange((type === 'number' ? Number(localValue) : localValue) as T);
      }}
    />
  );
};
