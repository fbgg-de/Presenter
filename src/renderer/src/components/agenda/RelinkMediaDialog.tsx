/**
 * A media item whose file is missing: find it again.
 *
 * Files with the same name anywhere in the media folder are offered first — the usual case is a file
 * that was moved to another folder. The media browser remains for picking any other file.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Radio,
  Stack,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import type { MediaSubType, ShowItem } from '@/api/shows.api';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { fileNameOf, findMediaFilesByName, mediaServerBase, type FoundMediaFile } from '@/media/mediaFiles';
import { invalidateMediaProbe, resolveMediaUrl } from '@/utils/mediaUrl';

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

export const RelinkMediaDialog = ({
  item,
  onClose,
  onRelink,
}: {
  /** The item to relink; the dialog is open while it is set. */
  item: ShowItem | undefined;
  onClose: () => void;
  onRelink: (mediaPath: string, mediaSubType: MediaSubType) => void;
}) => {
  const { LL } = useI18nContext();
  const A = LL.AGENDA_DROP;
  const { mediaPath } = useGetSettings('mediaPath');
  const [results, setResults] = useState<FoundMediaFile[] | null>(null);
  const [selected, setSelected] = useState<string>();
  const [browsing, setBrowsing] = useState(false);

  const name = item?.mediaPath ? fileNameOf(item.mediaPath) : '';

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setResults(null);
    setSelected(undefined);
    void (async () => {
      const found = await findMediaFilesByName(await mediaServerBase(mediaPath), name);
      if (cancelled) return;
      setResults(found);
      setSelected(found[0]?.path);
    })();
    return () => {
      cancelled = true;
    };
  }, [item, name, mediaPath]);

  const apply = (path: string, subType: MediaSubType) => {
    const url = resolveMediaUrl(path);
    if (url) invalidateMediaProbe(url);
    onRelink(path, subType);
  };

  return (
    <>
      <Dialog open={!!item && !browsing} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{A.RELINK_TITLE()}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <DialogContentText variant="body2">{A.RELINK_HINT({ name, path: item?.mediaPath ?? '' })}</DialogContentText>
            {results === null ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={18} />
                <DialogContentText variant="body2">{A.RELINK_SEARCHING()}</DialogContentText>
              </Stack>
            ) : results.length === 0 ? (
              <Alert severity="info">{A.RELINK_NONE({ name })}</Alert>
            ) : (
              <List dense disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 260, overflow: 'auto' }}>
                {results.map((result) => (
                  <ListItemButton key={result.path} onClick={() => setSelected(result.path)} selected={selected === result.path}>
                    <Radio size="small" checked={selected === result.path} tabIndex={-1} sx={{ p: 0.5, mr: 1 }} />
                    <ListItemText primary={result.path} secondary={formatSize(result.size)} slotProps={{ primary: { noWrap: true } }} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBrowsing(true)} sx={{ mr: 'auto' }}>
            {A.RELINK_BROWSE()}
          </Button>
          <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
          <Button
            variant="contained"
            disabled={!selected || !item}
            onClick={() => selected && item && apply(selected, item.mediaSubType ?? 'image')}
          >
            {A.RELINK_USE()}
          </Button>
        </DialogActions>
      </Dialog>
      <MediaBrowser
        open={!!item && browsing}
        mode="pick"
        initialType={item?.mediaSubType === 'video' ? 'video' : 'image'}
        selectLabel={A.RELINK_USE()}
        onClose={() => setBrowsing(false)}
        onAdd={(type, path) => {
          setBrowsing(false);
          if (path && type !== 'color') apply(path, type);
        }}
      />
    </>
  );
};
