import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Button,
  DialogActions,
  Chip,
  Stack,
  Tooltip,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  SortByAlpha as SortByAlphaIcon,
  Tag as SortByNumberIcon,
  Numbers as CcliIcon,
  Translate as TranslateIcon,
} from '@mui/icons-material';
import { useGetSongsAllQuery, useDeleteSongMutation, useRenumberSongMutation } from '@/api/songs.api';
import { useI18nContext } from '@/i18n/i18n-react';
import type { SongListItem } from '@/api/songs.api';
import { SONG_CUSTOM_NUMBER_LIMIT } from '@/song';
import { useGetSettings } from '@/store/settingsSlice';
import { useMetrics } from '@/hooks/useMetrics';
import { useIsMobile } from '@/hooks/useIsMobile';
import { RowActionMenu } from '@/components/common/RowActionMenu';
import { SongLanguageReview } from '@/components/song/SongLanguageReview';

type SortOrder = 'lexicographic' | 'numeric';

type Props = {
  open: boolean;
  onClose: () => void;
  onSongSelected: (song: SongListItem) => void;
};

export const SongLibrary = ({ open, onClose, onSongSelected }: Props) => {
  const { LL } = useI18nContext();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('lexicographic');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [songToDelete, setSongToDelete] = useState<SongListItem | null>(null);
  const [languageReviewOpen, setLanguageReviewOpen] = useState(false);

  const { showDeleteFromDb } = useGetSettings();

  const { data: allSongs, isLoading } = useGetSongsAllQuery({ order: sortOrder });
  const [deleteSong, { isLoading: isDeleting }] = useDeleteSongMutation();
  const [renumberSong, { isLoading: isRenumbering }] = useRenumberSongMutation();
  const { trackEvent } = useMetrics();

  // "Set CCLI number" dialog (custom songs only).
  const [ccliSong, setCcliSong] = useState<SongListItem | null>(null);
  const [ccliInput, setCcliInput] = useState('');
  const [ccliError, setCcliError] = useState<string | null>(null);

  const handleSetCcli = async () => {
    if (!ccliSong) return;
    const newNumber = parseInt(ccliInput.trim(), 10);
    if (!Number.isInteger(newNumber) || newNumber < SONG_CUSTOM_NUMBER_LIMIT) {
      setCcliError(LL.SONGS.CCLI_INVALID({ min: SONG_CUSTOM_NUMBER_LIMIT }));
      return;
    }
    const oldNumber = ccliSong.songNumber;
    try {
      const res = await renumberSong({ oldNumber, newNumber }).unwrap();
      trackEvent('song_renumbered', 'song', String(newNumber), {
        ok: true,
        oldNumber,
        newNumber,
        showsUpdated: res.showsUpdated ?? 0,
      });
      setCcliSong(null);
      setCcliInput('');
      setCcliError(null);
    } catch (err) {
      const msg = err != null && typeof err === 'object' && 'data' in err ? (err as { data?: { message?: string } }).data?.message : '';
      trackEvent('song_renumbered', 'song', String(oldNumber), { ok: false, oldNumber, newNumber, error: msg || 'error' });
      setCcliError(msg || LL.SONGS.CCLI_FAILED());
    }
  };

  const filteredSongs = allSongs?.filter(
    (song) =>
      song.title.toLowerCase().includes(filter.toLowerCase()) ||
      song.songNumber.toString().includes(filter) ||
      (song.authors?.toLowerCase().includes(filter.toLowerCase()) ?? false),
  );

  const handleDelete = async () => {
    if (songToDelete) {
      try {
        await deleteSong({ songNumber: songToDelete.songNumber }).unwrap();
        trackEvent('song_deleted', 'song', String(songToDelete.songNumber));
        setDeleteConfirmOpen(false);
        setSongToDelete(null);
      } catch (error) {
        console.error('Failed to delete song:', error);
      }
    }
  };

  return (
    <>
      <SongLanguageReview open={languageReviewOpen} onClose={() => setLanguageReviewOpen(false)} />
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        // A phone has no room for a dialog inside a dialog — take the whole screen.
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="span" noWrap sx={{ minWidth: 0 }}>
            {LL.SONGS.LIBRARY()}
          </Typography>
          {filteredSongs && <Chip label={filteredSongs.length} size="small" variant="outlined" sx={{ flexShrink: 0 }} />}
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <ToggleButtonGroup
            value={sortOrder}
            exclusive
            onChange={(_e, val) => val && setSortOrder(val)}
            size="small"
            sx={{ mr: { xs: 0, sm: 1 }, flexShrink: 0 }}
          >
            <ToggleButton value="lexicographic">
              <Tooltip title={LL.SONGS.SORT_BY_NAME()}>
                <SortByAlphaIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="numeric">
              <Tooltip title={LL.SONGS.SORT_BY_NUMBER()}>
                <SortByNumberIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        {/* Column layout so the list — not the dialog — owns the scrolling and can fill a
            full-screen phone instead of stopping at 60% of it. */}
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, px: { xs: 2, sm: 3 } }}>
          <TextField
            fullWidth
            placeholder={LL.SONGS.FILTER()}
            variant="outlined"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="small"
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            size="small"
            variant="outlined"
            startIcon={<TranslateIcon />}
            onClick={() => setLanguageReviewOpen(true)}
            sx={{ alignSelf: 'flex-start', mb: 2 }}
          >
            {LL.SONG_LANGUAGE_REVIEW.OPEN()}
          </Button>

          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                py: 4,
              }}
            >
              <CircularProgress />
            </Box>
          ) : filteredSongs && filteredSongs.length > 0 ? (
            <List dense sx={{ flex: 1, minHeight: 0, maxHeight: { xs: 'none', sm: '60vh' }, overflow: 'auto' }}>
              {filteredSongs.map((song) => (
                <ListItem
                  key={song.songNumber}
                  disablePadding
                  // The actions are absolutely positioned; without this the row text slides
                  // underneath them on a narrow screen.
                  sx={{ '& > .MuiListItemButton-root': { pr: isMobile || !showDeleteFromDb ? '48px' : '84px' } }}
                  secondaryAction={
                    isMobile ? (
                      <RowActionMenu
                        actions={[
                          {
                            key: 'ccli',
                            label: LL.SONGS.SET_CCLI(),
                            icon: <CcliIcon fontSize="small" />,
                            onClick: () => {
                              setCcliSong(song);
                              setCcliInput('');
                              setCcliError(null);
                            },
                            // Custom songs can be promoted to a CCLI number; real ones already have one.
                            hidden: song.songNumber >= SONG_CUSTOM_NUMBER_LIMIT,
                          },
                          {
                            key: 'delete',
                            label: LL.COMMON.DELETE(),
                            icon: <DeleteIcon fontSize="small" />,
                            onClick: () => {
                              setSongToDelete(song);
                              setDeleteConfirmOpen(true);
                            },
                            destructive: true,
                            hidden: !showDeleteFromDb,
                          },
                        ]}
                      />
                    ) : (
                      <Stack direction="row" spacing={0.5}>
                        {/* Custom songs can be promoted to a CCLI number. */}
                        {song.songNumber < SONG_CUSTOM_NUMBER_LIMIT && (
                          <Tooltip title={LL.SONGS.SET_CCLI()}>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCcliSong(song);
                                setCcliInput('');
                                setCcliError(null);
                              }}
                            >
                              <CcliIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {showDeleteFromDb && (
                          <Tooltip title={LL.COMMON.DELETE()}>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSongToDelete(song);
                                setDeleteConfirmOpen(true);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    )
                  }
                >
                  <ListItemButton onClick={() => onSongSelected(song)} sx={{ gap: { xs: 1, sm: 1.5 }, py: 0.75, minWidth: 0 }}>
                    {/* Desktop keeps the number as a leading column to scan by. On a phone that
                        column costs the title real width for a nice-to-know, so there the chip
                        moves down to the detail line (rendered below). */}
                    {!isMobile && (
                      <Chip
                        label={`#${song.songNumber}`}
                        size="small"
                        variant="outlined"
                        color="primary"
                        sx={{ fontWeight: 600, fontSize: '0.75rem', minWidth: 56, flexShrink: 0 }}
                      />
                    )}
                    <ListItemText
                      primary={
                        // One line per row on desktop; on a phone the title keeps the first line
                        // to itself and the details drop underneath rather than being clipped.
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={{ xs: 0, sm: 1 }}
                          sx={{
                            alignItems: { xs: 'flex-start', sm: 'center' },
                            minWidth: 0,
                          }}
                        >
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              fontWeight: 500,
                              flexShrink: 1,
                              minWidth: 0,
                              maxWidth: '100%',
                            }}
                          >
                            {song.title}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
                            {isMobile && (
                              <Chip
                                label={`#${song.songNumber}`}
                                size="small"
                                variant="outlined"
                                color="primary"
                                sx={{ fontWeight: 600, fontSize: '0.65rem', height: 18, flexShrink: 0 }}
                              />
                            )}
                            {song.authors && song.authors !== 'Unknown' && (
                              <Typography
                                variant="caption"
                                noWrap
                                sx={{
                                  color: 'text.secondary',
                                  flexShrink: 1,
                                  minWidth: 0,
                                }}
                              >
                                {song.authors}
                              </Typography>
                            )}
                            {Number(song.orderCount ?? 0) > 0 && (
                              <Chip
                                label={LL.SONG_EDITOR.ORDERS_COUNT({ count: song.orderCount! })}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.65rem', height: 18, flexShrink: 0 }}
                              />
                            )}
                          </Stack>
                        </Stack>
                      }
                      slotProps={{
                        primary: { component: 'div' },
                      }}
                      sx={{ minWidth: 0, my: 0 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                py: 4,
              }}
            >
              <Typography
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.SONGS.NO_FOUND()}
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => !isDeleting && setDeleteConfirmOpen(false)}>
        <DialogTitle>{LL.SONGS.CONFIRM_DELETE()}</DialogTitle>
        <DialogContent>
          <Typography>
            {LL.SONGS.CONFIRM_DELETE_MESSAGE({
              title: songToDelete?.title || '',
              number: songToDelete?.songNumber || 0,
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting}>
            {LL.COMMON.CANCEL()}
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={isDeleting}>
            {isDeleting ? <CircularProgress size={20} /> : LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Set CCLI number (renumber a custom song) */}
      <Dialog open={!!ccliSong} onClose={() => !isRenumbering && setCcliSong(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{LL.SONGS.SET_CCLI()}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {LL.SONGS.SET_CCLI_DESC({ title: ccliSong?.title || '', number: ccliSong?.songNumber || 0 })}
            </Typography>
            <TextField
              autoFocus
              size="small"
              type="number"
              label={LL.SONGS.CCLI_NUMBER()}
              value={ccliInput}
              onChange={(e) => {
                setCcliInput(e.target.value);
                setCcliError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ccliInput.trim() && !isRenumbering) handleSetCcli();
              }}
              error={!!ccliError}
              helperText={ccliError ?? undefined}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCcliSong(null)} disabled={isRenumbering}>
            {LL.COMMON.CANCEL()}
          </Button>
          <Button onClick={handleSetCcli} variant="contained" disabled={isRenumbering || !ccliInput.trim()}>
            {isRenumbering ? <CircularProgress size={20} /> : LL.COMMON.SAVE()}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
