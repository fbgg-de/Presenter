import { Button, Chip, MenuItem, Select, Stack, Switch, Typography } from '@mui/material';
import { Cable as CableIcon, Download as DownloadIcon, FileDownload as ExportIcon, FileUpload as ImportIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { useGetAccountSettingsQuery, useUpdateAccountSettingsMutation } from '@/api/session.api';
import { useMetrics } from '@/hooks/useMetrics';
import { SettingFrame, CommittedInput } from '@/components/settings/SettingRow';
import { useTrackedUpdateSetting } from '@/hooks/useTrackedUpdateSetting';
import { TEMPLATE_VARS } from '@/components/settings/settingsCatalog';
import { REMOTE_COMMAND_IDS, type RemoteCommandId } from '@/utils/remoteCommands';
import { useAccountLanguages } from '@/hooks/useAccountLanguages';
import { languageLabel } from '@/song/languageNames';
import { LanguagePicker } from '@/components/common/LanguagePicker';

/**
 * The blocks of the settings panel that are more than a stored value and a control:
 * settings mirrored to the account, permission lists, and the buttons that open the
 * panel's dialogs. Everything here is rendered through a catalog slot.
 */

/**
 * Global style. Kept in sync with the account so every operator on it presents alike;
 * the local copy is what offline mode falls back to.
 */
export const GlobalStyleRow = () => {
  const { LL } = useI18nContext();
  const settings = useGetSettings();
  const updateSetting = useTrackedUpdateSetting();
  const { trackEvent } = useMetrics();
  const { data: styles = [] } = useGetStylesQuery();
  const { data: accountSettings } = useGetAccountSettingsQuery(undefined, { skip: settings.offlineMode });
  const [updateAccountSettings] = useUpdateAccountSettingsMutation();

  return (
    <SettingFrame
      label={LL.SETTINGS.GLOBAL_STYLE()}
      control={
        <Select
          size="small"
          fullWidth
          value={accountSettings?.defaultStyleId ?? settings.globalStyleId ?? 0}
          onChange={(e) => {
            const id = Number(e.target.value);
            updateSetting('globalStyleId', id);
            trackEvent('style_changed', 'style', String(id), { scope: 'global' });
            if (!settings.offlineMode) {
              updateAccountSettings({ defaultStyleId: id || null });
            }
          }}
        >
          <MenuItem value={0}>{LL.STYLE.NONE()}</MenuItem>
          {styles.map((style) => (
            <MenuItem key={style.id} value={style.id}>
              {style.name}
            </MenuItem>
          ))}
        </Select>
      }
    />
  );
};

/** Show title template — account-synced like the global style, with a local fallback. */
export const ShowTitleTemplateRow = () => {
  const { LL } = useI18nContext();
  const settings = useGetSettings();
  const updateSetting = useTrackedUpdateSetting();
  const { data: accountSettings } = useGetAccountSettingsQuery(undefined, { skip: settings.offlineMode });
  const [updateAccountSettings] = useUpdateAccountSettingsMutation();

  const value = accountSettings?.showTitleTemplate ?? settings.showSaveFormat;

  return (
    <SettingFrame
      label={LL.SETTINGS.OPTIONS.SHOW_TITLE_TEMPLATE.TITLE()}
      description={LL.SETTINGS.OPTIONS.SHOW_TITLE_TEMPLATE.DESCRIPTION(TEMPLATE_VARS)}
      control={
        <CommittedInput
          key={`showSaveFormat-${value}`}
          value={value}
          type="text"
          onCommit={(next) => {
            updateSetting('showSaveFormat', next);
            if (!settings.offlineMode) {
              updateAccountSettings({ showTitleTemplate: next || null });
            }
          }}
        />
      }
    />
  );
};

/**
 * Which commands the mobile control page may trigger. A missing key means allowed, so a
 * command added in a later version is on by default rather than silently dead.
 */
export const RemoteCommandsBlock = () => {
  const { LL } = useI18nContext();
  const { remoteControlCommands } = useGetSettings();
  const updateSetting = useTrackedUpdateSetting();

  const commandLabel = (id: RemoteCommandId): string => {
    switch (id) {
      case 'prev_block':
        return LL.REMOTE.CMD_PREV_BLOCK();
      case 'next_block':
        return LL.REMOTE.CMD_NEXT_BLOCK();
      case 'prev_item':
        return LL.REMOTE.CMD_PREV_ITEM();
      case 'next_item':
        return LL.REMOTE.CMD_NEXT_ITEM();
      case 'toggle_text':
        return LL.REMOTE.CMD_TOGGLE_TEXT();
      case 'toggle_video':
        return LL.REMOTE.CMD_TOGGLE_VIDEO();
      case 'toggle_video_playback':
        return LL.REMOTE.CMD_TOGGLE_VIDEO_PLAYBACK();
      case 'toggle_black':
        return LL.REMOTE.CMD_TOGGLE_BLACK();
    }
  };

  return (
    <Stack>
      {REMOTE_COMMAND_IDS.map((id) => (
        <Stack key={id} direction="row" spacing={2} sx={{ alignItems: 'center', py: 0.25 }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {commandLabel(id)}
          </Typography>
          <Switch
            size="small"
            checked={remoteControlCommands[id] !== false}
            onChange={(e) => updateSetting('remoteControlCommands', { ...remoteControlCommands, [id]: e.target.checked })}
          />
        </Stack>
      ))}
    </Stack>
  );
};

/** The events metrics collects, spelled out next to the switch that turns them off. */
export const PrivacyNoticeBlock = () => {
  const { LL } = useI18nContext();
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', pt: 0.5 }}>
      {LL.SETTINGS.PRIVACY_METRICS_LIST()}
    </Typography>
  );
};

/** Settings export / import. The panel owns the review dialog the import feeds. */
export const BackupBlock = ({ onExport, onImport }: { onExport: () => void; onImport: () => void }) => {
  const { LL } = useI18nContext();
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, pt: 0.5 }}>
      <Button variant="outlined" size="small" startIcon={<ExportIcon />} onClick={onExport}>
        {LL.SETTINGS.EXPORT_BUTTON()}
      </Button>
      <Button variant="outlined" size="small" startIcon={<ImportIcon />} onClick={onImport}>
        {LL.SETTINGS.IMPORT_BUTTON()}
      </Button>
    </Stack>
  );
};

