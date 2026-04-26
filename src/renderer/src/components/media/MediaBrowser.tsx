import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardActionArea,
  CardMedia,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
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
  InsertDriveFile as FileIcon,
  Link as LinkIcon,
  Folder as FolderIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { ColorPicker } from '@/components/style/ColorPicker';
import type { MediaSubType } from '@/api/shows.api';
import { useGetSettings } from '@/store/settingsSlice';
import { getMediaBaseUrl, isElectronApp } from '@/utils';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
const PAGE_SIZE = 50;

interface MediaFile {
  name: string;
  path: string; // relative to media root
  type: 'image' | 'video';
  thumbnailUrl?: string;
}

interface MediaBrowserProps {
  open: boolean;
  onClose: () => void;
  mode?: 'add' | 'pick';
  pickType?: 'image' | 'video' | 'any';
  onAdd: (mediaSubType: MediaSubType, mediaPath?: string, mediaColor?: string) => void;
  onPick?: (relativePath: string) => void;
}

export const MediaBrowser = ({ open, onClose, onAdd, mode = 'add', pickType = 'any', onPick }: MediaBrowserProps) => {
  const { LL } = useI18nContext();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Folder navigation
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  // Paginated file listing
  const [dirs, setDirs] = useState<string[]>([]);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

  const { mediaPath } = useGetSettings();

  const mediaBaseUrl = useMemo(() => getMediaBaseUrl(mediaPath), [mediaPath]);

  // Abort controller for in-flight fetches
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous flag to prevent concurrent load-more invocations (IntersectionObserver can fire multiple times before React state updates)
  const loadingMoreRef = useRef(false);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const showImageTab = mode === 'add' || pickType === 'image' || pickType === 'any';
  const showVideoTab = mode === 'add' || pickType === 'video' || pickType === 'any';
  const showColorTab = mode === 'add';

  // Determine which tab's file type filter to apply.
  // When imageTab is hidden (pickType='video'), the video tab renders at index 0,
  // so we can't use tab index alone.
  const currentType: 'image' | 'video' = showImageTab && activeTab === 0 ? 'image' : 'video';

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

      let didAbort = false;
      try {
        const subPath = path.join('/');
        const params = new URLSearchParams({
          path: subPath,
          offset: String(offsetArg),
          limit: String(PAGE_SIZE),
        });

        // Retry once with a short backoff on network errors — covers the
        // narrow window between server-start completion and the socket
        // actually accepting connections.
        const url = `${mediaBaseUrl}/list?${params}`;
        let response: Response | null = null;
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            response = await fetch(url, { signal });
            break;
          } catch (err) {
            lastErr = err;
            if (signal?.aborted) throw err;
            await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
          }
        }
        if (!response) throw lastErr ?? new Error('Network error');

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

        const data: { dirs: string[]; files: string[]; totalFiles: number } = await response.json();

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
            thumbnailUrl: `${mediaBaseUrl}/${relPath.split('/').map(encodeURIComponent).join('/')}`,
          });
        }

        if (replace) {
          setDirs(data.dirs);
          setFiles(mapped);
        } else {
          setFiles((prev) => {
            const existingPaths = new Set(prev.map((f) => f.path));
            const newFiles = mapped.filter((f) => !existingPaths.has(f.path));
            return [...prev, ...newFiles];
          });
        }

        setTotalFiles(data.totalFiles);
        const newOffset = offsetArg + mapped.length;
        setOffset(newOffset);
        setHasMore(newOffset < data.totalFiles);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          didAbort = true;
          return;
        }
        if (replace) setError(err instanceof Error ? err.message : 'Failed to load files');
      } finally {
        loadingMoreRef.current = false;
        // Always clear loading state — previously we skipped this on abort
        // which left the spinner up forever after a quick tab/folder switch.
        if (!didAbort) {
          replace ? setLoading(false) : setLoadingMore(false);
        }
      }
    },
    [mediaBaseUrl, mediaPath, LL],
  );

  // Reset state when dialog opens; set initial tab based on pickType
  useEffect(() => {
    if (!open) return;
    setActiveTab(0); // tab 0 = image (or video if image hidden)
    setSearchQuery('');
    setCurrentPath([]);
    setSelectedFile(null);
  }, [open]);

  // Start media server once when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isElectronApp() && window.api?.startMediaServer && mediaPath) {
      window.api.startMediaServer(mediaPath).catch(() => {
        /* already running */
      });
    }
  }, [open, mediaPath]);

  // Reset + load when dialog opens, tab changes, or folder changes
  useEffect(() => {
    if (!open) return;
    if (activeTab !== 0 && activeTab !== 1) return;
    if (!mediaBaseUrl) {
      setShowUrlInput(true);
      return;
    }
    setFiles([]);
    setDirs([]);
    setOffset(0);
    setHasMore(false);
    setSelectedFile(null);
    setLoading(false);
    fetchPage(currentPath, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab, currentPath, mediaBaseUrl]);

  // Intersection observer for endless scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore) return;
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
  }, [sentinelRef, hasMore, loadingMore, fetchPage, currentPath, offset]);

  // Filter files by type and search query
  const filteredFiles = useMemo(() => {
    return files
      .filter((f) => f.type === currentType)
      .filter((f) => (searchQuery ? f.name.toLowerCase().includes(searchQuery.toLowerCase()) : true));
  }, [files, currentType, searchQuery]);

  const handleNavigateInto = (dirName: string) => {
    setCurrentPath((prev) => [...prev, dirName]);
    setSearchQuery('');
  };

  const handleBreadcrumb = (index: number) => {
    // index === -1 means root
    setCurrentPath(index < 0 ? [] : currentPath.slice(0, index + 1));
    setSearchQuery('');
  };

  const handleAddColor = () => {
    onAdd('color', undefined, selectedColor);
    onClose();
  };

  const handleAddFile = (file: MediaFile) => {
    if (mode === 'pick' && onPick) {
      onPick(file.path);
      onClose();
      return;
    }
    onAdd(file.type, file.path);
    onClose();
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    const ext = urlInput.substring(urlInput.lastIndexOf('.')).toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(ext);
    if (mode === 'pick' && onPick) {
      onPick(urlInput.trim());
    } else {
      onAdd(isVideo ? 'video' : 'image', urlInput.trim());
    }
    setUrlInput('');
    onClose();
  };

  const renderFileGrid = (type: 'image' | 'video') => {
    if (loading) {
      return (
        <Box sx={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress color="warning" />
        </Box>
      );
    }

    if (error) {
      return (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      );
    }

    const hasContent = dirs.length > 0 || filteredFiles.length > 0;

    return (
      <Stack spacing={1.5}>
        {/* Breadcrumb */}
        {currentPath.length > 0 && (
          <Breadcrumbs sx={{ fontSize: '0.85rem' }}>
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={() => handleBreadcrumb(-1)}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
            >
              <HomeIcon sx={{ fontSize: 16 }} />
              {LL.MEDIA.ROOT_FOLDER()}
            </Link>
            {currentPath.map((seg, i) =>
              i < currentPath.length - 1 ? (
                <Link
                  key={i}
                  component="button"
                  underline="hover"
                  color="inherit"
                  onClick={() => handleBreadcrumb(i)}
                  sx={{ cursor: 'pointer' }}
                >
                  {seg}
                </Link>
              ) : (
                <Typography key={i} color="text.primary" fontSize="0.85rem">
                  {seg}
                </Typography>
              ),
            )}
          </Breadcrumbs>
        )}

        {/* Search bar */}
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            placeholder={type === 'image' ? LL.MEDIA.SEARCH_IMAGES() : LL.MEDIA.SEARCH_VIDEOS()}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
          <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setShowUrlInput(!showUrlInput)}>
            URL
          </Button>
        </Stack>

        {/* URL input */}
        {showUrlInput && (
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder={type === 'image' ? 'https://example.com/image.jpg' : 'https://example.com/video.mp4'}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
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
            <Button size="small" variant="contained" onClick={handleAddUrl} disabled={!urlInput.trim()} startIcon={<AddIcon />}>
              {LL.COMMON.ADD()}
            </Button>
          </Stack>
        )}

        {/* Grid: folders + files */}
        {hasContent ? (
          <>
            <Grid container spacing={1.5}>
              {/* Subdirectories */}
              {!searchQuery &&
                dirs.map((dir) => (
                  <Grid key={`dir-${dir}`} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                    <Card sx={{ border: 2, borderColor: 'transparent', transition: 'border-color 0.2s' }}>
                      <CardActionArea onClick={() => handleNavigateInto(dir)}>
                        <Box
                          sx={{
                            height: 100,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'action.hover',
                            flexDirection: 'column',
                            gap: 0.5,
                          }}
                        >
                          <FolderIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                        </Box>
                        <Stack sx={{ p: 1 }}>
                          <Typography variant="caption" noWrap title={dir}>
                            {dir}
                          </Typography>
                        </Stack>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}

              {/* Files */}
              {filteredFiles.map((file) => (
                <Grid key={file.path} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                  <Card
                    sx={{
                      border: 2,
                      borderColor: selectedFile?.path === file.path ? 'primary.main' : 'transparent',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <CardActionArea
                      onClick={() => setSelectedFile(file)}
                      onDoubleClick={() => handleAddFile(file)}
                      onMouseEnter={() => type === 'video' && setHoveredVideo(file.path)}
                      onMouseLeave={() => type === 'video' && setHoveredVideo(null)}
                    >
                      {type === 'image' ? (
                        <CardMedia
                          component="img"
                          height={100}
                          image={file.thumbnailUrl || file.path}
                          alt={file.name}
                          sx={{ objectFit: 'cover' }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : hoveredVideo === file.path ? (
                        <video
                          src={file.thumbnailUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        /* Static first-frame thumbnail for non-hovered videos */
                        <video
                          src={file.thumbnailUrl}
                          muted
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            (e.target as HTMLVideoElement).currentTime = 0.5;
                          }}
                          style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                        />
                      )}
                      <Stack sx={{ p: 1 }}>
                        <Typography variant="caption" noWrap title={file.name}>
                          {file.name}
                        </Typography>
                      </Stack>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Infinite scroll sentinel / load-more */}
            {hasMore && (
              <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                {loadingMore ? (
                  <CircularProgress size={24} color="warning" />
                ) : (
                  <Button size="small" variant="text" onClick={() => fetchPage(currentPath, offset, false)}>
                    {LL.MEDIA.LOAD_MORE()} ({totalFiles - offset} {LL.COMMON.LOAD_MORE().toLowerCase()})
                  </Button>
                )}
              </Box>
            )}
          </>
        ) : !showUrlInput ? (
          <Box sx={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            {type === 'image' ? (
              <BrokenImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            ) : (
              <FileIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            )}
            <Typography color="text.secondary">{LL.MEDIA.NO_FILES()}</Typography>
            {!mediaBaseUrl && (
              <Typography variant="caption" color="text.secondary" textAlign="center">
                {LL.MEDIA.CONFIGURE_PATH()}
              </Typography>
            )}
            <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setShowUrlInput(true)}>
              {LL.MEDIA.ADD_BY_URL()}
            </Button>
          </Box>
        ) : null}
      </Stack>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ImageIcon color="warning" />
          <Typography variant="h6">{LL.MEDIA.BROWSER()}</Typography>
          <Box flexGrow={1} />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Tabs
          value={activeTab}
          onChange={(_e, v) => {
            setActiveTab(v);
            setSearchQuery('');
            setSelectedFile(null);
            setCurrentPath([]);
          }}
          sx={{ mb: 2 }}
        >
          {showImageTab && <Tab icon={<ImageIcon />} label={LL.MEDIA.IMAGE()} iconPosition="start" />}
          {showVideoTab && <Tab icon={<VideocamIcon />} label={LL.MEDIA.VIDEO()} iconPosition="start" />}
          {showColorTab && <Tab icon={<PaletteIcon />} label={LL.MEDIA.COLOR()} iconPosition="start" />}
        </Tabs>

        {activeTab === 0 && showImageTab && renderFileGrid('image')}
        {activeTab === (showImageTab ? 1 : 0) && showVideoTab && renderFileGrid('video')}
        {activeTab === (showImageTab && showVideoTab ? 2 : showImageTab || showVideoTab ? 1 : 0) && showColorTab && (
          <Stack spacing={2} sx={{ maxWidth: 400, mx: 'auto' }}>
            <Typography variant="body2" color="text.secondary">
              {LL.MEDIA.SELECT_COLOR()}
            </Typography>
            <ColorPicker value={selectedColor} onChange={setSelectedColor} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        {(activeTab === 0 || activeTab === 1) && selectedFile && (
          <Button onClick={() => handleAddFile(selectedFile)} variant="contained" color="warning" startIcon={<AddIcon />}>
            {LL.MEDIA.ADD_TO_SHOW()}
          </Button>
        )}
        {activeTab === 2 && (
          <Button onClick={handleAddColor} variant="contained" color="warning" startIcon={<AddIcon />}>
            {LL.MEDIA.ADD_TO_SHOW()}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
