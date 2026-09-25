/**
 * The library: saved groups and media entries, and the groups of past shows — a picker dialog like
 * the song library and the media browser.
 *
 * An entry is added with its + button: a group after the chosen group (or at the end), a media
 * entry into the chosen group. The dialog stays open, so several entries can be added in a row.
 * Past-show groups need no saving to be reused; saving one keeps it when the show is gone. Entries
 * with a file that is not in the media folder are flagged before they are added.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AddCircleOutlined as AddIcon,
  BookmarkAddOutlined as SaveIcon,
  Close as CloseIcon,
  DeleteOutlined as DeleteIcon,
  FolderOutlined as GroupIcon,
  ReportProblemOutlined as MissingIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { Show, ShowItem } from '@/api/shows.api';
import {
  useCreateLibraryEntryMutation,
  useDeleteLibraryEntryMutation,
  useGetLibraryEntriesQuery,
  useGetPastGroupsQuery,
  type LibraryData,
  type LibraryKind,
} from '@/api/library.api';
import { useGetSongsAllQuery } from '@/api/songs.api';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { mediaPathsOf, summariseItems } from '@/library/libraryData';
import { mediaItemLabel } from '@/media/mediaItem';
import { probeMediaUrl, resolveMediaUrl } from '@/utils/mediaUrl';
import { getShowItemIcon } from '@/utils/showItemIcons';
import { DEFAULT_GROUP_ID, groupDisplayName } from '@/utils/showGroups';
import { stillWhileClosed } from '@/components/common/stillWhileClosed';

/** A library entry on its way into the show. */
export interface LibraryEntryPayload {
  kind: LibraryKind;
  name: string;
  data: LibraryData;
}

type Source = 'all' | 'saved' | 'past';

interface Row {
  key: string;
  kind: LibraryKind;
  name: string;
  data: LibraryData;
  /** A saved entry's id. */
  savedId?: number;
  /** A past show's title and date. */
  past?: { showTitle: string; date: string };
}

/** "At the end" in the group choice for whole groups. */
const AT_END = '__end__';

/** Whether any of the files is definitely missing from the media folder. */
const useAnyMissing = (paths: string[]) => {
  const [missing, setMissing] = useState(false);
  const key = paths.join('|');
  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    void Promise.all(
      paths.map((path) => {
        const url = resolveMediaUrl(path);
        return url ? probeMediaUrl(url) : Promise.resolve('ok' as const);
      }),
    ).then((statuses) => {
      if (!cancelled) setMissing(statuses.includes('not_found'));
    });
    return () => {
      cancelled = true;
    };
    // The joined paths are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return missing;
};

const firstPicture = (items: ShowItem[]) => {
  for (const item of items) {
    const source = item.media?.versions.find((v) => v.id === item.media?.versionId)?.sources[0] ?? item.media?.versions[0]?.sources[0];
    if (source) return { [source.type]: { path: source.path, fit: 'cover' as const } };
    if (item.mediaPath && (item.mediaSubType === 'image' || item.mediaSubType === 'video')) {
      return { [item.mediaSubType]: { path: item.mediaPath, fit: 'cover' as const } };
    }
  }
  return undefined;
};

