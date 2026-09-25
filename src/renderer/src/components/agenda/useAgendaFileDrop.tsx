/**
 * Dropping files onto the agenda.
 *
 * - Lyric files (.sng, CCLI .txt) are imported as songs, as before.
 * - Images, videos and audio become media items in the group they are dropped on — after the entry
 *   under the pointer, else at the end of that group.
 * - In the desktop app a file inside the media folder is referenced by its relative path; files
 *   from anywhere else are copied into a folder of the media folder first, chosen in a dialog.
 * - In the browser a file's location is unknown: with a Nextcloud connection it is uploaded into a
 *   folder of the media folder there (chosen in a dialog); otherwise it is looked up by name.
 *
 * Group cards carry `data-agenda-group` and item rows `data-agenda-index`, which is how the target
 * is read off the drop point without the list having to know about files.
 */
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { FileUpload as DropIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { insertItemsIntoGroup } from '@/store/showSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { newMediaItemData, newSlideshowData } from '@/media/mediaItem';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import type { ShowGroup, ShowItem } from '@/api/shows.api';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import {
  fileNameOf,
  findMediaFilesByName,
  isSongFileName,
  joinMediaPath,
  mediaKindOf,
  mediaLabelOf,
  mediaServerBase,
  relativeToMediaRoot,
  type MediaFileKind,
} from '@/media/mediaFiles';
import { CopyToMediaFolderDialog, type FileToCopy } from './CopyToMediaFolderDialog';
import { nextcloudMediaActive, useNextcloud } from '@/nextcloud/connection';
import { nextcloudFolderSource } from '@/nextcloud/folderSource';
import { uploadFile } from '@/nextcloud/relay';

interface DropTarget {
  groupId: string;
  afterIndex?: number;
}

/** One dropped media file, in drop order: already in the media folder, or still to be copied. */
type DroppedMedia = { kind: MediaFileKind; path: string; source?: undefined } | { kind: MediaFileKind; source: string; path?: undefined };

/** Files from the computer, or an entry dragged out of the library panel. */
const hasFiles = (event: DragEvent) => {
  const types = Array.from(event.dataTransfer.types);
  return types.includes('Files');
};

