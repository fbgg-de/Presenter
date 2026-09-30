import { Alert, AlertTitle, Button, Stack, type SxProps, type Theme } from '@mui/material';
import { Refresh as RetryIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { mediaSourceSetting, openSettings } from '@/components/settings/openSettings';
import { useNextcloud } from '@/nextcloud/connection';
import { isElectronApp } from '@/utils';
import type { MediaFolderIssue } from '@/media/useMediaFolder';

/**
 * In place of "Failed to fetch": what is wrong with the media folder, in words, and a button
 * straight to where it is set up — Settings → Library → Media in the desktop app; in the browser,
 * whose media comes from Nextcloud, Settings → Connections → Nextcloud. `onRetry` adds Try again,
 * for a view that does not reload by itself once it is fixed.
 */
export const MediaFolderNotice = ({
  issue,
  address,
  onRetry,
  sx,
}: {
  issue: MediaFolderIssue;
  /** Where the media folder was asked for (host and port), for `unreachable`. */
  address?: string;
  onRetry?: () => void;
  sx?: SxProps<Theme>;
}) => {
  const { LL } = useI18nContext();
  const M = LL.MEDIA;
  const { mediaPath } = useGetSettings('mediaPath');
  const nextcloud = useNextcloud();
  const web = !isElectronApp();
  const [title, text, button] = web
    ? issue === 'unset'
      ? nextcloud
        ? [M.NEXTCLOUD_NO_FOLDER_TITLE(), M.NEXTCLOUD_NO_FOLDER(), M.NEXTCLOUD_CHOOSE()]
        : [M.NEXTCLOUD_UNSET_TITLE(), M.NEXTCLOUD_UNSET(), M.NEXTCLOUD_CONNECT()]
      : [M.NEXTCLOUD_UNREACHABLE_TITLE(), M.NEXTCLOUD_UNREACHABLE({ address: address ?? nextcloud?.server ?? '' }), M.NEXTCLOUD_SETTING()]
    : issue === 'unset'
      ? [M.FOLDER_UNSET_TITLE(), M.FOLDER_UNSET(), M.FOLDER_SET_UP()]
      : issue === 'missing'
        ? [M.FOLDER_MISSING_TITLE(), M.FOLDER_MISSING({ path: mediaPath ?? '' }), M.FOLDER_OPEN_SETTING()]
        : [M.FOLDER_UNREACHABLE_TITLE(), M.FOLDER_UNREACHABLE({ address: address ?? mediaPath ?? '' }), M.FOLDER_OPEN_SETTING()];
  return (
    <Alert severity={issue === 'unset' ? 'info' : 'warning'} sx={sx}>
      <AlertTitle>{title}</AlertTitle>
      {text}
      {/* Under the text, not beside it: in a narrow card, buttons at the side squeeze it to a strip. */}
      <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          startIcon={<SettingsIcon />}
          onClick={() => openSettings(mediaSourceSetting())}
        >
          {button}
        </Button>
        {onRetry && (
          <Button color="inherit" size="small" startIcon={<RetryIcon />} onClick={onRetry}>
            {M.RETRY()}
          </Button>
        )}
      </Stack>
    </Alert>
  );
};
