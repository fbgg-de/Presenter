/**
 * Everything the agenda does with the library: the dialog, adding an entry, saving a
 * group or entry (asking before replacing a saved one with the same name), and the suggestion
 * after a song is added ("Clouds loop was used with this song, add it?").
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { insertItemsIntoGroup, setOrderAndGroups } from '@/store/showSlice';
import { loadShowSongs } from '@/store/songsSlice';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import type { Show, ShowGroup, ShowItem } from '@/api/shows.api';
import {
  useCreateLibraryEntryMutation,
  useGetLibraryEntriesQuery,
  useGetPastGroupsQuery,
  useUpdateLibraryEntryMutation,
  type LibraryData,
  type LibraryKind,
} from '@/api/library.api';
import {
  copyGroup,
  copyItems,
  groupLibraryData,
  insertGroup,
  mediaLibraryData,
  songMediaSuggestion,
  type SongMediaSuggestion,
} from '@/library/libraryData';
import { mediaItemLabel } from '@/media/mediaItem';
import { DEFAULT_GROUP_ID, groupDisplayName } from '@/utils/showGroups';
import { LibraryDialog, type LibraryEntryPayload } from './LibraryDialog';

export function useLibraryActions({ show, locked }: { show: Show | null; locked: boolean }) {
  const { LL, locale } = useI18nContext();
  const B = LL.LIBRARY;
  const dispatch = useAppDispatch();
  const { activeItemIndex } = useGetPresentationSettings('activeItemIndex');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const [replace, setReplace] = useState<{ kind: LibraryKind; name: string; data: LibraryData; id: number } | null>(null);
  const { data: saved = [] } = useGetLibraryEntriesQuery(undefined, { skip: !show });
  const { data: pastGroups = [] } = useGetPastGroupsQuery({ exclude: show?.title ?? '' }, { skip: !show || locked });
  const [createEntry] = useCreateLibraryEntryMutation();
  const [updateEntry] = useUpdateLibraryEntryMutation();

  const groups = show?.groups ?? [];
  const order = show?.order ?? [];

  /** A group goes after `target.groupId` (else at the end); a media entry goes into it. */
  const add = (payload: LibraryEntryPayload, target?: { groupId?: string; afterIndex?: number }) => {
    if (!show || locked) return;
    if (payload.kind === 'group') {
      const copy = copyGroup(payload.data, groups, payload.name || B.GROUP_FALLBACK());
      const next = insertGroup(order, groups, copy, target?.groupId);
      dispatch(setOrderAndGroups(next));
      // Songs of the group that this show did not have yet are loaded for the slides.
      void dispatch(loadShowSongs({ ...show, order: next.order, groups: next.groups }));
      setNotice({ severity: 'success', message: B.ADDED_GROUP({ name: copy.group.name }) });
      return;
    }
    const groupId = target?.groupId ?? order[activeItemIndex]?.groupId ?? groups.at(-1)?.id ?? DEFAULT_GROUP_ID;
    const items = copyItems(payload.data.items, groupId);
    dispatch(insertItemsIntoGroup({ items, groupId, afterIndex: target?.afterIndex }));
    setNotice({ severity: 'success', message: B.ADDED_MEDIA({ name: payload.name }) });
  };

  const save = async (kind: LibraryKind, name: string, data: LibraryData, replaceId?: number) => {
    try {
      if (replaceId !== undefined) await updateEntry({ id: replaceId, name, data }).unwrap();
      else await createEntry({ kind, name, data }).unwrap();
      setNotice({ severity: 'success', message: B.SAVED({ name }) });
    } catch {
      setNotice({ severity: 'error', message: B.SAVE_FAILED() });
    }
  };

  /** Save, or ask first when a saved entry of that kind already has the name. */
  const saveOrAsk = (kind: LibraryKind, name: string, data: LibraryData) => {
    const existing = saved.find((entry) => entry.kind === kind && entry.name === name);
    if (existing) setReplace({ kind, name, data, id: existing.id });
    else void save(kind, name, data);
  };

  const saveGroup = (group: ShowGroup) =>
    saveOrAsk('group', groupDisplayName(group, show?.title ?? B.GROUP_FALLBACK()), groupLibraryData(group, order));
  const saveItem = (item: ShowItem) => saveOrAsk('media', mediaItemLabel(item) || item.label || B.MEDIA_FALLBACK(), mediaLibraryData(item));

  // ── Suggestions after a song was added ──
  const [suggestion, setSuggestion] = useState<(SongMediaSuggestion & { songIndex: number; groupId: string }) | null>(null);
  const knownIds = useRef<{ showTitle?: string; ids: Set<string> }>({ ids: new Set() });
  useEffect(() => {
    const ids = new Set(order.map((item) => item.id).filter((id): id is string => !!id));
    const before = knownIds.current;
    knownIds.current = { showTitle: show?.title, ids };
    // A different show is not "adding a song".
    if (!show || before.showTitle !== show.title || locked) return;
    const added = order.findIndex((item) => item.type === 'song' && item.songNumber != null && item.id && !before.ids.has(item.id));
    if (added < 0) return;
    const song = order[added];
    const found = songMediaSuggestion(pastGroups, song.songNumber!, order);
    if (found) setSuggestion({ ...found, songIndex: added, groupId: song.groupId ?? DEFAULT_GROUP_ID });
    // Only a change in the entries can add a song.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const suggestionNames = suggestion?.items.map((item) => mediaItemLabel(item) || item.label).filter(Boolean) ?? [];

  const panel: ReactNode = (
    <LibraryDialog
      open={open}
      onClose={() => setOpen(false)}
      show={show}
      locked={locked}
      defaultGroupId={order[activeItemIndex] ? (order[activeItemIndex].groupId ?? DEFAULT_GROUP_ID) : undefined}
      onAdd={(payload, target) => add(payload, target)}
    />
  );

  const dialogs: ReactNode = (
    <>
      <Dialog open={!!replace} onClose={() => setReplace(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{B.REPLACE_TITLE()}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">{B.REPLACE_QUESTION({ name: replace?.name ?? '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplace(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button
            onClick={() => {
              if (replace) void save(replace.kind, `${replace.name} (${new Date().toLocaleDateString(locale)})`, replace.data);
              setReplace(null);
            }}
          >
            {B.SAVE_AS_NEW()}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (replace) void save(replace.kind, replace.name, replace.data, replace.id);
              setReplace(null);
            }}
          >
            {B.UPDATE_ENTRY()}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!suggestion}
        onClose={(_, reason) => reason !== 'clickaway' && setSuggestion(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          onClose={() => setSuggestion(null)}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                if (suggestion) {
                  const items = copyItems(suggestion.items, suggestion.groupId);
                  dispatch(insertItemsIntoGroup({ items, groupId: suggestion.groupId, afterIndex: suggestion.songIndex }));
                }
                setSuggestion(null);
              }}
            >
              {B.ADD()}
            </Button>
          }
        >
          {suggestion &&
            B.SUGGESTION({
              names: suggestionNames.slice(0, 2).join(', ') + (suggestionNames.length > 2 ? ` +${suggestionNames.length - 2}` : ''),
              date: new Date(suggestion.date.replace(' ', 'T')).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
            })}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!notice}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notice?.severity ?? 'success'} onClose={() => setNotice(null)}>
          {notice?.message}
        </Alert>
      </Snackbar>
    </>
  );

  return { open, setOpen, panel, dialogs, add, saveGroup, saveItem };
}
