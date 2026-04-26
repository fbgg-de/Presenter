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
} from '@mui/icons-material';
import { useGetSongsAllQuery, useDeleteSongMutation } from '@/api/songs.api';
import { useI18nContext } from '@/i18n/i18n-react';
import type { SongListItem } from '@/api/songs.api';
import { useGetSettings } from '@/store/settingsSlice';

type SortOrder = 'lexicographic' | 'numeric';

type Props = {
  open: boolean;
  onClose: () => void;
  onSongSelected: (song: SongListItem) => void;
};

export const SongLibrary = ({ open, onClose, onSongSelected }: Props) => {
  const { LL } = useI18nContext();
  const [filter, setFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('lexicographic');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [songToDelete, setSongToDelete] = useState<SongListItem | null>(null);

  const { showDeleteFromDb } = useGetSettings();

  const { data: allSongs, isLoading } = useGetSongsAllQuery({ order: sortOrder });
  const [deleteSong, { isLoading: isDeleting }] = useDeleteSongMutation();

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
        setDeleteConfirmOpen(false);
        setSongToDelete(null);
      } catch (error) {
        console.error('Failed to delete song:', error);
      }
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {LL.SONGS.LIBRARY()}
          {filteredSongs && <Chip label={filteredSongs.length} size="small" variant="outlined" />}
          <Box flexGrow={1} />
          <ToggleButtonGroup value={sortOrder} exclusive onChange={(_e, val) => val && setSortOrder(val)} size="small" sx={{ mr: 1 }}>
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
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
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

          {isLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : filteredSongs && filteredSongs.length > 0 ? (
            <List dense sx={{ maxHeight: '60vh', overflow: 'auto' }}>
              {filteredSongs.map((song) => (
                <ListItem
                  key={song.songNumber}
                  disablePadding
                  secondaryAction={
                    showDeleteFromDb ? (
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
                    ) : undefined
                  }
                >
                  <ListItemButton onClick={() => onSongSelected(song)} sx={{ gap: 1.5, py: 0.75 }}>
                    <Chip
                      label={`#${song.songNumber}`}
                      size="small"
                      variant="outlined"
                      color="primary"
                      sx={{ fontWeight: 600, fontSize: '0.75rem', minWidth: 56 }}
                    />
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight={500} noWrap sx={{ flexShrink: 1, minWidth: 0 }}>
                            {song.title}
                          </Typography>
                          {song.authors && song.authors !== 'Unknown' && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 1, minWidth: 0 }}>
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
                      }
                      slotProps={{
                        primary: { component: 'div' },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <Box display="flex" justifyContent="center" py={4}>
              <Typography color="text.secondary">{LL.SONGS.NO_FOUND()}</Typography>
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
    </>
  );
};
