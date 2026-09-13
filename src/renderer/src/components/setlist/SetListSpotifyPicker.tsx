/**
 * Manages the Spotify recordings linked to one Set List Entry — an entry can have several (the
 * studio and a live version, or the recordings of two artists).
 *
 * Opens on suggestions for the song itself (title + first author, see api/SpotifyTracks.php);
 * typing replaces them with a free-text search. Every link and unlink is saved straight away, so
 * the covers in the set list row follow along while the dialog is still open.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Album as AlbumIcon,
  CheckCircle as LinkedIcon,
  LinkOff as UnlinkIcon,
  OpenInNew as OpenIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useMetrics } from '@/hooks/useMetrics';
import { useSearchSpotifyTracksQuery, spotifyTrackUrl, type SpotifyTrack } from '@/api/spotify.api';
import {
  useAddSetListSpotifyTrackMutation,
  useGetSetListSpotifyTracksQuery,
  useRemoveSetListSpotifyTrackMutation,
  type SetListEntry,
  type SetListSpotifyTrack,
} from '@/api/setLists.api';

/** Below this the field counts as empty and the song's own suggestions stay on screen. */
const MIN_QUERY_LENGTH = 2;

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const TrackCover = ({ url }: { url: string | null }) => (
  <Avatar variant="rounded" src={url ?? undefined} sx={{ width: 40, height: 40 }}>
    <AlbumIcon fontSize="small" />
  </Avatar>
);

const SectionHeading = ({ label, count }: { label: string; count?: number }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, pb: 0.5 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, flexShrink: 0 }}>
      {label}
    </Typography>
    {count != null && (
      <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
        {count}
      </Typography>
    )}
    <Divider sx={{ flex: 1, minWidth: 16 }} />
  </Stack>
);

interface SetListSpotifyPickerProps {
  open: boolean;
  onClose: () => void;
  setListId: number | null;
  entry: SetListEntry | null;
  /** Resolved by the manager, which falls back to the local song cache. */
  title: string;
  authors: string;
}

