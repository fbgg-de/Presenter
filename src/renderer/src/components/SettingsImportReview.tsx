/**
 * Settings Import Review Dialog — shows a diff of settings changes before applying (§7.5).
 * Replaces the simple window.confirm() with a proper MUI dialog.
 */
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Remove as RemoveIcon } from '@mui/icons-material';
import type { SettingsDiff } from '@/utils/settingsExport';
import { useI18nContext } from '@/i18n/i18n-react';

interface SettingsImportReviewProps {
  open: boolean;
  diff: SettingsDiff | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SettingsImportReview = ({ open, diff, onConfirm, onCancel }: SettingsImportReviewProps) => {
  if (!diff) return null;

  const { LL } = useI18nContext();

  const addedCount = Object.keys(diff.added).length;
  const changedCount = Object.keys(diff.changed).length;
  const removedCount = diff.removed.length;
  const totalChanges = addedCount + changedCount;

  const truncate = (val: string, max = 60) => (val.length > max ? val.slice(0, max) + '…' : val);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6">{LL.SETTINGS_IMPORT_REVIEW_TITLE()}</Typography>
          <Stack direction="row" spacing={0.5}>
            {addedCount > 0 && (
              <Chip icon={<AddIcon />} label={LL.SETTINGS_IMPORT_SUMMARY_ADDED({ count: addedCount })} color="success" size="small" />
            )}
            {changedCount > 0 && (
              <Chip icon={<EditIcon />} label={LL.SETTINGS_IMPORT_SUMMARY_CHANGED({ count: changedCount })} color="warning" size="small" />
            )}
            {removedCount > 0 && (
              <Chip
                icon={<RemoveIcon />}
                label={LL.SETTINGS_IMPORT_SUMMARY_REMOVED({ count: removedCount })}
                color="default"
                size="small"
              />
            )}
          </Stack>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {totalChanges === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            {LL.SETTINGS_IMPORT_NO_CHANGES()}
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>{LL.SETTINGS_IMPORT_COL_SETTING()}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{LL.SETTINGS_IMPORT_COL_CHANGE()}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{LL.SETTINGS_IMPORT_COL_CURRENT()}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{LL.SETTINGS_IMPORT_COL_NEW()}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(diff.added).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                        {key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={LL.SETTINGS_IMPORT_TAG_NEW()} size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">
                        {truncate(value)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.entries(diff.changed).map(([key, entry]) => (
                  <TableRow key={key}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                        {key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={LL.SETTINGS_IMPORT_TAG_CHANGED()}
                        size="small"
                        color="warning"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        {truncate(entry.old)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">
                        {truncate(entry.new)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {removedCount > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {LL.SETTINGS_IMPORT_REMOVED_NOTICE({ count: removedCount })}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{LL.CANCEL()}</Button>
        <Button variant="contained" onClick={onConfirm} disabled={totalChanges === 0}>
          {LL.SETTINGS_IMPORT_APPLY({ count: totalChanges })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
