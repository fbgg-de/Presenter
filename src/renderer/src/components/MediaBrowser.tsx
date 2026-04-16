import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardMedia,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
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
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { ColorPicker } from '@/components/ColorPicker';
import { useAppSelector } from '@/store';
import type { MediaSubType } from '@/api/shows.api';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

interface MediaFile {
  name: string;
  path: string;
  type: 'image' | 'video';
  size?: number;
  thumbnailUrl?: string;
}

/**
 * Check if running in Electron mode with the API available
 */
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.api;
};

/**
 * Get media server URL from Electron API or fallback to configured media path
 */
const getMediaBaseUrl = (mediaPath: string): string | null => {
  // Electron mode: use the local media server
  if (isElectron()) {
    return `http://localhost:9100`;
  }
  // Browser mode: if a media path is configured, use it directly
  if (mediaPath) {
    return mediaPath.replace(/\/+$/, '');
  }
  return null;
};

interface MediaBrowserProps {
  open: boolean;
  onClose: () => void;
  onAdd: (mediaSubType: MediaSubType, mediaPath?: string, mediaColor?: string) => void;
}

export const MediaBrowser = ({ open, onClose, onAdd }: MediaBrowserProps) => {
  const { LL } = useI18nContext();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Media file listing state
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);

  const mediaPath = useAppSelector((state) => state.settings.mediaPath);
  const mediaBaseUrl = useMemo(() => getMediaBaseUrl(mediaPath), [mediaPath]);

  // Load media files from Electron or configured path
  const loadMediaFiles = useCallback(async () => {
    if (!mediaBaseUrl) return;
    setLoading(true);
    setError(null);

    try {
      // Try Electron IPC first
      if (isElectron()) {
        try {
          const response = await fetch(`${mediaBaseUrl}/list`);
          if (response.ok) {
            const files: string[] = await response.json();
            const mapped: MediaFile[] = files.map((name) => {
              const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
              const isVideo = VIDEO_EXTENSIONS.includes(ext);
              return {
                name,
                path: `${mediaBaseUrl}/${encodeURIComponent(name)}`,
                type: isVideo ? 'video' : 'image',
              };
            });
            setMediaFiles(mapped);
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to URL-based listing
        }
      }

      // Browser fallback: we can't list directories, show URL input mode
      setMediaFiles([]);
      setShowUrlInput(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media files');
    } finally {
      setLoading(false);
    }
  }, [mediaBaseUrl]);

  useEffect(() => {
    if (open && (activeTab === 0 || activeTab === 1)) {
      loadMediaFiles();
    }
  }, [open, activeTab, loadMediaFiles]);

  // Filter files by type and search
  const filteredFiles = useMemo(() => {
    const type = activeTab === 0 ? 'image' : 'video';
    return mediaFiles
      .filter((f) => f.type === type)
      .filter((f) => (searchQuery ? f.name.toLowerCase().includes(searchQuery.toLowerCase()) : true));
  }, [mediaFiles, activeTab, searchQuery]);

  const handleAddColor = () => {
    onAdd('color', undefined, selectedColor);
    onClose();
  };

  const handleAddFile = (file: MediaFile) => {
    onAdd(file.type, file.path);
    onClose();
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    const ext = urlInput.substring(urlInput.lastIndexOf('.')).toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(ext);
    onAdd(isVideo ? 'video' : 'image', urlInput.trim());
    setUrlInput('');
    onClose();
  };

  const renderFileGrid = (type: 'image' | 'video') => {
    if (loading) {
      return (
        <Box sx={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="text.secondary">{LL.COMMON.LOADING()}</Typography>
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

    return (
      <Stack spacing={2}>
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

        {/* File grid */}
        {filteredFiles.length > 0 ? (
          <Grid container spacing={1.5}>
            {filteredFiles.map((file) => (
              <Grid key={file.name} size={{ xs: 6, sm: 4, md: 3 }}>
                <Card
                  sx={{
                    border: 2,
                    borderColor: selectedFile?.name === file.name ? 'primary.main' : 'transparent',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <CardActionArea onClick={() => setSelectedFile(file)} onDoubleClick={() => handleAddFile(file)}>
                    {type === 'image' ? (
                      <CardMedia
                        component="img"
                        height={120}
                        image={file.path}
                        alt={file.name}
                        sx={{ objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: 120,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'action.hover',
                        }}
                      >
                        <VideocamIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                      </Box>
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
        ) : !showUrlInput ? (
          <Box
            sx={{
              minHeight: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
          }}
          sx={{ mb: 2 }}
        >
          <Tab icon={<ImageIcon />} label={LL.MEDIA.IMAGE()} iconPosition="start" />
          <Tab icon={<VideocamIcon />} label={LL.MEDIA.VIDEO()} iconPosition="start" />
          <Tab icon={<PaletteIcon />} label={LL.MEDIA.COLOR()} iconPosition="start" />
        </Tabs>

        {/* Images tab */}
        {activeTab === 0 && renderFileGrid('image')}

        {/* Videos tab */}
        {activeTab === 1 && renderFileGrid('video')}

        {/* Solid Color tab */}
        {activeTab === 2 && (
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