/** Opens the Companion / WebSocket command reference. */
export const CompanionBlock = ({ onOpen }: { onOpen: () => void }) => {
  const { LL } = useI18nContext();
  return (
    <Stack direction="row" sx={{ pt: 0.5 }}>
      <Button variant="outlined" size="small" startIcon={<CableIcon />} onClick={onOpen}>
        {LL.SETTINGS.COMPANION_OPEN()}
      </Button>
    </Stack>
  );
};

/** Offered in the browser build only — the desktop app already is the desktop app. */
export const DesktopDownloadBlock = ({ onOpen }: { onOpen: () => void }) => {
  const { LL } = useI18nContext();
  return (
    <Stack direction="row" sx={{ pt: 0.5 }}>
      <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={onOpen}>
        {LL.DESKTOP_APP.SETTINGS_DOWNLOAD()}
      </Button>
    </Stack>
  );
};

/**
 * The account's song languages: the pool every song's language list is picked from, and the
 * order they are offered in. The first entry is the default a new song starts in.
 *
 * Account-wide rather than per device, because a song saved with a language on one machine has
 * to be editable with that same language on the next. Codes found in songs but never configured
 * are offered as one-click additions rather than silently adopted.
 */
export const SongLanguagesBlock = () => {
  const { LL } = useI18nContext();
  const settings = useGetSettings();
  const { pool, unconfigured, isLoading } = useAccountLanguages();
  const [updateAccountSettings, { isLoading: isSaving }] = useUpdateAccountSettingsMutation();

  const save = (languages: string[]) => {
    // The server rejects an empty pool: with no languages there is nothing to write a song in.
    if (languages.length === 0 || settings.offlineMode) return;
    updateAccountSettings({ languages });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= pool.length) return;

    const next = [...pool];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  return (
    <SettingFrame
      label={LL.SETTINGS.OPTIONS.SONG_LANGUAGES.TITLE()}
      description={LL.SETTINGS.OPTIONS.SONG_LANGUAGES.DESCRIPTION()}
      info={
        // What this list is actually for. Its original job — letting a design name a language —
        // is gone, so without saying what it still does it reads as vestigial; and the detection
        // point is the one that rewards keeping the list short.
        <Stack component="ul" sx={{ m: 0, pl: 2, gap: 0.5 }}>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {LL.SETTINGS.OPTIONS.SONG_LANGUAGES.EFFECT_PICKER()}
          </Typography>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {LL.SETTINGS.OPTIONS.SONG_LANGUAGES.EFFECT_DETECTION()}
          </Typography>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {LL.SETTINGS.OPTIONS.SONG_LANGUAGES.EFFECT_NOT_DESIGNS()}
          </Typography>
        </Stack>
      }
      control={
        <Stack sx={{ gap: 1, width: '100%' }}>
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
            {pool.map((code, index) => (
              <Chip
                key={code}
                size="small"
                color={index === 0 ? 'primary' : 'default'}
                label={`${code}${index === 0 ? ` · ${LL.SONG_EDITOR.DEFAULT_LANGUAGE()}` : ''}`}
                title={languageLabel(code, settings.uiLanguage)}
                onClick={() => move(index, -1)}
                onDelete={pool.length > 1 ? () => save(pool.filter((entry) => entry !== code)) : undefined}
                disabled={isLoading || isSaving}
                sx={{ fontFamily: 'monospace' }}
              />
            ))}
          </Stack>

          <LanguagePicker
            selected={pool}
            onAdd={(code) => save([...pool, code])}
            disabled={isLoading || isSaving || settings.offlineMode}
          />

          {unconfigured.length > 0 && (
            <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                {LL.SETTINGS.OPTIONS.SONG_LANGUAGES.FOUND_IN_SONGS()}
              </Typography>
              {unconfigured.map((code) => (
                <Chip
                  key={code}
                  size="small"
                  variant="outlined"
                  label={code}
                  onClick={() => save([...pool, code])}
                  disabled={isSaving || settings.offlineMode}
                  sx={{ fontFamily: 'monospace' }}
                />
              ))}
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            {LL.SETTINGS.OPTIONS.SONG_LANGUAGES.REORDER_HINT()}
          </Typography>
        </Stack>
      }
    />
  );
};
