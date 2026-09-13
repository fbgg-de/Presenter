import { useState, useEffect, useCallback, useMemo, useRef, type DragEvent, type KeyboardEvent } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  ButtonBase,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Image as ImageIcon,
  Videocam as VideocamIcon,
  Palette as PaletteIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Search as SearchIcon,
  BrokenImage as BrokenImageIcon,
  Link as LinkIcon,
  Folder as FolderIcon,
  Home as HomeIcon,
  GridView as GridViewIcon,
  ViewList as ViewListIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  CheckCircle as CheckCircleIcon,
  FileUpload as UploadIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import { ColorPicker } from '@/components/style/ColorPicker';
import type { MediaSubType } from '@/api/shows.api';
import { useGetSettings } from '@/store/settingsSlice';
import { formatFileSize, formatTime, getMediaBaseUrl, isElectronApp } from '@/utils';
import { useVideoThumbnails } from './useVideoThumbnails';
import { VideoPreview } from './VideoPreview';
import { MEDIA_SERVER_BASE } from '@/utils/mediaUrl';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
const PAGE_SIZE = 50;
const VIEW_KEY = 'mediaBrowser.view';
const SORT_KEY = 'mediaBrowser.sort';

type BrowseType = 'image' | 'video';
type ViewMode = 'grid' | 'list';
type SortKey = 'name' | 'date' | 'size' | 'duration';
interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}
const SORT_KEYS: SortKey[] = ['name', 'date', 'size', 'duration'];
/** Direction a column starts with: names A→Z, everything else biggest/newest first — except duration, short first. */
const DEFAULT_DIR: Record<SortKey, Sort['dir']> = { name: 'asc', date: 'desc', size: 'desc', duration: 'asc' };
const NAME_SORT: Sort = { key: 'name', dir: 'asc' };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface MediaFile {
  name: string;
  path: string; // relative to media root
  type: BrowseType;
  url: string;
  size?: number;
  /** ms since epoch */
  mtime?: number;
}

