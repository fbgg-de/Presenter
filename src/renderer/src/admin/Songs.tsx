/**
 * Admin → Songs: browse an account's song library and clean up duplicates.
 *
 * Merging replaces one song by another: the source song is deleted and every *reference* to it
 * (shows, set lists incl. their tags and custom keys) is moved to the kept song first. Song
 * content is never merged — blocks, lyrics, named orders and PDFs of the kept song stay as they
 * are, and the source's own content is discarded with it. See api/AdminSongs.php.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { MergeType as MergeIcon, ContentCopy as DuplicateIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  useGetAdminAccountsQuery,
  useGetAdminSongsQuery,
  useMergeAdminSongsMutation,
  type AdminSong,
  type AdminSongDuplicateGroup,
} from '@/api/admin.api';

/** Reason chips for a duplicate group, translated. */
const useReasonLabels = () => {
  const { LL } = useI18nContext();
  return (reasons: AdminSongDuplicateGroup['reasons']) =>
    reasons.map((reason) => (reason === 'ccli' ? LL.ADMIN_SONGS.REASON_CCLI() : LL.ADMIN_SONGS.REASON_TITLE())).join(', ');
};

export const Songs = () => {
  const { LL } = useI18nContext();
  const reasonLabels = useReasonLabels();

  const { data: accounts = [] } = useGetAdminAccountsQuery();
  const [selectedLicense, setSelectedLicense] = useState<number | ''>('');
  const [filter, setFilter] = useState('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [mergeSource, setMergeSource] = useState<AdminSong | null>(null);

  // Fall back to the first account so the tab is never an empty shell.
  const license: number | '' = selectedLicense !== '' ? selectedLicense : accounts.length > 0 ? accounts[0].license : '';

  const { data: library, isFetching, error } = useGetAdminSongsQuery({ license: license === '' ? 0 : license }, { skip: license === '' });

  const songs = useMemo(() => library?.songs ?? [], [library]);
  const groups = useMemo(() => library?.groups ?? [], [library]);

  /** songNumber → its duplicate group, for the badge column and the merge dialog's suggestions. */
  const groupBySong = useMemo(() => {
    const map = new Map<number, AdminSongDuplicateGroup>();
    groups.forEach((group) => group.songNumbers.forEach((number) => map.set(number, group)));
    return map;
  }, [groups]);

  const visibleSongs = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return songs.filter((song) => {
      if (onlyDuplicates && !groupBySong.has(song.songNumber)) return false;
      if (!needle) return true;
      return (
        song.title.toLowerCase().includes(needle) ||
        song.authors.toLowerCase().includes(needle) ||
        String(song.songNumber).includes(needle) ||
        (song.ccliNumber ?? '').toLowerCase().includes(needle)
      );
    });
  }, [songs, filter, onlyDuplicates, groupBySong]);

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6">{LL.ADMIN_SONGS.TITLE()}</Typography>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel>{LL.ADMIN_SONGS.ACCOUNT()}</InputLabel>
          <Select value={license} label={LL.ADMIN_SONGS.ACCOUNT()} onChange={(e) => setSelectedLicense(e.target.value as number)}>
            {accounts.map((account) => (
              <MenuItem key={account.license} value={account.license}>
                {account.name || account.mail} (#{account.license})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label={LL.ADMIN_SONGS.FILTER()}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ minWidth: 280, flex: 1 }}
        />
        <FormControlLabel
          control={<Switch checked={onlyDuplicates} onChange={(e) => setOnlyDuplicates(e.target.checked)} />}
          label={LL.ADMIN_SONGS.ONLY_DUPLICATES()}
        />
        {isFetching && <CircularProgress size={20} />}
      </Stack>

      {license === '' ? (
        <Alert severity="info">{LL.ADMIN_SONGS.SELECT_ACCOUNT()}</Alert>
      ) : error ? (
        <Alert severity="error">{LL.ADMIN_SONGS.FAILED_TO_LOAD()}</Alert>
      ) : (
        <>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip size="small" label={LL.ADMIN_SONGS.SONG_COUNT({ count: songs.length })} />
            {groups.length > 0 && (
              <Chip size="small" color="warning" icon={<DuplicateIcon />} label={LL.ADMIN_SONGS.GROUP_COUNT({ count: groups.length })} />
            )}
          </Stack>

          {songs.length === 0 ? (
            <Alert severity="info">{LL.ADMIN_SONGS.NO_SONGS()}</Alert>
          ) : visibleSongs.length === 0 ? (
            <Alert severity="info">{LL.ADMIN_SONGS.NO_MATCHES()}</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{LL.ADMIN_SONGS.COL_NUMBER()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_TITLE()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_AUTHORS()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_CCLI()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_KEY()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_CONTENT()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_USAGE()}</TableCell>
                    <TableCell>{LL.ADMIN_SONGS.COL_DUPLICATE()}</TableCell>
                    <TableCell>{LL.COMMON.ACTIONS()}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleSongs.map((song) => {
                    const group = groupBySong.get(song.songNumber);
                    return (
                      <TableRow key={song.songNumber} hover>
                        <TableCell>{song.songNumber}</TableCell>
                        <TableCell>{song.title}</TableCell>
                        <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.authors}
                        </TableCell>
                        <TableCell>{song.ccliNumber || '—'}</TableCell>
                        <TableCell>{song.key || '—'}</TableCell>
                        <TableCell>
                          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                            <Chip size="small" variant="outlined" label={LL.ADMIN_SONGS.BLOCKS_COUNT({ count: song.blockCount })} />
                            <Chip size="small" variant="outlined" label={LL.ADMIN_SONGS.ORDERS_COUNT({ count: song.orderCount })} />
                            {song.pdfCount > 0 && (
                              <Chip size="small" variant="outlined" label={LL.ADMIN_SONGS.PDFS_COUNT({ count: song.pdfCount })} />
                            )}
                            {song.annotationCount > 0 && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={LL.ADMIN_SONGS.ANNOTATIONS_COUNT({ count: song.annotationCount })}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {song.shows.length === 0 && song.setLists.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              {LL.ADMIN_SONGS.NOT_USED()}
                            </Typography>
                          ) : (
                            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                              {song.shows.length > 0 && (
                                <Tooltip title={song.shows.join(', ')}>
                                  <Chip size="small" label={LL.ADMIN_SONGS.SHOWS_COUNT({ count: song.shows.length })} />
                                </Tooltip>
                              )}
                              {song.setLists.length > 0 && (
                                <Tooltip title={song.setLists.join(', ')}>
                                  <Chip size="small" label={LL.ADMIN_SONGS.SET_LISTS_COUNT({ count: song.setLists.length })} />
                                </Tooltip>
                              )}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell>
                          {group && (
                            <Tooltip title={reasonLabels(group.reasons)}>
                              <Chip size="small" color="warning" label={LL.ADMIN_SONGS.GROUP_BADGE({ id: group.id })} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title={LL.ADMIN_SONGS.MERGE()}>
                            <IconButton size="small" onClick={() => setMergeSource(song)}>
                              <MergeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Keyed by the source song so a freshly opened dialog never shows the previous pick. */}
      <MergeDialog
        key={mergeSource?.songNumber ?? 'none'}
        license={license === '' ? 0 : license}
        source={mergeSource}
        songs={songs}
        group={mergeSource ? (groupBySong.get(mergeSource.songNumber) ?? null) : null}
        onClose={() => setMergeSource(null)}
      />
    </Stack>
  );
};

/**
 * Pick the song to keep, preview the exact effect (a rolled-back dry run on the server), then
 * commit. The preview is what makes this safe to use: it names every show and set list touched.
 */
const MergeDialog = ({
  license,
  source,
  songs,
  group,
  onClose,
}: {
  license: number;
  source: AdminSong | null;
  songs: AdminSong[];
  group: AdminSongDuplicateGroup | null;
  onClose: () => void;
}) => {
  const { LL } = useI18nContext();
  const [target, setTarget] = useState<AdminSong | null>(null);
  const [mergeFailed, setMergeFailed] = useState<string | null>(null);
  // Two hook instances: one owns the dry-run state, the other the real merge, so a preview
  // in flight never overwrites the outcome of the commit (and vice versa).
  const [previewMerge, previewState] = useMergeAdminSongsMutation();
  const [merge, { isLoading: isMerging }] = useMergeAdminSongsMutation();

  // Only trust a dry run that belongs to the currently selected target — while a newer one is in
  // flight the hook still holds the previous result (or its error).
  const isCurrent = !!target && previewState.originalArgs?.targetNumber === target.songNumber;
  const preview = isCurrent ? previewState.data : undefined;
  const previewFailed = isCurrent && previewState.isError;
  const isPreviewing = !!target && !preview && !previewFailed;

  // Suggested first: the other members of the same duplicate group.
  const options = useMemo(() => {
    if (!source) return [];
    const rank = (song: AdminSong) => (group?.songNumbers.includes(song.songNumber) ? 0 : 1);
    return songs
      .filter((song) => song.songNumber !== source.songNumber)
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [songs, source, group]);

  // Refresh the dry run whenever the target changes, so the preview always matches the choice.
  // Deps must stay identity-stable: the mutation's own `reset`/promise change on every trigger,
  // and depending on them turns this into an abort-and-retrigger loop.
  useEffect(() => {
    if (!source || !target) return;
    previewMerge({ license, sourceNumber: source.songNumber, targetNumber: target.songNumber, dryRun: true });
  }, [license, source, target, previewMerge]);

  const handleMerge = async () => {
    if (!source || !target) return;
    try {
      await merge({ license, sourceNumber: source.songNumber, targetNumber: target.songNumber }).unwrap();
      onClose();
    } catch (err) {
      const message = err != null && typeof err === 'object' && 'data' in err ? (err as { data?: { message?: string } }).data?.message : '';
      setMergeFailed(message || LL.ADMIN_SONGS.MERGE_FAILED());
    }
  };

  const nothingToMove =
    !!preview &&
    preview.shows.repointed.length === 0 &&
    preview.shows.dropped.length === 0 &&
    preview.setLists.repointed.length === 0 &&
    preview.setLists.dropped.length === 0;

  return (
    <Dialog open={!!source} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{LL.ADMIN_SONGS.MERGE_TITLE({ number: source?.songNumber ?? 0 })}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <Typography variant="body2">
            {LL.ADMIN_SONGS.MERGE_INTRO({ title: source?.title ?? '', number: source?.songNumber ?? 0 })}
          </Typography>
          <Alert severity="info">{LL.ADMIN_SONGS.MERGE_UNTOUCHED()}</Alert>

          <Autocomplete
            options={options}
            value={target}
            onChange={(_e, value) => setTarget(value)}
            getOptionLabel={(song) => `#${song.songNumber} — ${song.title}`}
            isOptionEqualToValue={(a, b) => a.songNumber === b.songNumber}
            groupBy={(song) => (group?.songNumbers.includes(song.songNumber) ? LL.ADMIN_SONGS.SUSPECTED_DUPLICATE() : '')}
            renderOption={(props, song) => (
              <Box component="li" {...props} key={song.songNumber}>
                <Stack>
                  <Typography variant="body2">
                    #{song.songNumber} — {song.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {song.authors}
                    {song.ccliNumber ? ` · CCLI ${song.ccliNumber}` : ''}
                  </Typography>
                </Stack>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label={LL.ADMIN_SONGS.MERGE_TARGET()}
                helperText={LL.ADMIN_SONGS.MERGE_TARGET_HELP({ number: source?.songNumber ?? 0 })}
              />
            )}
          />

          {target && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {LL.ADMIN_SONGS.PREVIEW_TITLE()}
              </Typography>
              {isPreviewing ? (
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">{LL.ADMIN_SONGS.PREVIEW_LOADING()}</Typography>
                </Stack>
              ) : previewFailed ? (
                <Alert severity="error">{LL.ADMIN_SONGS.PREVIEW_FAILED()}</Alert>
              ) : preview ? (
                <Stack sx={{ gap: 1 }}>
                  {nothingToMove && <Typography variant="body2">{LL.ADMIN_SONGS.PREVIEW_NO_REFERENCES()}</Typography>}
                  {preview.shows.repointed.length > 0 && (
                    <Typography variant="body2">
                      {LL.ADMIN_SONGS.PREVIEW_SHOWS_REPOINTED({ list: preview.shows.repointed.join(', ') })}
                    </Typography>
                  )}
                  {preview.shows.dropped.length > 0 && (
                    <Typography variant="body2">
                      {LL.ADMIN_SONGS.PREVIEW_SHOWS_DROPPED({ list: preview.shows.dropped.join(', ') })}
                    </Typography>
                  )}
                  {preview.setLists.repointed.length > 0 && (
                    <Typography variant="body2">
                      {LL.ADMIN_SONGS.PREVIEW_SET_LISTS_REPOINTED({ list: preview.setLists.repointed.join(', ') })}
                    </Typography>
                  )}
                  {preview.setLists.dropped.length > 0 && (
                    <Typography variant="body2">
                      {LL.ADMIN_SONGS.PREVIEW_SET_LISTS_DROPPED({ list: preview.setLists.dropped.join(', ') })}
                    </Typography>
                  )}
                  {preview.clearedOrderNames > 0 && (
                    <Typography variant="body2" color="warning.main">
                      {LL.ADMIN_SONGS.PREVIEW_CLEARED_ORDERS({ count: preview.clearedOrderNames })}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {LL.ADMIN_SONGS.PREVIEW_DELETED({
                      blocks: preview.deleted.blocks,
                      pdfs: preview.deleted.pdfFiles,
                      annotations: preview.deleted.pdfAnnotations,
                    })}
                  </Typography>
                </Stack>
              ) : null}
            </Paper>
          )}

          <Alert severity="warning">{LL.ADMIN.ACTION_CANNOT_BE_UNDONE()}</Alert>
          {mergeFailed && <Alert severity="error">{mergeFailed}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={handleMerge} color="error" variant="contained" disabled={!target || isMerging || isPreviewing || previewFailed}>
          {LL.ADMIN_SONGS.CONFIRM({ number: source?.songNumber ?? 0 })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
