/**
 * Editor for one Set List Entry's Tag Assignments.
 *
 * Each row is a Tag Assignment: a tag name plus the playback metadata that applies in that
 * tag's context. Key and block order live per assignment, so the same song can be prepared
 * differently for e.g. `Christmas` and `Fast`.
 *
 * Block orders are picked from the names the song already has — set lists must not introduce
 * new block-order names, so that input is a closed Autocomplete rather than freeSolo.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, DeleteOutlined as DeleteIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useLazyGetSongQuery } from '@/api/songs.api';
import { MUSICAL_KEYS } from '@/utils/orderKeyUtils';
import type { SetListEntry, SetListTagInput } from '@/api/setLists.api';

interface SetListTagEditorProps {
  open: boolean;
  onClose: () => void;
  entry: SetListEntry | null;
  /** Tags already used anywhere in the active set list — offered as suggestions. */
  knownTags: string[];
  /** Keys already used in the active set list, merged ahead of the standard musical keys. */
  knownKeys: string[];
  onSave: (tags: SetListTagInput[]) => Promise<void> | void;
}

type DraftTag = SetListTagInput & { rowId: string };

const makeRowId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const SetListTagEditor = ({ open, onClose, entry, knownTags, knownKeys, onSave }: SetListTagEditorProps) => {
  const { LL } = useI18nContext();
  const [draft, setDraft] = useState<DraftTag[]>([]);
  const [saving, setSaving] = useState(false);
  /** Order names of the referenced song — the only valid blockOrderName values. */
  const [orderNames, setOrderNames] = useState<string[]>([]);
  const [fetchSong] = useLazyGetSongQuery();

  // Seed the draft from the entry each time the dialog opens. An entry with no tags yet opens
  // on a blank row so the first tag can be typed straight away — the common case for a song
  // that was just added, where an extra "Add tag" click is pure friction.
  useEffect(() => {
    if (!open || !entry) return;
    setDraft(
      entry.tags.length > 0
        ? entry.tags.map((t) => ({
            rowId: makeRowId(),
            tagName: t.tagName,
            customKey: t.customKey ?? '',
            blockOrderName: t.blockOrderName ?? '',
          }))
        : [{ rowId: makeRowId(), tagName: '', customKey: '', blockOrderName: '' }],
    );
  }, [open, entry]);

  // Load the song's existing order names for the block-order picker.
  useEffect(() => {
    if (!open || !entry) return;
    let cancelled = false;
    fetchSong({ songNumber: entry.songNumber })
      .unwrap()
      .then((song) => {
        if (cancelled) return;
        setOrderNames(Object.keys(song?.order ?? {}));
      })
      .catch(() => {
        if (!cancelled) setOrderNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entry, fetchSong]);

  const keyOptions = useMemo(() => Array.from(new Set([...knownKeys, ...MUSICAL_KEYS])), [knownKeys]);

  const updateRow = (rowId: string, patch: Partial<SetListTagInput>) =>
    setDraft((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const trimmedNames = draft.map((r) => r.tagName.trim());
  // The backend keys assignments on (entry, tag), so a duplicate name would silently collapse.
  const hasDuplicate = trimmedNames.some((n, i) => n !== '' && trimmedNames.indexOf(n) !== i);
  const hasEmpty = trimmedNames.some((n) => n === '');
  const canSave = !saving && !hasDuplicate && !hasEmpty;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        draft.map((r) => ({
          tagName: r.tagName.trim(),
          customKey: r.customKey?.trim() ? r.customKey.trim() : null,
          blockOrderName: r.blockOrderName?.trim() ? r.blockOrderName.trim() : null,
        })),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {LL.SET_LISTS.TAGS_TITLE()}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {entry?.songTitle ?? `#${entry?.songNumber ?? ''}`}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {draft.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {LL.SET_LISTS.TAGS_EMPTY()}
            </Typography>
          )}

          {draft.map((row, rowIndex) => (
            <Stack key={row.rowId} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <Autocomplete
                freeSolo
                options={knownTags}
                value={row.tagName}
                onInputChange={(_e, value) => updateRow(row.rowId, { tagName: value })}
                sx={{ flex: 2, minWidth: 140 }}
                renderInput={(params) => (
                  // Focus the first tag field on open so a new tag can be typed without a click.
                  <TextField {...params} size="small" label={LL.SET_LISTS.TAG_NAME()} autoFocus={rowIndex === 0 && !row.tagName} />
                )}
              />
              <Autocomplete
                freeSolo
                options={keyOptions}
                value={row.customKey ?? ''}
                onInputChange={(_e, value) => updateRow(row.rowId, { customKey: value })}
                sx={{ flex: 1, minWidth: 110 }}
                renderInput={(params) => <TextField {...params} size="small" label={LL.SET_LISTS.TAG_KEY()} />}
              />
              <Autocomplete
                options={orderNames}
                value={row.blockOrderName || null}
                onChange={(_e, value) => updateRow(row.rowId, { blockOrderName: value ?? '' })}
                sx={{ flex: 2, minWidth: 140 }}
                noOptionsText={LL.SET_LISTS.NO_ORDERS()}
                renderInput={(params) => <TextField {...params} size="small" label={LL.SET_LISTS.TAG_ORDER()} />}
              />
              <Tooltip title={LL.SET_LISTS.TAG_REMOVE()}>
                <IconButton size="small" onClick={() => setDraft((rows) => rows.filter((r) => r.rowId !== row.rowId))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}

          <Box>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setDraft((rows) => [...rows, { rowId: makeRowId(), tagName: '', customKey: '', blockOrderName: '' }])}
            >
              {LL.SET_LISTS.TAG_ADD()}
            </Button>
          </Box>

          {hasDuplicate && (
            <Typography variant="caption" color="error">
              {LL.SET_LISTS.TAG_DUPLICATE()}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={!canSave}>
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