/** Remembered per device; storage can be missing or full, which just means the choice isn't kept. */
const readPref = <T,>(key: string, parse: (raw: string) => T | undefined, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return (raw === null ? undefined : parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
};

interface MediaBrowserProps {
  open: boolean;
  onClose: () => void;
  mode?: 'add' | 'pick';
  pickType?: 'image' | 'video' | 'any';
  initialType?: 'image' | 'video';
  selectLabel?: string;
  onAdd: (mediaSubType: MediaSubType, mediaPath?: string, mediaColor?: string, label?: string) => void;
  onPick?: (relativePath: string) => void;
}

export const MediaBrowser = ({
  open,
  onClose,
  onAdd,
  mode = 'add',
  pickType = 'any',
  onPick,
  initialType = 'image',
  selectLabel,
}: MediaBrowserProps) => {
  const { LL, locale } = useI18nContext();

  // ── Type (images / videos / color) ──
  const allowedTypes = useMemo(() => {
    const types: Array<BrowseType | 'color'> = [];
    if (mode === 'add' || pickType !== 'video') types.push('image');
    if (mode === 'add' || pickType !== 'image') types.push('video');
    if (mode === 'add') types.push('color');
    return types;
  }, [mode, pickType]);
  const [chosenType, setChosenType] = useState<BrowseType | 'color'>(initialType);
  // The sidebar reuses one instance for its "add image" and "add video" buttons.
  useEffect(() => {
    if (open && pickType !== 'any') setChosenType(pickType);
  }, [open, pickType]);
  const activeType = allowedTypes.includes(chosenType) ? chosenType : allowedTypes[0];
  const isColor = activeType === 'color';
  const currentType: BrowseType = activeType === 'color' ? 'image' : activeType;

  const [selectedColor, setSelectedColor] = useState('#000000');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
  };
  const [urlInput, setUrlInput] = useState('');
  const [urlName, setUrlName] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // ── View & sorting ──
  const [view, setView] = useState<ViewMode>(() =>
    readPref(VIEW_KEY, (raw) => (raw === 'list' || raw === 'grid' ? raw : undefined), 'grid'),
  );
  const [sort, setSort] = useState<Sort>(() =>
    readPref(
      SORT_KEY,
      (raw) => {
        const parsed = JSON.parse(raw) as Partial<Sort>;
        return SORT_KEYS.includes(parsed.key as SortKey) && (parsed.dir === 'asc' || parsed.dir === 'desc') ? (parsed as Sort) : undefined;
      },
      NAME_SORT,
    ),
  );
  const changeView = (next: ViewMode) => {
    setView(next);
    writePref(VIEW_KEY, next);
  };
  const changeSort = (next: Sort) => {
    setSort(next);
    writePref(SORT_KEY, JSON.stringify(next));
  };
  const sortBy = (key: SortKey) =>
    changeSort(effectiveSort.key === key ? { key, dir: effectiveSort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: DEFAULT_DIR[key] });

  // Folder navigation
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  // Paginated file listing
  const [dirs, setDirs] = useState<string[]>([]);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  /** Whether the server sends size and date — external web media servers may only send names. */
  const [hasMeta, setHasMeta] = useState(true);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});

  const effectiveSort: Sort =
    (sort.key === 'duration' && currentType !== 'video') || (!hasMeta && (sort.key === 'date' || sort.key === 'size')) ? NAME_SORT : sort;
  // Duration is only known once a video is decoded, so the server orders those by name.
  const serverSort: Sort = effectiveSort.key === 'duration' ? NAME_SORT : effectiveSort;

  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
    },
    [open],
  );
  const { mediaPath } = useGetSettings();

  const mediaBaseUrl = useMemo(() => getMediaBaseUrl(mediaPath), [mediaPath]);

  // Abort controller for in-flight fetches
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous flag to prevent concurrent load-more invocations (IntersectionObserver can fire multiple times before React state updates)
  const loadingMoreRef = useRef(false);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /** Fetch a page of the current directory */
  const fetchPage = useCallback(
    async (path: string[], offsetArg: number, replace: boolean) => {
      if (!mediaBaseUrl) return;

      if (replace) {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
      }
      const signal = abortRef.current?.signal;

      replace ? setLoading(true) : setLoadingMore(true);
      if (replace) setError(null);

      try {
        let baseUrl = mediaBaseUrl;
        if (isElectronApp() && window.api?.startMediaServer && mediaPath) baseUrl = await window.api.startMediaServer(mediaPath);
        if (signal?.aborted) return;
        const params = new URLSearchParams({
          path: path.join('/'),
          offset: String(offsetArg),
          limit: String(PAGE_SIZE),
          type: currentType,
          q: debouncedSearch,
          sort: serverSort.key,
          order: serverSort.dir,
        });
        const response = await fetch(baseUrl + '/list?' + params, { signal: AbortSignal.any([signal!, AbortSignal.timeout(10000)]) });
        if (signal?.aborted) return;
        // 503 → media path not configured / not present on disk.
        if (response.status === 503) {
          if (replace) {
            setError(LL.MEDIA.CONFIGURE_PATH());
            setDirs([]);
            setFiles([]);
            setHasMore(false);
            setTotalFiles(0);
          }
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data: {
          dirs: string[];
          files: string[];
          items?: { name: string; size: number; mtime: number }[];
          totalFiles: number;
          nextOffset?: number;
        } = await response.json();
        if (signal?.aborted) return;
        const meta = new Map(data.items?.map((item) => [item.name, item]));

        // Map filenames → MediaFile with full relative path
        const mapped: MediaFile[] = [];
        for (const name of data.files) {
          const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
          const isVideo = VIDEO_EXTENSIONS.includes(ext);
          const isImage = IMAGE_EXTENSIONS.includes(ext);
          if (!isVideo && !isImage) continue;
          const relPath = [...path, name].join('/');
          mapped.push({
            name,
            path: relPath,
            type: isVideo ? 'video' : 'image',
            url: `${baseUrl}/${relPath.split('/').map(encodeURIComponent).join('/')}`,
            size: meta.get(name)?.size,
            mtime: meta.get(name)?.mtime,
          });
        }

        if (replace) {
          setDirs(data.dirs);
          setFiles(mapped);
          setHasMeta(Array.isArray(data.items));
        } else {
          setFiles((prev) => {
            const existingPaths = new Set(prev.map((f) => f.path));
            const newFiles = mapped.filter((f) => !existingPaths.has(f.path));
            return [...prev, ...newFiles];
          });
        }

        setTotalFiles(data.totalFiles);
        const newOffset = data.nextOffset ?? offsetArg + data.files.length;
        setOffset(newOffset);
        setHasMore(data.files.length > 0 && newOffset < data.totalFiles);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load files');
      } finally {
        if (!signal?.aborted) {
          loadingMoreRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [mediaBaseUrl, mediaPath, LL, currentType, debouncedSearch, serverSort.key, serverSort.dir],
  );

  const folderKey = currentPath.join('/');
  useEffect(() => {
    if (!open || isColor) return;
    if (!mediaBaseUrl) {
      setShowUrlInput(true);
      return;
    }
    setFiles([]);
    setDirs([]);
    setOffset(0);
    setHasMore(false);
    setSelectedPath(null);
    setHoveredVideo(null);
    loadingMoreRef.current = false;
    void fetchPage(folderKey ? folderKey.split('/') : [], 0, true);
    return () => {
      abortRef.current?.abort();
    };
  }, [open, isColor, folderKey, mediaBaseUrl, fetchPage]);

  // Intersection observer for endless scroll
  useEffect(() => {
    if (!open || !sentinelRef.current || !hasMore || loadingMore || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          fetchPage(currentPath, offset, false);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [open, hasMore, loading, loadingMore, fetchPage, currentPath, offset, view]);

  // Filter files by type and search query (older servers ignore both parameters)
  const filteredFiles = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return files.filter((f) => f.type === currentType && (!query || f.name.toLowerCase().includes(query)));
  }, [files, currentType, searchQuery]);

  const videoInfo = useVideoThumbnails(
    filteredFiles.filter((f) => f.type === 'video').map((f) => f.url),
    open && !isColor && currentType === 'video',
  );

  // The server already sorts before paging; sorting again here covers durations and servers that can't sort.
  const sortedFiles = useMemo(() => {
    const { key, dir } = effectiveSort;
    const sign = dir === 'desc' ? -1 : 1;
    if (key === 'name') return [...filteredFiles].sort((a, b) => sign * collator.compare(a.name, b.name));
    const value = (f: MediaFile) => (key === 'date' ? f.mtime : key === 'size' ? f.size : videoInfo[f.url]?.duration);
    return [...filteredFiles].sort((a, b) => {
      const va = value(a),
        vb = value(b);
      // Files whose value isn't known (yet) go last instead of jumping around at the top.
      if (va === undefined || vb === undefined) return va === vb ? collator.compare(a.name, b.name) : va === undefined ? 1 : -1;
      return sign * (va - vb || collator.compare(a.name, b.name));
    });
  }, [filteredFiles, effectiveSort.key, effectiveSort.dir, videoInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath) ?? null, [files, selectedPath]);

  const noteImageSize = useCallback((url: string, img: HTMLImageElement) => {
    if (!img.naturalWidth) return;
    setImageSizes((prev) => (prev[url] ? prev : { ...prev, [url]: { width: img.naturalWidth, height: img.naturalHeight } }));
  }, []);

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const resolutionOf = (file: MediaFile) => {
    const size = file.type === 'video' ? videoInfo[file.url] : imageSizes[file.url];
    return size?.width && size.height ? `${size.width}×${size.height}` : undefined;
  };
  const durationOf = (file: MediaFile) => {
    const duration = file.type === 'video' ? videoInfo[file.url]?.duration : undefined;
    return duration === undefined ? undefined : formatTime(duration);
  };

  const changeType = (type: BrowseType | 'color') => {
    setChosenType(type);
    clearSearch();
    setSelectedPath(null);
  };

  const handleNavigateInto = (dirName: string) => {
    setCurrentPath((prev) => [...prev, dirName]);
    clearSearch();
  };

  const handleBreadcrumb = (index: number) => {
    // index === -1 means root
    setCurrentPath(index < 0 ? [] : currentPath.slice(0, index + 1));
    clearSearch();
  };

  const handleAddColor = () => {
    onAdd('color', undefined, selectedColor);
    onClose();
  };

  const handleAddFile = (file: MediaFile) => {
    // Keep custom server addresses (including Electron's fallback port) with the selection.
    const path = file.url.startsWith(MEDIA_SERVER_BASE + '/') ? file.path : file.url;
    if (mode === 'pick' && onPick) {
      onPick(path);
      onClose();
      return;
    }
    onAdd(file.type, path, undefined, file.name);
    onClose();
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    const pathname = urlInput.trim().split(/[?#]/, 1)[0];
    const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(ext) || (!IMAGE_EXTENSIONS.includes(ext) && currentType === 'video');
    if (mode === 'pick' && onPick) {
      onPick(urlInput.trim());
    } else {
      onAdd(isVideo ? 'video' : 'image', urlInput.trim(), undefined, urlName.trim() || undefined);
    }
    setUrlInput('');
    setUrlName('');
    onClose();
  };

  // ── Upload: copy files into the folder being browsed ──
  // Desktop app only. There the media folder is on this computer; on the web it is a URL on
  // somebody else's server, which offers nothing to write to.
  const canUpload = isElectronApp() && !!window.api?.importMediaFiles && !!mediaPath;
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  /** Enter/leave fire for every child crossed, so only the count reaching zero means "left". */
  const dragDepthRef = useRef(0);

  const typeOfName = (name: string): BrowseType | null => {
    const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext) ? 'video' : IMAGE_EXTENSIONS.includes(ext) ? 'image' : null;
  };

  const importFiles = async (sources: string[]) => {
    if (!canUpload || !sources.length || uploading) return;
    setUploading(true);
    try {
      const result = await window.api!.importMediaFiles(mediaPath, currentPath.join('/'), sources);
      const { copied, skipped } = result;
      const parts: string[] = [];
      if (copied.length) parts.push(LL.MEDIA.UPLOAD_DONE({ count: copied.length }));
      if (skipped.length) parts.push(LL.MEDIA.UPLOAD_SKIPPED({ count: skipped.length }));
      setUploadNotice({ severity: skipped.length ? (copied.length ? 'warning' : 'error') : 'success', message: parts.join(' · ') });
      if (!copied.length) return;
      // Show what was just added: stay and select it, or switch over when it was all videos
      // while images were on screen (or the other way round).
      const shown = copied.find((name) => typeOfName(name) === currentType);
      if (shown) {
        await fetchPage(currentPath, 0, true);
        setSelectedPath([...currentPath, shown].join('/'));
      } else {
        const other = typeOfName(copied[0]);
        if (other && allowedTypes.includes(other)) changeType(other);
      }
    } catch (err) {
      setUploadNotice({ severity: 'error', message: LL.MEDIA.UPLOAD_FAILED({ error: err instanceof Error ? err.message : String(err) }) });
    } finally {
      setUploading(false);
    }
  };

  const pickAndImport = async () => {
    const paths = await window.api?.pickMediaFiles?.();
    if (paths?.length) await importFiles(paths);
  };

  const isFileDrag = (e: DragEvent) => canUpload && !isColor && Array.from(e.dataTransfer.types).includes('Files');
  const dropHandlers = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current++;
      setDragActive(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (!dragDepthRef.current) setDragActive(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      const paths = Array.from(e.dataTransfer.files)
        .map((file) => window.api?.getPathForFile?.(file) ?? '')
        .filter(Boolean);
      void importFiles(paths);
    },
  };

  /** Click selects, double click or Enter uses the file right away. */
  const fileHandlers = (file: MediaFile) => ({
    onClick: () => setSelectedPath(file.path),
    onDoubleClick: () => handleAddFile(file),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      handleAddFile(file);
    },
    onMouseEnter: () => {
      if (file.type !== 'video') return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setHoveredVideo(file.path), 300);
    },
    onMouseLeave: () => {
      clearTimeout(hoverTimer.current);
      setHoveredVideo(null);
    },
  });
  const folderHandlers = (dir: string) => ({
    onClick: () => handleNavigateInto(dir),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleNavigateInto(dir);
    },
  });

  const showDirs = !searchQuery && dirs.length > 0;

  const renderThumb = (file: MediaFile, small?: boolean) =>
    file.type === 'image' ? (
      <Box
        component="img"
        loading="lazy"
        decoding="async"
        src={file.url}
        alt={file.name}
        onLoad={(e) => noteImageSize(file.url, e.currentTarget)}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
        sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    ) : small ? (
      videoInfo[file.url]?.thumbnail ? (
        <Box
          component="img"
          src={videoInfo[file.url].thumbnail}
          alt={file.name}
          sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <VideocamIcon sx={{ fontSize: 18, color: 'grey.500' }} />
        </Box>
      )
    ) : (
      <VideoPreview src={file.url} thumbnail={videoInfo[file.url]?.thumbnail} name={file.name} hovered={hoveredVideo === file.path} />
    );

  const renderGrid = () => (
    <Stack spacing={2}>
      {showDirs && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1 }}>
          {dirs.map((dir) => (
            <ButtonBase
              key={`dir-${dir}`}
              aria-label={dir}
              {...folderHandlers(dir)}
              sx={{
                justifyContent: 'flex-start',
                gap: 1,
                px: 1.5,
                py: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                '&:hover, &.Mui-focusVisible': { bgcolor: 'action.hover' },
              }}
            >
              <FolderIcon sx={{ color: 'warning.main' }} fontSize="small" />
              <Typography variant="body2" noWrap title={dir}>
                {dir}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
        {sortedFiles.map((file) => {
          const selected = selectedPath === file.path;
          const duration = durationOf(file);
          return (
            <ButtonBase
              key={file.path}
              aria-label={file.name}
              aria-pressed={selected}
              {...fileHandlers(file)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                textAlign: 'left',
                p: 0.5,
                borderRadius: 2,
                outline: 2,
                outlineColor: selected ? 'primary.main' : 'transparent',
                outlineOffset: -2,
                bgcolor: selected ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
                '&.Mui-focusVisible': { outlineColor: selected ? 'primary.main' : 'action.focus' },
              }}
            >
              <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: '#111', borderRadius: 1.5, overflow: 'hidden' }}>
                {renderThumb(file)}
                {duration && (
                  <Box
                    component="span"
                    sx={{
                      position: 'absolute',
                      right: 6,
                      bottom: 6,
                      px: 0.75,
                      borderRadius: 0.75,
                      bgcolor: 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      fontSize: '0.72rem',
                      lineHeight: 1.6,
                      fontVariantNumeric: 'tabular-nums',
                      pointerEvents: 'none',
                    }}
                  >
                    {duration}
                  </Box>
                )}
                {selected && (
                  <CheckCircleIcon
                    sx={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      fontSize: 22,
                      color: 'primary.main',
                      bgcolor: '#fff',
                      borderRadius: '50%',
                    }}
                  />
                )}
              </Box>
              <Typography variant="body2" noWrap title={file.name} sx={{ px: 0.5, pt: 0.75, pb: 0.25, fontSize: '0.8rem' }}>
                {file.name}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Stack>
  );

  const renderList = () => {
    const isVideo = currentType === 'video';
    const columns = 2 + (isVideo ? 1 : 0) + (hasMeta ? 2 : 0);
    const header = (key: SortKey, label: string) => (
      <TableSortLabel
        active={effectiveSort.key === key}
        direction={effectiveSort.key === key ? effectiveSort.dir : DEFAULT_DIR[key]}
        onClick={() => sortBy(key)}
      >
        {label}
      </TableSortLabel>
    );
    const hideSmall = { display: { xs: 'none', md: 'table-cell' } };
    return (
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', '& td, & th': { whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            <TableCell>{header('name', LL.MEDIA.SORT_NAME())}</TableCell>
            {isVideo && (
              <TableCell align="right" sx={{ width: 110 }}>
                {header('duration', LL.MEDIA.SORT_DURATION())}
              </TableCell>
            )}
            <TableCell align="right" sx={{ width: 120, ...hideSmall }}>
              {LL.MEDIA.RESOLUTION()}
            </TableCell>
            {hasMeta && (
              <TableCell align="right" sx={{ width: 120 }}>
                {header('size', LL.MEDIA.SORT_SIZE())}
              </TableCell>
            )}
            {hasMeta && <TableCell sx={{ width: 190, ...hideSmall }}>{header('date', LL.MEDIA.SORT_DATE())}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {showDirs &&
            dirs.map((dir) => (
              <TableRow key={`dir-${dir}`} hover tabIndex={0} aria-label={dir} {...folderHandlers(dir)} sx={{ cursor: 'pointer' }}>
                <TableCell colSpan={columns}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 64, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <FolderIcon sx={{ color: 'warning.main' }} />
                    </Box>
                    <Typography variant="body2" noWrap>
                      {dir}
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          {sortedFiles.map((file) => (
            <TableRow
              key={file.path}
              hover
              selected={selectedPath === file.path}
              tabIndex={0}
              aria-label={file.name}
              {...fileHandlers(file)}
              onMouseEnter={undefined}
              onMouseLeave={undefined}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <Box sx={{ width: 64, height: 36, flexShrink: 0, bgcolor: '#111', borderRadius: 0.75, overflow: 'hidden' }}>
                    {renderThumb(file, true)}
                  </Box>
                  <Typography variant="body2" noWrap title={file.name}>
                    {file.name}
                  </Typography>
                </Stack>
              </TableCell>
              {isVideo && (
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {durationOf(file) ?? '—'}
                </TableCell>
              )}
              <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', ...hideSmall }}>
                {resolutionOf(file) ?? '—'}
              </TableCell>
              {hasMeta && (
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {file.size === undefined ? '—' : formatFileSize(file.size)}
                </TableCell>
              )}
              {hasMeta && (
                <TableCell sx={{ color: 'text.secondary', ...hideSmall }}>
                  {file.mtime === undefined ? '—' : dateFormat.format(file.mtime)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderLoading = () =>
    view === 'grid' ? (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <Box key={i} sx={{ p: 0.5 }}>
            <Skeleton variant="rounded" sx={{ height: 'auto', aspectRatio: '16 / 9' }} />
            <Skeleton variant="text" width="70%" />
          </Box>
        ))}
      </Box>
    ) : (
      <Stack spacing={0.5}>
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={44} />
        ))}
      </Stack>
    );

  const renderBody = () => {
    if (loading) return renderLoading();
    if (error)
      return (
        <Alert severity="error" action={<Button onClick={() => void fetchPage(currentPath, 0, true)}>{LL.MEDIA.RETRY()}</Button>}>
          {error}
        </Alert>
      );
    if (showDirs || sortedFiles.length > 0 || hasMore)
      return (
        <>
          {view === 'grid' ? renderGrid() : renderList()}
          {/* Infinite scroll sentinel / load-more */}
          {hasMore && (
            <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
              {loadingMore ? (
                <CircularProgress size={24} color="warning" />
              ) : (
                <Button size="small" variant="text" onClick={() => fetchPage(currentPath, offset, false)}>
                  {LL.MEDIA.LOAD_MORE()}
                </Button>
              )}
            </Box>
          )}
        </>
      );
    return (
      <Stack spacing={1.5} sx={{ height: '100%', minHeight: 240, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {currentType === 'image' ? (
          <BrokenImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        ) : (
          <VideocamIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        )}
        <Typography sx={{ color: 'text.secondary' }}>
          {searchQuery ? LL.MEDIA.NO_RESULTS({ query: searchQuery }) : LL.MEDIA.NO_FILES()}
        </Typography>
        {canUpload && !searchQuery && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {LL.MEDIA.DROP_HINT()}
          </Typography>
        )}
        {!mediaBaseUrl && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {LL.MEDIA.CONFIGURE_PATH()}
          </Typography>
        )}
        {searchQuery ? (
          <Button size="small" variant="outlined" onClick={clearSearch}>
            {LL.MEDIA.CLEAR_SEARCH()}
          </Button>
        ) : (
          !showUrlInput && (
            <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setShowUrlInput(true)}>
              {LL.MEDIA.ADD_BY_URL()}
            </Button>
          )
        )}
      </Stack>
    );
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'name', label: LL.MEDIA.SORT_NAME() },
    ...(hasMeta
      ? [
          { key: 'date' as const, label: LL.MEDIA.SORT_DATE() },
          { key: 'size' as const, label: LL.MEDIA.SORT_SIZE() },
        ]
      : []),
    ...(currentType === 'video' ? [{ key: 'duration' as const, label: LL.MEDIA.SORT_DURATION() }] : []),
  ];

  const selectedDetails = selectedFile
    ? [
        resolutionOf(selectedFile),
        durationOf(selectedFile),
        selectedFile.size === undefined ? undefined : formatFileSize(selectedFile.size),
        selectedFile.mtime === undefined ? undefined : dateFormat.format(selectedFile.mtime),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const typeLabels = { image: LL.MEDIA.IMAGES(), video: LL.MEDIA.VIDEOS(), color: LL.MEDIA.COLOR() };
  const typeIcons = {
    image: <ImageIcon fontSize="small" />,
    video: <VideocamIcon fontSize="small" />,
    color: <PaletteIcon fontSize="small" />,
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth slotProps={{ paper: { ...dropHandlers, sx: { position: 'relative' } } }}>
      {dragActive && (
        <Box
          sx={{
            position: 'absolute',
            inset: 8,
            zIndex: 10,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
            border: '2px dashed',
            borderColor: 'warning.main',
            borderRadius: 2,
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.9),
          }}
        >
          <Stack spacing={1} sx={{ alignItems: 'center' }}>
            <UploadIcon sx={{ fontSize: 48, color: 'warning.main' }} />
            <Typography variant="h6">{LL.MEDIA.DROP_HERE({ folder: currentPath.at(-1) ?? LL.MEDIA.ROOT_FOLDER() })}</Typography>
          </Stack>
        </Box>
      )}
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {LL.MEDIA.BROWSER()}
          </Typography>
          {allowedTypes.length > 1 && (
            <ToggleButtonGroup size="small" exclusive value={activeType} onChange={(_e, v) => v && changeType(v)}>
              {allowedTypes.map((type) => (
                <ToggleButton key={type} value={type} sx={{ gap: 0.75, px: 1.5, textTransform: 'none' }}>
                  {typeIcons[type]}
                  {typeLabels[type]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      {!isColor && (
        <Stack spacing={1.25} sx={{ px: 3, pb: 1.5 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder={currentType === 'image' ? LL.MEDIA.SEARCH_IMAGES() : LL.MEDIA.SEARCH_VIDEOS()}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ flex: '1 1 240px' }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" aria-label={LL.MEDIA.CLEAR_SEARCH()} onClick={clearSearch} edge="end">
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <TextField
              select
              size="small"
              label={LL.MEDIA.SORT_BY()}
              value={effectiveSort.key}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                changeSort({ key, dir: DEFAULT_DIR[key] });
              }}
              sx={{ width: 170 }}
            >
              {sortOptions.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip title={effectiveSort.dir === 'asc' ? LL.MEDIA.SORT_ASC() : LL.MEDIA.SORT_DESC()}>
              <IconButton size="small" onClick={() => changeSort({ ...effectiveSort, dir: effectiveSort.dir === 'asc' ? 'desc' : 'asc' })}>
                {effectiveSort.dir === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v) => v && changeView(v)}>
              <Tooltip title={LL.MEDIA.VIEW_GRID()}>
                <ToggleButton value="grid" aria-label={LL.MEDIA.VIEW_GRID()}>
                  <GridViewIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title={LL.MEDIA.VIEW_LIST()}>
                <ToggleButton value="list" aria-label={LL.MEDIA.VIEW_LIST()}>
                  <ViewListIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
            {canUpload && (
              <Tooltip title={LL.MEDIA.UPLOAD_HINT()}>
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
                    onClick={() => void pickAndImport()}
                    disabled={uploading}
                  >
                    {LL.MEDIA.UPLOAD()}
                  </Button>
                </span>
              </Tooltip>
            )}
            <Tooltip title={LL.MEDIA.ADD_BY_URL()}>
              <IconButton size="small" color={showUrlInput ? 'primary' : 'default'} onClick={() => setShowUrlInput(!showUrlInput)}>
                <LinkIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          <Collapse in={showUrlInput} unmountOnExit>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <TextField
                size="small"
                sx={{ flex: '1 1 300px' }}
                placeholder={currentType === 'image' ? 'https://example.com/image.jpg' : 'https://example.com/video.mp4'}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddUrl();
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LinkIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {/* Optional short name — URLs are far too long to read in the show list. */}
              <TextField
                size="small"
                sx={{ minWidth: 160 }}
                label={LL.MEDIA.NAME_OPTIONAL()}
                value={urlName}
                onChange={(e) => setUrlName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddUrl();
                }}
              />
              <Button size="small" variant="contained" onClick={handleAddUrl} disabled={!urlInput.trim()} startIcon={<AddIcon />}>
                {LL.COMMON.ADD()}
              </Button>
            </Stack>
          </Collapse>

          {(currentPath.length > 0 || dirs.length > 0) && (
            <Breadcrumbs sx={{ fontSize: '0.85rem' }}>
              <Link
                component="button"
                underline="hover"
                color={currentPath.length ? 'inherit' : 'text.primary'}
                onClick={() => handleBreadcrumb(-1)}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <HomeIcon sx={{ fontSize: 16 }} />
                {LL.MEDIA.ROOT_FOLDER()}
              </Link>
              {currentPath.map((seg, i) =>
                i < currentPath.length - 1 ? (
                  <Link key={i} component="button" underline="hover" color="inherit" onClick={() => handleBreadcrumb(i)}>
                    {seg}
                  </Link>
                ) : (
                  <Typography key={i} sx={{ color: 'text.primary', fontSize: '0.85rem' }}>
                    {seg}
                  </Typography>
                ),
              )}
            </Breadcrumbs>
          )}
        </Stack>
      )}

      {uploading && <LinearProgress color="warning" />}
      <DialogContent dividers sx={{ height: 'min(64vh, 720px)', ...(view === 'list' && !isColor && !loading && { pt: 0 }) }}>
        {isColor ? (
          <Stack spacing={2} sx={{ maxWidth: 400, mx: 'auto', py: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {LL.MEDIA.SELECT_COLOR()}
            </Typography>
            <ColorPicker value={selectedColor} onChange={setSelectedColor} />
          </Stack>
        ) : (
          renderBody()
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!isColor &&
            !loading &&
            (selectedFile ? (
              <Typography variant="body2" noWrap title={selectedFile.name}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {selectedFile.name}
                </Box>
                {selectedDetails && (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {' · ' + selectedDetails}
                  </Box>
                )}
              </Typography>
            ) : (
              !error && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {LL.MEDIA.FILE_COUNT({ count: totalFiles })}
                </Typography>
              )
            ))}
        </Box>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        {isColor ? (
          <Button onClick={handleAddColor} variant="contained" color="warning" startIcon={<AddIcon />}>
            {LL.MEDIA.ADD_TO_SHOW()}
          </Button>
        ) : (
          <Button
            onClick={() => selectedFile && handleAddFile(selectedFile)}
            disabled={!selectedFile}
            variant="contained"
            color="warning"
            startIcon={<AddIcon />}
          >
            {selectLabel ?? LL.MEDIA.ADD_TO_SHOW()}
          </Button>
        )}
      </DialogActions>
      <Snackbar
        open={!!uploadNotice}
        autoHideDuration={6000}
        onClose={() => setUploadNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={uploadNotice?.severity ?? 'success'} variant="filled" onClose={() => setUploadNotice(null)}>
          {uploadNotice?.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
};
