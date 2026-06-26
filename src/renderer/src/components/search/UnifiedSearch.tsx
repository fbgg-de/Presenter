import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  ClickAwayListener,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Paper,
  Popper,
  Skeleton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  MusicNote as MusicNoteIcon,
  Image as ImageIcon,
  MenuBook as MenuBookIcon,
  SelectAll as AllIcon,
  Church as ChurchIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useUnifiedSearchQuery } from '@/api/search.api';
import { useSearchSongsQuery, useGetSongsAllQuery } from '@/api/songs.api';
import type { SearchResult } from '@/api/search.api';
import { useDebounce } from '@/hooks/useDebounce';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { LibraryMusic as LibraryIcon } from '@mui/icons-material';

type SearchType = '' | 'song' | 'media' | 'bible' | 'churchtools';

interface UnifiedSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectSong?: (songNumber: number) => void;
  onSelectMedia?: (path: string) => void;
  onSelectStyle?: (styleId: number) => void;
  onSelectBible?: (ref: string) => void;
  /** When true, only search for songs and hide the type filter chips */
  songsOnly?: boolean;
  /** Callback to open the full song library modal */
  onOpenSongLibrary?: () => void;
  /** Callback to open the media library/browser */
  onOpenMediaBrowser?: () => void;
  /** When true, show the ChurchTools search tab (only if CT is enabled in session) */
  churchToolsEnabled?: boolean;
  /** Callback when a CCLI SongSelect suggestion is selected — receives the CCLI number, title and known metadata */
  onSelectChurchToolsSong?: (ccliNumber: number, songName: string, meta?: { author?: string | null; copyright?: string | null }) => void;
}

const TYPE_CHIPS: { type: SearchType; icon: typeof AllIcon; colorKey: string }[] = [
  { type: '', icon: AllIcon, colorKey: '#888' },
  { type: 'song', icon: MusicNoteIcon, colorKey: '#1976d2' },
  { type: 'media', icon: ImageIcon, colorKey: '#f9a825' },
  { type: 'bible', icon: MenuBookIcon, colorKey: '#388e3c' },
];

/** ChurchTools chip — appended conditionally when CT is enabled */
const CT_CHIP: { type: SearchType; icon: typeof AllIcon; colorKey: string } = {
  type: 'churchtools',
  icon: ChurchIcon,
  colorKey: '#7b1fa2',
};

const getTypeLabel = (type: SearchType, LL: ReturnType<typeof useI18nContext>['LL']): string => {
  switch (type) {
    case '':
      return LL.UNIFIED_SEARCH.ALL();
    case 'song':
      return LL.UNIFIED_SEARCH.SONGS();
    case 'media':
      return LL.UNIFIED_SEARCH.MEDIA();
    case 'bible':
      return LL.UNIFIED_SEARCH.BIBLE();
    case 'churchtools':
      return LL.UNIFIED_SEARCH.CHURCH_TOOLS();
    default:
      return type;
  }
};

const getResultIcon = (type: string) => {
  switch (type) {
    case 'song':
      return <MusicNoteIcon fontSize="small" sx={{ color: '#1976d2' }} />;
    case 'media':
      return <ImageIcon fontSize="small" sx={{ color: '#f9a825' }} />;
    case 'bible':
      return <MenuBookIcon fontSize="small" sx={{ color: '#388e3c' }} />;
    case 'churchtools':
      return <ChurchIcon fontSize="small" sx={{ color: '#7b1fa2' }} />;
    default:
      return <SearchIcon fontSize="small" />;
  }
};