export function useAgendaFileDrop({
  groups,
  disabled,
  importSongFile,
}: {
  groups: ShowGroup[];
  /** Live mode: the agenda is locked. */
  disabled: boolean;
  importSongFile: (file: File) => void;
}) {
  const { LL } = useI18nContext();
  const A = LL.AGENDA_DROP;
  const dispatch = useAppDispatch();
  const { mediaPath, mediaImportFolder } = useGetSettings('mediaPath', 'mediaImportFolder');
  const updateSetting = useUpdateSetting();
  const { data: screenGroups = [] } = useGetScreenGroupsQuery();

  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'info' | 'warning' | 'error'; message: string } | null>(null);
  const [pending, setPending] = useState<{ files: DroppedMedia[]; target: DropTarget } | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string>();
  const nextcloud = useNextcloud();
  const uploadsToNextcloud = !window.api && nextcloudMediaActive(nextcloud);
  const nextcloudFolders = useMemo(() => nextcloudFolderSource(true), []);
  /** Browser drops waiting for a Nextcloud folder, and the upload's progress. */
  const [pendingUpload, setPendingUpload] = useState<{ files: File[]; target: DropTarget } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ index: number; fraction: number } | null>(null);

  const targetFrom = (element: EventTarget | null): DropTarget => {
    const el = element instanceof Element ? element : null;
    const row = el?.closest('[data-agenda-index]');
    const card = el?.closest('[data-agenda-group]');
    const groupId = card?.getAttribute('data-agenda-group') ?? groups[groups.length - 1]?.id ?? DEFAULT_GROUP_ID;
    const index = row ? Number(row.getAttribute('data-agenda-index')) : undefined;
    return { groupId, afterIndex: Number.isInteger(index) ? index : undefined };
  };

  /** Several images dropped at once: one slideshow, or an entry each? */
  const [slideshowChoice, setSlideshowChoice] = useState<{ entries: { kind: MediaFileKind; path: string }[]; target: DropTarget } | null>(
    null,
  );

  const addItems = (entries: { kind: MediaFileKind; path: string }[], target: DropTarget, asked = false) => {
    if (entries.length === 0) return;
    if (!asked && entries.filter((entry) => entry.kind === 'image').length >= 2) {
      setSlideshowChoice({ entries, target });
      return;
    }
    insertEntries(entries, target);
  };

  const addSlideshow = (entries: { kind: MediaFileKind; path: string }[], target: DropTarget) => {
    const images = entries.filter((entry) => entry.kind === 'image');
    const others = entries.filter((entry) => entry.kind !== 'image');
    const slideshow: ShowItem = {
      type: 'media',
      mediaSubType: 'slideshow',
      label: A.SLIDESHOW_NAME({ count: images.length }),
      media: newSlideshowData(
        images.map((entry) => entry.path),
        { groups: screenGroups },
      ),
    };
    dispatch(insertItemsIntoGroup({ items: [slideshow], groupId: target.groupId, afterIndex: target.afterIndex }));
    insertEntries(others, target);
  };

  const insertEntries = (entries: { kind: MediaFileKind; path: string }[], target: DropTarget) => {
    if (entries.length === 0) return;
    const items: ShowItem[] = entries.map(({ kind, path }) => ({
      type: 'media',
      mediaSubType: kind,
      mediaPath: path,
      label: mediaLabelOf(path),
      // Images and videos start as content on the screens that show media items.
      ...(kind === 'audio' ? {} : { media: newMediaItemData(kind, path, { groups: screenGroups }) }),
    }));
    dispatch(insertItemsIntoGroup({ items, groupId: target.groupId, afterIndex: target.afterIndex }));
  };

  /** Browser: the path of a dropped file is unknown, so find it by name (and size) in the media folder. */
  const addByName = async (files: File[], target: DropTarget) => {
    const base = await mediaServerBase(mediaPath);
    const found: { kind: MediaFileKind; path: string }[] = [];
    const missing: string[] = [];
    for (const file of files) {
      const matches = await findMediaFilesByName(base, file.name);
      const match = matches.find((m) => m.size === file.size) ?? matches[0];
      if (match) found.push({ kind: mediaKindOf(file.name)!, path: match.path });
      else missing.push(file.name);
    }
    addItems(found, target);
    if (missing.length > 0) setNotice({ severity: 'warning', message: A.NOT_IN_MEDIA_FOLDER({ files: missing.join(', ') }) });
    else if (found.length > 0) setNotice({ severity: 'success', message: A.ADDED({ count: found.length }) });
  };

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    depth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  };

  const onDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) {
      setNotice({ severity: 'info', message: A.LOCKED() });
      return;
    }

    const target = targetFrom(event.target);
    const files = Array.from(event.dataTransfer.files);
    const songs = files.filter((file) => isSongFileName(file.name));
    const media = files.filter((file) => mediaKindOf(file.name));
    const ignored = files.length - songs.length - media.length;

    songs.forEach(importSongFile);
    if (ignored > 0) setNotice({ severity: 'info', message: A.UNSUPPORTED({ count: ignored }) });
    if (media.length === 0) return;

    const getPath = window.api?.getPathForFile;
    if (!getPath) {
      if (uploadsToNextcloud) {
        setCopyError(undefined);
        setPendingUpload({ files: media, target });
      } else {
        void addByName(media, target);
      }
      return;
    }
    if (!mediaPath) {
      setNotice({ severity: 'warning', message: A.NO_MEDIA_FOLDER() });
      return;
    }

    const dropped: DroppedMedia[] = media.map((file) => {
      const source = getPath(file);
      const relative = relativeToMediaRoot(source, mediaPath);
      return relative ? { kind: mediaKindOf(file.name)!, path: relative } : { kind: mediaKindOf(file.name)!, source };
    });
    if (dropped.every((entry) => entry.path !== undefined)) {
      addItems(dropped as { kind: MediaFileKind; path: string }[], target);
      return;
    }
    setCopyError(undefined);
    setPending({ files: dropped, target });
  };

  const confirmCopy = async (folder: string) => {
    if (!pending || !window.api?.importMediaFiles) return;
    setCopying(true);
    setCopyError(undefined);
    try {
      const sources = pending.files.flatMap((entry) => (entry.source ? [entry.source] : []));
      const result = await window.api.importMediaFiles(mediaPath, folder, sources);
      const placed = new Map((result.placed ?? []).map((entry) => [entry.source, entry.name]));
      const entries: { kind: MediaFileKind; path: string }[] = [];
      const failed: string[] = [];
      for (const entry of pending.files) {
        if (entry.path !== undefined) entries.push({ kind: entry.kind, path: entry.path });
        else if (placed.has(entry.source)) entries.push({ kind: entry.kind, path: joinMediaPath(folder, placed.get(entry.source)!) });
        else failed.push(fileNameOf(entry.source));
      }
      addItems(entries, pending.target);
      updateSetting('mediaImportFolder', folder);
      setPending(null);
      const reused = (result.placed ?? []).filter((entry) => entry.reused).length;
      if (failed.length > 0) setNotice({ severity: 'warning', message: A.COPY_PARTLY_FAILED({ files: failed.join(', ') }) });
      else
        setNotice({
          severity: 'success',
          message: reused > 0 ? A.ADDED_REUSED({ count: entries.length, reused }) : A.ADDED({ count: entries.length }),
        });
    } catch (error) {
      setCopyError(A.COPY_FAILED({ message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setCopying(false);
    }
  };

  /** Upload the dropped files into a folder of the Nextcloud media folder, then add them. */
  const confirmUpload = async (folder: string) => {
    if (!pendingUpload) return;
    setCopying(true);
    setCopyError(undefined);
    const added: { kind: MediaFileKind; path: string }[] = [];
    const failed: string[] = [];
    try {
      for (let index = 0; index < pendingUpload.files.length; index++) {
        const file = pendingUpload.files[index];
        setUploadProgress({ index, fraction: 0 });
        try {
          const path = await uploadFile(file, folder, (fraction) => setUploadProgress({ index, fraction }));
          added.push({ kind: mediaKindOf(file.name)!, path });
        } catch (error) {
          // A file already there under that name is used as it is.
          if (error instanceof Error && 'status' in error && (error as { status: number }).status === 409) {
            added.push({ kind: mediaKindOf(file.name)!, path: joinMediaPath(folder, file.name) });
          } else {
            failed.push(file.name);
          }
        }
      }
      addItems(added, pendingUpload.target);
      updateSetting('mediaImportFolder', folder);
      setPendingUpload(null);
      if (failed.length > 0) setNotice({ severity: 'warning', message: A.COPY_PARTLY_FAILED({ files: failed.join(', ') }) });
      else setNotice({ severity: 'success', message: A.ADDED({ count: added.length }) });
    } finally {
      setCopying(false);
      setUploadProgress(null);
    }
  };

  const dropProps = { onDragEnter, onDragOver, onDragLeave, onDrop };

  const overlay: ReactNode = dragging ? (
    <Stack
      sx={{
        position: 'absolute',
        inset: 8,
        zIndex: 5,
        pointerEvents: 'none',
        border: '2px dashed',
        borderColor: disabled ? 'text.disabled' : 'primary.main',
        borderRadius: 2,
        bgcolor: 'action.hover',
        alignItems: 'center',
        justifyContent: 'flex-end',
        pb: 3,
        gap: 0.5,
      }}
    >
      <DropIcon sx={{ color: disabled ? 'text.disabled' : 'primary.main' }} />
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center', px: 2 }}>
        {disabled ? A.LOCKED() : A.DROP_HINT()}
      </Typography>
    </Stack>
  ) : null;

  const dialogs: ReactNode = (
    <>
      <Dialog open={!!slideshowChoice} onClose={() => setSlideshowChoice(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{A.SLIDESHOW_TITLE()}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">
            {A.SLIDESHOW_QUESTION({ count: slideshowChoice?.entries.filter((entry) => entry.kind === 'image').length ?? 0 })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (slideshowChoice) addItems(slideshowChoice.entries, slideshowChoice.target, true);
              setSlideshowChoice(null);
            }}
          >
            {A.SEPARATE_IMAGES()}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (slideshowChoice) addSlideshow(slideshowChoice.entries, slideshowChoice.target);
              setSlideshowChoice(null);
            }}
          >
            {A.ONE_SLIDESHOW()}
          </Button>
        </DialogActions>
      </Dialog>
      <CopyToMediaFolderDialog
        open={!!pending}
        files={(pending?.files ?? []).flatMap((entry): FileToCopy[] => (entry.source ? [{ source: entry.source, kind: entry.kind }] : []))}
        mediaPath={mediaPath}
        initialFolder={mediaImportFolder ?? ''}
        busy={copying}
        error={copyError}
        onCancel={() => setPending(null)}
        onConfirm={(folder) => void confirmCopy(folder)}
      />
      <CopyToMediaFolderDialog
        open={!!pendingUpload}
        files={(pendingUpload?.files ?? []).map((file): FileToCopy => ({ source: file.name, kind: mediaKindOf(file.name)! }))}
        mediaPath={mediaPath}
        source={nextcloudFolders}
        title={A.UPLOAD_TITLE()}
        hint={
          uploadProgress && pendingUpload
            ? A.UPLOAD_PROGRESS({
                index: uploadProgress.index + 1,
                count: pendingUpload.files.length,
                percent: Math.round(uploadProgress.fraction * 100),
              })
            : A.UPLOAD_HINT({ count: pendingUpload?.files.length ?? 0 })
        }
        confirmLabel={A.UPLOAD_AND_ADD()}
        initialFolder={mediaImportFolder ?? ''}
        busy={copying}
        error={copyError}
        onCancel={() => setPendingUpload(null)}
        onConfirm={(folder) => void confirmUpload(folder)}
      />
      <Snackbar
        open={!!notice}
        autoHideDuration={7000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notice?.severity ?? 'info'} onClose={() => setNotice(null)} sx={{ width: '100%' }}>
          {notice?.message}
        </Alert>
      </Snackbar>
    </>
  );

  return { dropProps, overlay, dialogs };
}
