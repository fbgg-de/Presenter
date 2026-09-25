import { Tooltip } from '@mui/material';
import { ReportProblemOutlined as MissingIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useMediaFileMissing } from '@/media/useMediaFileMissing';

/** A warning on an agenda entry whose file is not in the media folder; nothing otherwise. */
export const MissingMediaFileIcon = ({ path, inverted }: { path: string; inverted?: boolean }) => {
  const { LL } = useI18nContext();
  const missing = useMediaFileMissing(path);
  if (!missing) return null;
  return (
    <Tooltip title={`${LL.AGENDA_DROP.MISSING_FILE()} · ${path}`}>
      <MissingIcon fontSize="small" sx={{ color: inverted ? '#ffd180' : 'warning.main' }} />
    </Tooltip>
  );
};