export const UnifiedSearch = ({
  open,
  onClose,
  onSelectSong,
  onSelectMedia,
  onSelectStyle,
  onSelectBible,
  songsOnly = false,
  onOpenSongLibrary,
  onOpenMediaBrowser,
  churchToolsEnabled = false,
  onSelectChurchToolsSong,
}: UnifiedSearchProps) => {
  const { LL } = useI18nContext();
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<SearchType>(songsOnly ? 'song' : '');
  const [deepSearch, setDeepSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mountKey, setMountKey] = useState(0);

  // Persisted "include CCLI SongSelect results" preference.
  const { includeChurchToolsResults } = useGetSettings();
  const updateSetting = useUpdateSetting();
  const includeCt = churchToolsEnabled && includeChurchToolsResults;

  const debouncedQuery = useDebounce(query, 300);
  const isSearching = debouncedQuery.length >= 1;
  const isNumericQuery = /^\d+$/.test(debouncedQuery.trim());

  // Determine search mode for songs-only search
  const songSearchMode = isNumericQuery ? 'number' : deepSearch ? 'text' : 'title';

  // For songsOnly mode, use the dedicated SongsSearch endpoint with proper mode
  const { data: songSearchResults, isFetching: songSearchFetching } = useSearchSongsQuery(
    { q: debouncedQuery, mode: songSearchMode },
    { skip: !isSearching || !songsOnly },
  );

  // CCLI suggestions are blended in by the backend (single /rest/Search call) — for the
  // "all"/"songs" filters (and in songsOnly mode), deduped server-side against imported songs.
  const ccliActive = includeCt && (songsOnly || activeType === '' || activeType === 'song');
  const { data: unifiedResults, isFetching: unifiedFetching } = useUnifiedSearchQuery(
    { q: debouncedQuery, type: songsOnly ? 'song' : activeType === '' ? undefined : activeType, includeCcli: ccliActive },
    // In songsOnly mode the unified search is only used to pull in CCLI suggestions.
    { skip: !isSearching || (songsOnly && !ccliActive) },
  );

  // Local songs — only needed for the songsOnly browse list (when not searching).
  const { data: allSongs = [] } = useGetSongsAllQuery(undefined, { skip: isSearching || !songsOnly });

  // Map results to the rendering shape; CCLI suggestions (type 'churchtools') get a subtitle.
  // In songsOnly mode, local song hits come from SongsSearch and CCLI suggestions are appended.
  const ccliSuggestions = songsOnly && ccliActive ? (unifiedResults?.filter((r) => r.type === 'churchtools') ?? []) : [];
  const baseResults: (SearchResult & { subtitle?: string })[] | undefined = songsOnly
    ? [...(songSearchResults?.map((s) => ({ id: s.songNumber, name: s.title, type: 'song' as const })) ?? []), ...ccliSuggestions]
    : unifiedResults;
  const searchResults: (SearchResult & { subtitle?: string })[] | undefined = baseResults?.map((r) =>
    r.type === 'churchtools'
      ? { ...r, subtitle: [r.author, r.ccli ? `CCLI: ${r.ccli}` : null].filter(Boolean).join(' · ') || undefined }
      : r,
  );

  const searchFetching = songsOnly ? songSearchFetching || (ccliActive && unifiedFetching) : unifiedFetching;

  // Focus input when opened — use mountKey to force re-render
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveType(songsOnly ? 'song' : '');
      setDeepSearch(false);
      setMountKey((k) => k + 1);
      // Use multiple timeouts to ensure focus works reliably
      const t1 = setTimeout(() => inputRef.current?.focus(), 50);
      const t2 = setTimeout(() => inputRef.current?.focus(), 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    return undefined;
  }, [open, songsOnly]);

  const handleSelect = (result: SearchResult) => {
    switch (result.type) {
      case 'song':
        onSelectSong?.(Number(result.id));
        break;
      case 'media':
        onSelectMedia?.(String(result.id));
        break;
      case 'style':
        onSelectStyle?.(Number(result.id));
        break;
      case 'bible':
        onSelectBible?.(result.name);
        break;
      case 'churchtools':
        onSelectChurchToolsSong?.(Number(result.id), result.name, { author: result.author, copyright: result.copyright });
        break;
    }
    onClose();
  };

  // Group results by type when viewing all
  const groupedResults = (() => {
    if (!searchResults || searchResults.length === 0) return {};
    const groups: Record<string, (SearchResult & { subtitle?: string })[]> = {};
    for (const r of searchResults) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  })();

  const hasSearchResults = searchResults && searchResults.length > 0;

  const anchorRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Delay showing the dropdown until the anchor is measured
  useEffect(() => {
    if (open) {
      setIsReady(false);
      const t = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(t);
    }
    setIsReady(false);
    return undefined;
  }, [open, mountKey]);

  const showLibraryEntry =
    !songsOnly &&
    ((!!onOpenSongLibrary && (activeType === '' || activeType === 'song')) || (!!onOpenMediaBrowser && activeType === 'media'));
  const showDropdown = open && isReady && (isSearching || showLibraryEntry || (songsOnly && allSongs.length > 0));

  if (!open) return null;

  const dropdownContent = (
    <Paper
      variant="outlined"
      sx={{
        maxHeight: 'min(400px, calc(100vh - 200px))',
        overflow: 'auto',
        width: anchorRef.current?.offsetWidth ?? '100%',
      }}
    >
      {isSearching ? (
        <>
          {!hasSearchResults && !searchFetching && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.UNIFIED_SEARCH.NO_RESULTS()}
              </Typography>
            </Box>
          )}

          {/* While the (CCLI-backed) search is still loading and we have nothing yet, show
              animated placeholder rows rather than an empty box. */}
          {searchFetching && !hasSearchResults && (
            <List dense disablePadding>
              {[0, 1, 2, 3].map((i) => (
                <ListItem key={i} disablePadding>
                  <ListItemButton dense disableRipple sx={{ cursor: 'default' }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Skeleton variant="circular" width={20} height={20} />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Skeleton variant="text" width={`${70 - i * 8}%`} />}
                      secondary={<Skeleton variant="text" width="30%" />}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}

          {hasSearchResults && activeType === '' ? (
            <List dense disablePadding>
              {Object.entries(groupedResults).map(([type, items]) => (
                <Box key={type}>
                  <ListSubheader sx={{ lineHeight: '28px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {getTypeLabel(type as SearchType, LL)} ({items.length})
                  </ListSubheader>
                  {items.map((result) => (
                    <ListItem key={`${result.type}-${result.id}`} disablePadding>
                      <ListItemButton onClick={() => handleSelect(result)} dense>
                        <ListItemIcon sx={{ minWidth: 32 }}>{getResultIcon(result.type)}</ListItemIcon>
                        <ListItemText
                          primary={result.name}
                          secondary={result.subtitle ?? (result.type === 'song' ? `#${result.id}` : undefined)}
                          slotProps={{
                            primary: { variant: 'body2', noWrap: true },
                            secondary: { variant: 'caption' },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </Box>
              ))}
            </List>
          ) : hasSearchResults ? (
            <List dense disablePadding>
              {searchResults!.map((result) => (
                <ListItem key={`${result.type}-${result.id}`} disablePadding>
                  <ListItemButton onClick={() => handleSelect(result)} dense>
                    <ListItemIcon sx={{ minWidth: 32 }}>{getResultIcon(result.type)}</ListItemIcon>
                    <ListItemText
                      primary={result.name}
                      secondary={result.subtitle ?? (result.type === 'song' ? `#${result.id}` : undefined)}
                      slotProps={{
                        primary: { variant: 'body2', noWrap: true },
                        secondary: { variant: 'caption' },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : null}
        </>
      ) : songsOnly ? (
        // songsOnly (e.g. musician view): browse the full song list on empty focus.
        <List dense disablePadding>
          {allSongs.map((song) => (
            <ListItem key={song.songNumber} disablePadding>
              <ListItemButton
                onClick={() => {
                  onSelectSong?.(song.songNumber);
                  onClose();
                }}
                dense
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <MusicNoteIcon fontSize="small" sx={{ color: '#1976d2' }} />
                </ListItemIcon>
                <ListItemText
                  primary={song.title}
                  secondary={`#${song.songNumber}`}
                  slotProps={{ primary: { variant: 'body2', noWrap: true }, secondary: { variant: 'caption' } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      ) : (
        // Empty box (just focused): offer the library matching the active filter — the song
        // library for all/songs, the media library for media.
        <List dense disablePadding>
          {activeType === 'media' && onOpenMediaBrowser ? (
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => {
                  onOpenMediaBrowser();
                  onClose();
                }}
                dense
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <ImageIcon fontSize="small" sx={{ color: '#f9a825' }} />
                </ListItemIcon>
                <ListItemText primary={LL.UNIFIED_SEARCH.OPEN_MEDIA_LIBRARY()} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItemButton>
            </ListItem>
          ) : (activeType === '' || activeType === 'song') && onOpenSongLibrary ? (
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => {
                  onOpenSongLibrary();
                  onClose();
                }}
                dense
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <LibraryIcon fontSize="small" sx={{ color: '#1976d2' }} />
                </ListItemIcon>
                <ListItemText primary={LL.UNIFIED_SEARCH.OPEN_LIBRARY()} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItemButton>
            </ListItem>
          ) : null}
        </List>
      )}
    </Paper>
  );

  return (
    <ClickAwayListener onClickAway={onClose}>
      <Stack
        ref={anchorRef}
        sx={{
          gap: 0.5,
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Search input */}
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <TextField
            key={mountKey}
            inputRef={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDeepSearch(false);
            }}
            placeholder={LL.UNIFIED_SEARCH.PLACEHOLDER()}
            size="small"
            fullWidth
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onClose();
              } else if (e.key === 'Enter' && query.trim().length >= 1) {
                // Enter triggers deep search (searches within song lyrics/blocks)
                setDeepSearch(true);
              }
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchFetching ? (
                  <InputAdornment position="end">
                    <CircularProgress size={18} />
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        {/* Filter bar: a clean segmented type selector + (for song searches) a CCLI switch */}
        {!songsOnly && (
          <Stack direction="row" sx={{ px: 0.5, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={activeType}
              onChange={(_, value: SearchType | null) => value !== null && setActiveType(value)}
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  py: 0.25,
                  px: 1,
                  gap: 0.5,
                  border: 'none',
                  borderRadius: 1.5,
                },
                gap: 0.25,
              }}
            >
              {TYPE_CHIPS.map(({ type, icon: Icon, colorKey }) => (
                <ToggleButton key={type || 'all'} value={type}>
                  <Icon sx={{ fontSize: '1rem', color: activeType === type ? 'inherit' : colorKey }} />
                  {getTypeLabel(type, LL)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {churchToolsEnabled && (activeType === '' || activeType === 'song') && (
              <Tooltip title={LL.UNIFIED_SEARCH.INCLUDE_CHURCHTOOLS_HINT()}>
                <Stack
                  direction="row"
                  onClick={() => updateSetting('includeChurchToolsResults', !includeChurchToolsResults)}
                  sx={{
                    alignItems: 'center',
                    gap: 0.25,
                    pl: 1,
                    borderRadius: 4,
                    cursor: 'pointer',
                    flexShrink: 0,
                    color: includeChurchToolsResults ? CT_CHIP.colorKey : 'text.secondary',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {LL.UNIFIED_SEARCH.CCLI()}
                  </Typography>
                  <Switch
                    size="small"
                    checked={includeChurchToolsResults}
                    onChange={(e) => updateSetting('includeChurchToolsResults', e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Stack>
              </Tooltip>
            )}
          </Stack>
        )}
        {/* CCLI switch for songs-only mode (e.g. musician view), which has no type filter bar. */}
        {songsOnly && churchToolsEnabled && (
          <Stack direction="row" sx={{ px: 0.5, justifyContent: 'flex-end' }}>
            <Tooltip title={LL.UNIFIED_SEARCH.INCLUDE_CHURCHTOOLS_HINT()}>
              <Stack
                direction="row"
                onClick={() => updateSetting('includeChurchToolsResults', !includeChurchToolsResults)}
                sx={{
                  alignItems: 'center',
                  gap: 0.25,
                  pl: 1,
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: includeChurchToolsResults ? CT_CHIP.colorKey : 'text.secondary',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {LL.UNIFIED_SEARCH.CCLI()}
                </Typography>
                <Switch
                  size="small"
                  checked={includeChurchToolsResults}
                  onChange={(e) => updateSetting('includeChurchToolsResults', e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                />
              </Stack>
            </Tooltip>
          </Stack>
        )}
        {/* Deep search indicator */}
        {deepSearch && isSearching && (
          <Stack direction="row" spacing={0.5} sx={{ px: 0.5 }}>
            <Chip
              label={LL.UNIFIED_SEARCH.DEEP()}
              size="small"
              color="info"
              variant="outlined"
              onDelete={() => setDeepSearch(false)}
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
          </Stack>
        )}

        {/* Results — autocomplete-style dropdown overlay */}
        {showDropdown && (
          <Popper
            open
            anchorEl={anchorRef.current}
            placement="bottom-start"
            style={{ zIndex: 1300, width: anchorRef.current?.offsetWidth ?? undefined }}
            modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
          >
            {dropdownContent}
          </Popper>
        )}
      </Stack>
    </ClickAwayListener>
  );
};
