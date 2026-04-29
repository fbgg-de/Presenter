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
  Stack,
  TextField,
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
  FolderOpen as FolderOpenIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useUnifiedSearchQuery } from '@/api/search.api';
import { useSearchSongsQuery, useGetSongsAllQuery } from '@/api/songs.api';
import type { SearchResult } from '@/api/search.api';
import { useDebounce } from '@/hooks/useDebounce';

type SearchType = '' | 'song' | 'media' | 'bible';

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
}

const TYPE_CHIPS: { type: SearchType; icon: typeof AllIcon; colorKey: string }[] = [
  { type: '', icon: AllIcon, colorKey: '#888' },
  { type: 'song', icon: MusicNoteIcon, colorKey: '#1976d2' },
  { type: 'media', icon: ImageIcon, colorKey: '#f9a825' },
  { type: 'bible', icon: MenuBookIcon, colorKey: '#388e3c' },
];

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
}: UnifiedSearchProps) => {
  const { LL } = useI18nContext();
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<SearchType>(songsOnly ? 'song' : '');
  const [deepSearch, setDeepSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mountKey, setMountKey] = useState(0);

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

  // For unified search, use the unified endpoint
  const { data: unifiedResults, isFetching: unifiedFetching } = useUnifiedSearchQuery(
    { q: debouncedQuery, type: activeType || undefined },
    { skip: !isSearching || songsOnly },
  );

  // Map song search results to SearchResult format for consistent rendering
  const searchResults: SearchResult[] | undefined = songsOnly
    ? songSearchResults?.map((s) => ({ id: s.songNumber, name: s.title, type: 'song' as const }))
    : unifiedResults;
  const searchFetching = songsOnly ? songSearchFetching : unifiedFetching;

  // Full song list when not searching
  const { data: allSongs = [] } = useGetSongsAllQuery(undefined, {
    skip: isSearching,
  });

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
    }
    onClose();
  };

  // Group results by type when viewing all
  const groupedResults = (() => {
    if (!searchResults || searchResults.length === 0) return {};
    const groups: Record<string, SearchResult[]> = {};
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

  const showDropdown = open && isReady && (isSearching || allSongs.length > 0);

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
                          secondary={result.type === 'song' ? `#${result.id}` : undefined}
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
                      secondary={result.type === 'song' ? `#${result.id}` : undefined}
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
      ) : (
        // Show full song list when not searching
        <List dense disablePadding>
          {allSongs.length === 0 ? (
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
          ) : (
            allSongs.map((song) => (
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
                    slotProps={{
                      primary: { variant: 'body2', noWrap: true },
                      secondary: { variant: 'caption' },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
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
                endAdornment: (
                  <InputAdornment position="end">
                    {searchFetching && <CircularProgress size={18} />}
                    {onOpenSongLibrary && (
                      <Tooltip title={LL.SONGS.LIBRARY()}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSongLibrary();
                          }}
                        >
                          <FolderOpenIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </InputAdornment>
                ),
              },
            }}
          />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        {/* Type filter chips */}
        {!songsOnly && (
          <Stack direction="row" spacing={0.5} sx={{ px: 0.5, flexWrap: 'wrap' }}>
            {TYPE_CHIPS.map(({ type, icon: Icon, colorKey }) => (
              <Chip
                key={type || 'all'}
                icon={<Icon sx={{ fontSize: '0.9rem' }} />}
                label={getTypeLabel(type, LL)}
                size="small"
                variant={activeType === type ? 'filled' : 'outlined'}
                color={activeType === type ? 'primary' : 'default'}
                onClick={() => setActiveType(type)}
                sx={{
                  fontSize: '0.7rem',
                  height: 24,
                  ...(activeType === type ? {} : { borderColor: colorKey, '& .MuiChip-icon': { color: colorKey } }),
                }}
              />
            ))}
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