const LibraryRow = ({
  row,
  songTitle,
  canAdd,
  onAdd,
  onSave,
  onDelete,
}: {
  row: Row;
  songTitle: (songNumber: number) => string;
  canAdd: boolean;
  onAdd: () => void;
  onSave?: () => void;
  onDelete?: () => void;
}) => {
  const { LL, locale } = useI18nContext();
  const B = LL.LIBRARY;
  const missing = useAnyMissing(mediaPathsOf(row.data.items));
  const picture = firstPicture(row.data.items);
  const summary = summariseItems(row.data.items);
  const parts = [
    summary.songs && B.COUNT_SONGS({ count: summary.songs }),
    summary.videos && B.COUNT_VIDEOS({ count: summary.videos }),
    summary.images && B.COUNT_IMAGES({ count: summary.images }),
    summary.slideshows && B.COUNT_SLIDESHOWS({ count: summary.slideshows }),
    summary.audio && B.COUNT_AUDIO({ count: summary.audio }),
    summary.verses && B.COUNT_VERSES({ count: summary.verses }),
  ].filter(Boolean);
  const contents = row.data.items
    .map((item) =>
      item.type === 'song' && item.songNumber != null
        ? songTitle(item.songNumber)
        : item.type === 'media'
          ? mediaItemLabel(item)
          : item.label || item.bibleRef,
    )
    .filter(Boolean)
    .join(' · ');
  const single = row.kind === 'media' ? row.data.items[0] : undefined;
  const Icon = single ? getShowItemIcon('media', single.mediaSubType) : GroupIcon;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'center', p: 1, borderRadius: 1, border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
    >
      <Box sx={{ width: 96, flexShrink: 0 }}>
        {picture ? (
          <BackgroundThumb data={picture} />
        ) : (
          <Stack
            sx={{ aspectRatio: '16/9', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.selected', borderRadius: 0.5 }}
          >
            <Icon fontSize="small" sx={{ color: 'text.secondary' }} />
          </Stack>
        )}
      </Box>
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
            {row.name}
          </Typography>
          {missing && (
            <Tooltip title={B.MISSING_FILES()}>
              <MissingIcon fontSize="small" sx={{ color: 'warning.main' }} />
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }} title={contents}>
          {row.kind === 'group' ? parts.join(' · ') || B.EMPTY_GROUP() : contents}
        </Typography>
        {row.kind === 'group' && contents && (
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }} title={contents}>
            {contents}
          </Typography>
        )}
        {row.past && (
          <Typography variant="caption" noWrap sx={{ color: 'text.disabled' }}>
            {B.FROM_SHOW({
              date: new Date(row.past.date.replace(' ', 'T')).toLocaleDateString(locale, {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }),
              show: row.past.showTitle,
            })}
          </Typography>
        )}
      </Stack>
      <Stack direction="row" sx={{ flexShrink: 0, alignItems: 'center' }}>
        {onSave && (
          <Tooltip title={B.SAVE()}>
            <IconButton size="small" onClick={onSave}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title={B.DELETE()}>
            <IconButton size="small" onClick={onDelete}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={B.ADD_TO_SHOW()}>
          <span>
            <IconButton color="primary" onClick={onAdd} disabled={!canAdd}>
              <AddIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
};

const LibraryDialogBody = ({
  open,
  onClose,
  show,
  locked,
  defaultGroupId,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  show: Show | null;
  /** Live mode: the agenda cannot be changed. */
  locked: boolean;
  /** The group media entries go into unless another is chosen: the active entry's group. */
  defaultGroupId?: string;
  onAdd: (payload: LibraryEntryPayload, target: { groupId?: string }) => void;
}) => {
  const { LL } = useI18nContext();
  const B = LL.LIBRARY;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState<LibraryKind>('group');
  const [source, setSource] = useState<Source>('all');
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const { data: saved = [] } = useGetLibraryEntriesQuery(undefined, { skip: !open });
  const { data: past = [] } = useGetPastGroupsQuery({ exclude: show?.title ?? '' }, { skip: !open });
  const { data: allSongs = [] } = useGetSongsAllQuery(undefined, { skip: !open });
  const [createEntry] = useCreateLibraryEntryMutation();
  const [deleteEntry] = useDeleteLibraryEntryMutation();

  // Where added entries go. Chosen again from the active entry every time the dialog opens.
  const groups = show?.groups ?? [];
  const [mediaGroupId, setMediaGroupId] = useState<string>(DEFAULT_GROUP_ID);
  const [groupAfter, setGroupAfter] = useState<string>(AT_END);
  useEffect(() => {
    if (!open) return;
    setMediaGroupId(defaultGroupId ?? groups.at(-1)?.id ?? DEFAULT_GROUP_ID);
    setGroupAfter(AT_END);
    // Only on opening; the choice is the operator's after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const titles = useMemo(() => new Map(allSongs.map((song) => [song.songNumber, song.title])), [allSongs]);
  const songTitle = (songNumber: number) => titles.get(songNumber) ?? `#${songNumber}`;

  const rows = useMemo<Row[]>(() => {
    const savedRows: Row[] = saved
      .filter((entry) => entry.kind === tab)
      .map((entry) => ({ key: `saved-${entry.id}`, kind: entry.kind, name: entry.name, data: entry.data, savedId: entry.id }));
    let pastRows: Row[] = [];
    if (tab === 'group') {
      pastRows = past.map((entry, index) => ({
        key: `past-${index}`,
        kind: 'group',
        name: entry.group.name || entry.showTitle,
        data: { group: entry.group, items: entry.items },
        past: { showTitle: entry.showTitle, date: entry.date },
      }));
    } else {
      // Media entries of past shows, newest first, each file once.
      const seen = new Set<string>();
      for (const entry of past) {
        for (const item of entry.items) {
          if (item.type !== 'media' || item.mediaSubType === 'color') continue;
          const key = mediaPathsOf([item]).join('|');
          if (!key || seen.has(key)) continue;
          seen.add(key);
          pastRows.push({
            key: `past-${pastRows.length}`,
            kind: 'media',
            name: mediaItemLabel(item) || item.label || key,
            data: { items: [{ ...item, groupId: undefined }] },
            past: { showTitle: entry.showTitle, date: entry.date },
          });
        }
      }
    }
    const list = source === 'saved' ? savedRows : source === 'past' ? pastRows : [...savedRows, ...pastRows];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) => {
      const haystack = [
        row.name,
        row.past?.showTitle,
        ...row.data.items.map((item) =>
          item.type === 'song' && item.songNumber != null ? songTitle(item.songNumber) : item.label || item.mediaPath || item.bibleRef,
        ),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
    // songTitle reads `titles`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, past, tab, source, query, titles]);

  const canAdd = !!show && !locked;
  const groupName = (id: string) => {
    const group = groups.find((g) => g.id === id);
    return group ? groupDisplayName(group, LL.SHOW_GROUPS.DEFAULT()) : B.GROUP_FALLBACK();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="span" noWrap sx={{ minWidth: 0 }}>
            {B.TITLE()}
          </Typography>
          <Chip label={rows.length} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={onClose} aria-label={LL.COMMON.CLOSE()} sx={{ flexShrink: 0 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        {/* Column layout so the list — not the dialog — owns the scrolling. */}
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, px: { xs: 2, sm: 3 }, gap: 1.5 }}>
          <Tabs value={tab} onChange={(_, value: LibraryKind) => setTab(value)} sx={{ minHeight: 40, flexShrink: 0 }}>
            <Tab value="group" label={B.TAB_GROUPS()} sx={{ minHeight: 40 }} />
            <Tab value="media" label={B.TAB_MEDIA()} sx={{ minHeight: 40 }} />
          </Tabs>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0 }}>
            <TextField
              size="small"
              placeholder={B.SEARCH()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <ToggleButtonGroup exclusive size="small" value={source} onChange={(_, value: Source | null) => value && setSource(value)}>
              <ToggleButton value="all" sx={{ textTransform: 'none', px: 1.5 }}>
                {B.SOURCE_ALL()}
              </ToggleButton>
              <ToggleButton value="saved" sx={{ textTransform: 'none', px: 1.5 }}>
                {B.SOURCE_SAVED()}
              </ToggleButton>
              <ToggleButton value="past" sx={{ textTransform: 'none', px: 1.5 }}>
                {B.SOURCE_PAST()}
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Stack spacing={1} sx={{ flex: 1, minHeight: 240, overflowY: 'auto' }}>
            {rows.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                {query ? B.NO_MATCH() : tab === 'group' ? B.EMPTY_GROUPS() : B.EMPTY_MEDIA()}
              </Typography>
            )}
            {rows.map((row) => (
              <LibraryRow
                key={row.key}
                row={row}
                songTitle={songTitle}
                canAdd={canAdd}
                onAdd={() =>
                  onAdd(
                    { kind: row.kind, name: row.name, data: row.data },
                    { groupId: row.kind === 'group' ? (groupAfter === AT_END ? undefined : groupAfter) : mediaGroupId },
                  )
                }
                onSave={row.past ? () => void createEntry({ kind: row.kind, name: row.name, data: row.data }) : undefined}
                onDelete={row.savedId !== undefined ? () => setPendingDelete(row) : undefined}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
          {!show ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', mr: 'auto' }}>
              {B.NO_SHOW()}
            </Typography>
          ) : locked ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', mr: 'auto' }}>
              {B.LOCKED()}
            </Typography>
          ) : tab === 'group' ? (
            <TextField
              select
              size="small"
              label={B.INSERT_GROUP_AFTER()}
              value={groupAfter}
              onChange={(e) => setGroupAfter(e.target.value)}
              sx={{ mr: 'auto', minWidth: 220 }}
            >
              <MenuItem value={AT_END}>{B.AT_END()}</MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {groupName(group.id)}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              select
              size="small"
              label={B.ADD_MEDIA_TO()}
              value={groups.some((g) => g.id === mediaGroupId) ? mediaGroupId : ''}
              onChange={(e) => setMediaGroupId(e.target.value)}
              sx={{ mr: 'auto', minWidth: 220 }}
            >
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {groupName(group.id)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{B.DELETE()}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">{B.DELETE_QUESTION({ name: pendingDelete?.name ?? '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (pendingDelete?.savedId !== undefined) void deleteEntry({ id: pendingDelete.savedId });
              setPendingDelete(null);
            }}
          >
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export const LibraryDialog = stillWhileClosed(LibraryDialogBody);