export const SetListSpotifyPicker = ({ open, onClose, setListId, entry, title, authors }: SetListSpotifyPickerProps) => {
  const { LL } = useI18nContext();
  const { trackEvent } = useMetrics();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /**
   * Track ids with a request in flight, and which way. An entry stays until the refetched links
   * show the change, so a row never flips back to its old state between save and refresh.
   */
  const [pending, setPending] = useState<Map<string, 'link' | 'unlink'>>(new Map());
  const debouncedSearch = useDebounce(search.trim(), 400);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setErrorMsg(null);
    setPending(new Map());
  }, [open, entry]);

  // Same cache entry the manager's rows read, so both stay in step.
  const { data: links } = useGetSetListSpotifyTracksQuery(setListId ?? 0, { skip: !open || setListId == null });
  const linked = useMemo(() => (links ?? []).filter((link) => link.entryId === entry?.id), [links, entry]);
  const linkedTrackIds = useMemo(() => new Set(linked.map((link) => link.trackId)), [linked]);

  useEffect(() => {
    setPending((current) => {
      const next = new Map([...current].filter(([trackId, kind]) => (kind === 'link') !== linkedTrackIds.has(trackId)));
      return next.size === current.size ? current : next;
    });
  }, [linkedTrackIds]);

  const [addLink] = useAddSetListSpotifyTrackMutation();
  const [removeLink] = useRemoveSetListSpotifyTrackMutation();

  const isFreeSearch = debouncedSearch.length >= MIN_QUERY_LENGTH;
  const { data, isFetching, isError } = useSearchSpotifyTracksQuery(isFreeSearch ? { q: debouncedSearch } : { title, artist: authors }, {
    skip: !open || !entry || (!isFreeSearch && !title),
  });
  const tracks = data?.tracks ?? [];

  const runPending = async (trackId: string, kind: 'link' | 'unlink', request: () => Promise<unknown>) => {
    setErrorMsg(null);
    setPending((current) => new Map(current).set(trackId, kind));
    try {
      await request();
    } catch {
      setErrorMsg(LL.SET_LISTS.SPOTIFY_SAVE_ERROR());
      setPending((current) => {
        const next = new Map(current);
        next.delete(trackId);
        return next;
      });
    }
  };

  const handleLink = (track: SpotifyTrack) => {
    if (!entry || setListId == null || linkedTrackIds.has(track.id) || pending.has(track.id)) return;
    void runPending(track.id, 'link', async () => {
      await addLink({
        setListId,
        entryId: entry.id,
        track: { trackId: track.id, name: track.name, artists: track.artists, imageUrl: track.imageUrl },
      }).unwrap();
      trackEvent('set_list_spotify_linked', 'song', String(entry.songNumber));
    });
  };

  const handleUnlink = (link: SetListSpotifyTrack) => {
    if (!entry || setListId == null || pending.has(link.trackId)) return;
    void runPending(link.trackId, 'unlink', async () => {
      await removeLink({ setListId, linkId: link.id }).unwrap();
      trackEvent('set_list_spotify_unlinked', 'song', String(entry.songNumber));
    });
  };

  const openButton = (url: string) => (
    <Tooltip title={LL.SET_LISTS.SPOTIFY_OPEN()}>
      <IconButton size="small" component="a" href={url} target="_blank" rel="noopener noreferrer">
        <OpenIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      slotProps={{ paper: { sx: { height: { xs: '100%', sm: 'min(90vh, 760px)' } } } }}
    >
      <DialogTitle>
        {LL.SET_LISTS.SPOTIFY_TITLE()}
        <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
          {authors ? `${title} · ${authors}` : title}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
        {errorMsg && (
          <Alert severity="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {/* What is linked stays pinned above the results, so searching never hides it. */}
        <Box sx={{ flexShrink: 0, maxHeight: '38%', overflowY: 'auto', pt: 0.5 }}>
          <SectionHeading label={LL.SET_LISTS.SPOTIFY_LINKED()} count={linked.length} />
          {linked.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', px: 1 }}>
              {LL.SET_LISTS.SPOTIFY_NONE_LINKED()}
            </Typography>
          ) : (
            <List dense disablePadding>
              {linked.map((link) => {
                const unlinking = pending.get(link.trackId) === 'unlink';
                return (
                  <ListItem
                    key={link.id}
                    sx={{ pr: '96px', opacity: unlinking ? 0.5 : 1 }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        {openButton(spotifyTrackUrl(link.trackId))}
                        <Tooltip title={LL.SET_LISTS.SPOTIFY_UNLINK()}>
                          <span>
                            <IconButton size="small" disabled={unlinking} onClick={() => handleUnlink(link)}>
                              {unlinking ? <CircularProgress size={16} /> : <UnlinkIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemAvatar sx={{ minWidth: 52 }}>
                      <TrackCover url={link.imageUrl} />
                    </ListItemAvatar>
                    <ListItemText
                      primary={link.name ?? link.trackId}
                      secondary={link.artists}
                      slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                      sx={{ minWidth: 0 }}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={LL.SET_LISTS.SPOTIFY_SEARCH_PLACEHOLDER()}
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

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <SectionHeading label={isFreeSearch ? LL.SET_LISTS.SPOTIFY_RESULTS() : LL.SET_LISTS.SPOTIFY_SUGGESTIONS()} />
          {isFetching ? (
            <Stack sx={{ alignItems: 'center', p: 4 }}>
              <CircularProgress size={28} />
            </Stack>
          ) : isError ? (
            <Alert severity="warning">{LL.SET_LISTS.SPOTIFY_ERROR()}</Alert>
          ) : tracks.length === 0 ? (
            <Typography sx={{ p: 2, color: 'text.secondary' }}>{LL.SET_LISTS.SPOTIFY_NO_RESULTS()}</Typography>
          ) : (
            <List dense disablePadding>
              {tracks.map((track) => {
                const isLinked = linkedTrackIds.has(track.id);
                const linking = pending.get(track.id) === 'link';
                return (
                  <ListItem key={track.id} disablePadding secondaryAction={track.url ? openButton(track.url) : undefined}>
                    <ListItemButton onClick={() => handleLink(track)} sx={{ borderRadius: 1 }}>
                      <ListItemAvatar sx={{ minWidth: 52 }}>
                        <TrackCover url={track.imageUrl} />
                      </ListItemAvatar>
                      <ListItemText
                        primary={track.name}
                        secondary={[track.artists, track.album, formatDuration(track.durationMs)].filter(Boolean).join(' · ')}
                        slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                        sx={{ minWidth: 0 }}
                      />
                      <Tooltip title={isLinked ? LL.SET_LISTS.SPOTIFY_ALREADY_LINKED() : LL.SET_LISTS.SPOTIFY_ADD()}>
                        <Box sx={{ display: 'flex', ml: 1, flexShrink: 0 }}>
                          {linking ? (
                            <CircularProgress size={18} />
                          ) : isLinked ? (
                            <LinkedIcon color="success" fontSize="small" />
                          ) : (
                            <AddIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          )}
                        </Box>
                      </Tooltip>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};
