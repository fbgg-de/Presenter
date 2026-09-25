/**
 * Dropped files that are not in the media folder yet: choose a folder inside it to copy them to.
 *
 * Other computers only see what is in the (synced) media folder, so a file dropped from Downloads
 * is copied in rather than referenced where it lies. The last folder used is preselected.
 *
 * The folders come from a `FolderSource`: the media folder on this computer, or Nextcloud in the
 * web version (where the files are uploaded). Without files it is a plain folder picker.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Audiotrack as AudioIcon,
  CreateNewFolderOutlined as NewFolderIcon,
  Folder as FolderIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { fileNameOf, folderOf, joinMediaPath, type MediaFileKind } from '@/media/mediaFiles';
import { localFolderSource, type FolderSource } from '@/nextcloud/folderSource';

export interface FileToCopy {
  source: string;
  kind: MediaFileKind;
}

const KIND_ICON = { image: ImageIcon, video: VideoIcon, audio: AudioIcon } as const;

export const CopyToMediaFolderDialog = ({
  open,
  files,
  mediaPath,
  initialFolder,
  busy,
  error,
  onCancel,
  onConfirm,
  source,
  title,
  hint,
  confirmLabel,
  rootLabel,
}: {
  open: boolean;
  files: FileToCopy[];
  /** Where the folders come from; the media folder on this computer by default. */
  source?: FolderSource;
  title?: string;
  hint?: string;
  confirmLabel?: string;
  /** The name of the top level in the breadcrumb. */
  rootLabel?: string;
  /** The media folder on this computer. */
  mediaPath: string;
  initialFolder: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (folder: string) => void;
}) => {
  const { LL } = useI18nContext();
  const A = LL.AGENDA_DROP;
  const [folder, setFolder] = useState(initialFolder);
  const [dirs, setDirs] = useState<string[] | null>(null);
  const [listError, setListError] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [createError, setCreateError] = useState(false);
  const folders = source ?? localFolderSource(mediaPath);

  useEffect(() => {
    if (open) setFolder(initialFolder);
  }, [open, initialFolder]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDirs(null);
    setListError(false);
    void (async () => {
      try {
        const list = await folders.list(folder);
        if (!cancelled) setDirs(list);
      } catch {
        if (cancelled) return;
        // A folder that no longer exists falls back to the top of the media folder.
        if (folder) setFolder('');
        else setListError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The source is recreated per render; the media path and folder decide what to list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder, mediaPath, source]);

  const crumbs = folder ? folder.split('/') : [];

  const createFolder = async () => {
    const name = newFolder?.trim();
    if (!name || !folders.create) return;
    try {
      const created = await folders.create(folder, name);
      setNewFolder(null);
      setCreateError(false);
      setFolder(created);
    } catch {
      setCreateError(true);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title ?? A.COPY_TITLE()}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText variant="body2">{hint ?? A.COPY_HINT({ count: files.length })}</DialogContentText>

          <Stack spacing={0.5} sx={{ maxHeight: 160, overflow: 'auto' }}>
            {files.map((file) => {
              const Icon = KIND_ICON[file.kind];
              return (
                <Stack key={file.source} direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <Icon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" noWrap sx={{ flexShrink: 0, maxWidth: '55%' }}>
                    {fileNameOf(file.source)}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ color: 'text.secondary', minWidth: 0 }}>
                    {folderOf(file.source)}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>

          <Stack spacing={0.75}>
            <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
              {A.TARGET_FOLDER()}
            </Typography>
            <Breadcrumbs maxItems={5} sx={{ fontSize: '0.85rem' }}>
              <Link component="button" underline="hover" onClick={() => setFolder('')} sx={{ fontSize: 'inherit' }}>
                {rootLabel ?? A.MEDIA_FOLDER()}
              </Link>
              {crumbs.map((crumb, index) => (
                <Link
                  key={index}
                  component="button"
                  underline="hover"
                  onClick={() => setFolder(crumbs.slice(0, index + 1).join('/'))}
                  sx={{ fontSize: 'inherit' }}
                >
                  {crumb}
                </Link>
              ))}
            </Breadcrumbs>

            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, height: 200, overflow: 'auto' }}>
              {listError ? (
                <Alert severity="warning" sx={{ m: 1 }}>
                  {A.FOLDER_UNAVAILABLE()}
                </Alert>
              ) : dirs === null ? (
                <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <CircularProgress size={22} />
                </Stack>
              ) : (
                <List dense disablePadding>
                  {dirs.length === 0 && (
                    <Typography variant="caption" sx={{ display: 'block', p: 1.5, color: 'text.secondary' }}>
                      {A.NO_SUBFOLDERS()}
                    </Typography>
                  )}
                  {dirs.map((dir) => (
                    <ListItemButton key={dir} onClick={() => setFolder(joinMediaPath(folder, dir))}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <FolderIcon fontSize="small" sx={{ color: 'warning.main' }} />
                      </ListItemIcon>
                      <ListItemText primary={dir} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>

            {folders.create &&
              (newFolder === null ? (
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<NewFolderIcon />}
                  onClick={() => setNewFolder('')}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                >
                  {A.NEW_FOLDER()}
                </Button>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TextField
                    size="small"
                    autoFocus
                    label={A.NEW_FOLDER_NAME()}
                    value={newFolder}
                    error={createError}
                    helperText={createError ? A.NEW_FOLDER_FAILED() : undefined}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createFolder();
                      if (e.key === 'Escape') setNewFolder(null);
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button onClick={() => void createFolder()} disabled={!newFolder.trim()}>
                    {A.CREATE()}
                  </Button>
                </Stack>
              ))}

            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              → {joinMediaPath(folder, files.length === 1 ? fileNameOf(files[0].source) : files.length ? '…' : '')}
            </Typography>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          {LL.COMMON.CANCEL()}
        </Button>
        <Button
          variant="contained"
          onClick={() => onConfirm(folder)}
          disabled={busy || listError}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
        >
          {confirmLabel ?? A.COPY_AND_ADD()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
