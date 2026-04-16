import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Chip,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Event as EventIcon,
  Edit as EditIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetShowsQuery, useDeleteShowMutation, useSaveShowMutation } from '@/api/shows.api';
import type { Show } from '@/api/shows.api';
import { useAppSelector } from '@/store';

interface ShowsProps {
  open: boolean;
  onShowSelected: (show: Show | null, isNew: boolean, override?: boolean) => void;
  onClose?: () => void;
  allowClose?: boolean;
  currentShowTitle?: string;
}

// Function to resolve date/time variables in template
const resolveShowTemplate = (template: string): string => {
  const now = new Date();

  const replacements: Record<string, string> = {
    yyyy: now.getFullYear().toString(),
    yy: now.getFullYear().toString().slice(-2),
    MM: (now.getMonth() + 1).toString().padStart(2, '0'),
    M: (now.getMonth() + 1).toString(),
    dd: now.getDate().toString().padStart(2, '0'),
    d: now.getDate().toString(),
    HH: now.getHours().toString().padStart(2, '0'),
    H: now.getHours().toString(),
    mm: now.getMinutes().toString().padStart(2, '0'),
    m: now.getMinutes().toString(),
    ss: now.getSeconds().toString().padStart(2, '0'),
    s: now.getSeconds().toString(),
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
};

export const Shows = ({ open, onShowSelected, onClose, allowClose = false, currentShowTitle }: ShowsProps) => {
  const { LL } = useI18nContext();
  const showTitleTemplate = useAppSelector((state) => state.settings.showSaveFormat);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [newShowTitle, setNewShowTitle] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showToDelete, setShowToDelete] = useState<string | null>(null);
  const [confirmOverride, setConfirmOverride] = useState<Show | null>(null);
  const [showToRename, setShowToRename] = useState<Show | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const { data: showsData, isLoading, refetch } = useGetShowsQuery({ limit: 100, page: 0 });
  const [deleteShowMutation] = useDeleteShowMutation();
  const [saveShowMutation] = useSaveShowMutation();

  const shows = showsData?.shows ?? [];

  // Reset to show list when dialog closes/opens
  useEffect(() => {
    if (open) {
      setIsCreatingNew(false);
      setNewShowTitle('');
      setSelectedShow(null);
    }
  }, [open]);

  // Generate default show title from template when creating new show
  useEffect(() => {
    if (isCreatingNew && !newShowTitle) {
      setNewShowTitle(resolveShowTemplate(showTitleTemplate));
    }
  }, [isCreatingNew, showTitleTemplate]);

  const handleSelectShow = (show: Show) => {
    setSelectedShow(show);
  };

  const handleConfirmSelection = () => {
    if (selectedShow) {
      onShowSelected(selectedShow, false);
      onClose?.();
    }
  };

  const handleCreateOrOverride = () => {
    if (!newShowTitle.trim()) return;

    // Check if show already exists
    const existingShow = shows.find((s) => s.title === newShowTitle.trim());
    if (existingShow) {
      // Show confirmation dialog for override
      setConfirmOverride(existingShow);
    } else {
      // Create new show
      const newShow: Show = {
        title: newShowTitle.trim(),
        order: [],
      };
      onShowSelected(newShow, true, false);
      setNewShowTitle('');
      setIsCreatingNew(false);
      onClose?.();
    }
  };

  const handleConfirmOverride = () => {
    if (confirmOverride) {
      const overrideShow: Show = {
        title: confirmOverride.title,
        order: [],
      };
      onShowSelected(overrideShow, true, true);
      setNewShowTitle('');
      setIsCreatingNew(false);
      setConfirmOverride(null);
      onClose?.();
    }
  };

  const handleDeleteShow = async (title: string) => {
    try {
      await deleteShowMutation({ title }).unwrap();
      if (selectedShow?.title === title) {
        setSelectedShow(null);
      }
      setShowToDelete(null);
      refetch();
    } catch (error) {
      console.error('Failed to delete show:', error);
    }
  };

  const handleRenameShow = async () => {
    if (!showToRename || !renameTitle.trim() || renameTitle === showToRename.title) {
      return;
    }

    try {
      // Delete old show
      await deleteShowMutation({ title: showToRename.title }).unwrap();

      // Create new show with same content but new name
      await saveShowMutation({
        title: renameTitle.trim(),
        order: showToRename.order,
      }).unwrap();

      setShowToRename(null);
      setRenameTitle('');
      refetch();
    } catch (error) {
      console.error('Failed to rename show:', error);
    }
  };

  return (
    <>
      <Dialog open={open} maxWidth="sm" fullWidth onClose={allowClose ? onClose : undefined} disableEscapeKeyDown={!allowClose}>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <EventIcon />
            <Typography variant="h6">{isCreatingNew ? LL.SHOWS.NEW() : LL.SHOWS.TITLE()}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {isCreatingNew ? (
            <Stack spacing={3} sx={{ mt: 1 }}>
              <Alert severity="info" icon={<AddIcon />}>
                {LL.SHOWS.CREATE_INFO()}
              </Alert>
              <TextField
                autoFocus
                label={LL.COMMON.TITLE()}
                fullWidth
                value={newShowTitle}
                onChange={(e) => setNewShowTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newShowTitle.trim()) {
                    handleCreateOrOverride();
                  }
                }}
                placeholder={LL.SHOWS.PLACEHOLDER()}
              />
            </Stack>
          ) : (
            <Stack spacing={2}>
              {isLoading ? (
                <Box display="flex" justifyContent="center" p={4}>
                  <CircularProgress />
                </Box>
              ) : shows.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.default' }}>
                  <EventIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    {LL.SHOWS.NO_SHOWS()}
                  </Typography>
                  <Typography color="text.secondary" paragraph>
                    {LL.SHOWS.EMPTY_HELP()}
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setIsCreatingNew(true)}>
                    {LL.SHOWS.NEW()}
                  </Button>
                </Paper>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {LL.SHOWS.SELECT_PROMPT()}
                  </Typography>
                  <Paper variant="outlined">
                    <List sx={{ maxHeight: 450, overflow: 'auto' }}>
                      {shows.map((show, index) => {
                        const isCurrentShow = !!(currentShowTitle && show.title === currentShowTitle);
                        const isSelected = selectedShow?.title === show.title;

                        return (
                          <ListItem
                            key={show.title}
                            disablePadding
                            divider={index < shows.length - 1}
                            secondaryAction={
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title={LL.SHOWS.SAVE_CURRENT_TOOLTIP()}>
                                  <IconButton
                                    edge="end"
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmOverride(show);
                                    }}
                                  >
                                    <UploadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={LL.SHOWS.RENAME_TOOLTIP()}>
                                  <IconButton
                                    edge="end"
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowToRename(show);
                                      setRenameTitle(show.title);
                                    }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={LL.SHOWS.DELETE_TOOLTIP()}>
                                  <IconButton
                                    edge="end"
                                    size="small"
                                    color="error"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowToDelete(show.title);
                                    }}
                                    disabled={isCurrentShow}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            }
                          >
                            <ListItemButton
                              selected={isSelected}
                              onClick={() => handleSelectShow(show)}
                              sx={{
                                borderLeft: isCurrentShow ? 4 : 0,
                                borderColor: 'success.main',
                              }}
                            >
                              <ListItemText
                                primary={
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="body1">{show.title}</Typography>
                                    {isCurrentShow && (
                                      <Chip label={(LL as any).CURRENT()} size="small" color="success" icon={<CheckCircleIcon />} />
                                    )}
                                  </Stack>
                                }
                                secondary={
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="caption">
                                      {`${(show.order ?? []).length} ${(show.order ?? []).length === 1 ? (LL as any).SONG() : (LL as any).SONGS()}`}
                                    </Typography>
                                    {show.date && (
                                      <>
                                        <Typography variant="caption">•</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {new Date(show.date).toLocaleString()}
                                        </Typography>
                                      </>
                                    )}
                                  </Stack>
                                }
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Paper>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          {isCreatingNew ? (
            <>
              <Button
                onClick={() => {
                  setIsCreatingNew(false);
                  setNewShowTitle('');
                }}
              >
                {LL.COMMON.CANCEL()}
              </Button>
              <Button onClick={handleCreateOrOverride} variant="contained" disabled={!newShowTitle.trim()} startIcon={<AddIcon />}>
                {LL.COMMON.SAVE()}
              </Button>
            </>
          ) : (
            <>
              {shows.length > 0 && (
                <Button startIcon={<AddIcon />} onClick={() => setIsCreatingNew(true)}>
                  {LL.SHOWS.NEW()}
                </Button>
              )}
              <Box flexGrow={1} />
              {allowClose && <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>}
              <Button onClick={handleConfirmSelection} variant="contained" disabled={!selectedShow}>
                {LL.COMMON.CONFIRM()}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!showToDelete} onClose={() => setShowToDelete(null)} maxWidth="xs">
        <DialogTitle>{LL.ADMIN.CONFIRM_DELETE()}</DialogTitle>
        <DialogContent>
          <Typography>
            {LL.SHOWS.DELETE_CONFIRMATION_START()}
            <strong>"{showToDelete}"</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {LL.ADMIN.ACTION_CANNOT_BE_UNDONE()}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowToDelete(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={() => showToDelete && handleDeleteShow(showToDelete)} color="error" variant="contained">
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Override confirmation dialog */}
      <Dialog open={!!confirmOverride} onClose={() => setConfirmOverride(null)} maxWidth="xs">
        <DialogTitle>{LL.SHOWS.SAVE_OVERRIDE_TITLE()}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {newShowTitle ? (
              <>
                {LL.SHOWS.SAVE_OVERRIDE_EXISTING()}
                <strong>"{newShowTitle}"</strong>
              </>
            ) : (
              <>
                {LL.SHOWS.SAVE_OVERRIDE_TO()}
                <strong>"{confirmOverride?.title}"</strong>
              </>
            )}
          </Alert>
          <Typography variant="body2">
            {LL.SHOWS.SAVE_OVERRIDE_DESCRIPTION_START()}
            <strong>
              {confirmOverride?.order?.length || 0} {LL.COMMON.SONGS()}
            </strong>
            {LL.SHOWS.SAVE_OVERRIDE_DESCRIPTION_END()}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {LL.ADMIN.ACTION_CANNOT_BE_UNDONE()}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOverride(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={handleConfirmOverride} color="warning" variant="contained" startIcon={<UploadIcon />}>
            {LL.COMMON.SAVE()} & {LL.COMMON.OVERRIDE()}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!showToRename} onClose={() => setShowToRename(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{LL.SHOWS.RENAME_DIALOG_TITLE()}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={LL.COMMON.TITLE()}
            fullWidth
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameTitle.trim() && showToRename) {
                handleRenameShow();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowToRename(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={handleRenameShow} variant="contained" disabled={!renameTitle.trim() || renameTitle === showToRename?.title}>
            {LL.COMMON.SAVE()}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
