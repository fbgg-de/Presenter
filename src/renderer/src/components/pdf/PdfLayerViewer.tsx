/**
 * PdfLayerViewer — shared popover panel for viewing and managing annotation layers.
 * Uses the database-backed PdfAnnotations API (per-annotation model).
 * Layer visibility is managed locally (client-side state) rather than in the DB.
 *
 * Two layout variants:
 * - **Edit mode** (`showDelete=true`): radio buttons to select the active layer,
 *   visibility toggles, rename/delete actions.
 * - **Footer / read-only** (`showDelete=false`): compact icon-only rows where
 *   clicking the layer name toggles visibility.
 */
import { useState, useCallback, useEffect, MouseEvent } from 'react';
import {
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Layers as LayersIcon,
  Delete as DeleteIcon,
  RadioButtonChecked as ActiveIcon,
  RadioButtonUnchecked as InactiveIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  useListAnnotationsQuery,
  useClearLayerMutation,
  useRenameAnnotationLayerMutation,
  type AnnotationDto,
} from '@/api/pdfAnnotations.api';

interface PdfLayerViewerProps {
  songNumber: number;
  filename: string;
  /** Show delete / rename / active-select controls (annotation edit mode) */
  showDelete?: boolean;
  /** Called after a layer is deleted — passes the layer name */
  onLayerDeleted?: (layer: string) => void;
  /** Called after a layer is renamed — passes old and new names */
  onLayerRenamed?: (oldKey: string, newKey: string) => void;
  /** Called after a new layer is created — passes the new name */
  onLayerCreated?: (newKey: string) => void;
  /**
   * Whether the in-memory canvas annotation overlay is visible.
   * When provided a "Show layers" toggle row is shown at the top.
   */
  showAnnotations?: boolean;
  onShowAnnotationsChange?: (visible: boolean) => void;
  /** The currently active layer key. */
  selectedLayer?: string;
  /** Called when the user clicks the active-layer icon for a layer. */
  onLayerSelect?: (layer: string) => void;
  /** Set of hidden layer names (local visibility state). */
  hiddenLayers: Set<string>;
  /** Toggle a layer's local visibility. */
  onToggleLayerVisibility: (layer: string) => void;
  /** Whether to show the per-layer visibility (eye) toggle. Defaults to true. */
  showVisibilityToggle?: boolean;
  /**
   * How the trigger button is rendered.
   * - `'icon'` (default): a small IconButton with the Layers icon — used inside the edit toolbar.
   * - `'chip'`: a Chip with a label — used in the footer.
   */
  triggerVariant?: 'icon' | 'chip';
  /** Label shown when triggerVariant is 'chip'. */
  triggerLabel?: string;
}

export const PdfLayerViewer = ({
  songNumber,
  filename,
  showDelete,
  onLayerDeleted,
  onLayerRenamed,
  onLayerCreated,
  showAnnotations,
  onShowAnnotationsChange,
  selectedLayer,
  onLayerSelect,
  hiddenLayers,
  onToggleLayerVisibility,
  showVisibilityToggle = true,
  triggerVariant = 'icon',
  triggerLabel,
}: PdfLayerViewerProps) => {
  const { LL } = useI18nContext();
  const [open, setOpen] = useState(false);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | undefined>(undefined);

  // ── New layer state ──
  const [showNewInput, setShowNewInput] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');

  // ── Rename state ──
  const [renamingLayer, setRenamingLayer] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ── RTK Query hooks ──
  const {
    data: annotationsData,
    isLoading: loading,
    refetch,
  } = useListAnnotationsQuery({ songNumber, filename }, { skip: !songNumber || !filename });
  const allAnnotations = (annotationsData as AnnotationDto[] | undefined) ?? [];

  // Derive unique layer names from the annotations
  const dbLayerNames = [...new Set(allAnnotations.map((a) => a.layer))];

  // Track locally created layers that don't yet have annotations
  const [localLayers, setLocalLayers] = useState<string[]>([]);

  // Merge DB-derived + locally-created layers (deduplicated)
  const layerNames = [...new Set([...dbLayerNames, ...localLayers])];

  // Clean up local layers when the DB catches up (layer has annotations now)
  useEffect(() => {
    setLocalLayers((prev) => prev.filter((l) => !dbLayerNames.includes(l)));
  }, [dbLayerNames.join(',')]);

  const [clearLayerMutation] = useClearLayerMutation();
  const [renameLayerMutation, { isLoading: isRenaming }] = useRenameAnnotationLayerMutation();

  const handleOpen = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setAnchorPos({ top: rect.top, left: rect.left + rect.width / 2 });
      setOpen(true);
      refetch();
    },
    [refetch],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setShowNewInput(false);
    setNewLayerName('');
    setRenamingLayer(null);
    setRenameValue('');
  }, []);

  /** "Show layers" global toggle */
  const handleShowAnnotationsChange = useCallback(
    (visible: boolean) => {
      onShowAnnotationsChange?.(visible);
    },
    [onShowAnnotationsChange],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await clearLayerMutation({ songNumber, filename, layer: name }).unwrap();
        onLayerDeleted?.(name);
      } catch (err) {
        console.error('[PdfLayerViewer] delete failed:', err);
      }
    },
    [songNumber, filename, clearLayerMutation, onLayerDeleted],
  );

  const handleCreateLayer = useCallback(async () => {
    const name = newLayerName.trim();
    if (!name) return;
    try {
      // Add to local state so it appears immediately in the list
      setLocalLayers((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setNewLayerName('');
      setShowNewInput(false);
      onLayerCreated?.(name);
    } catch (err) {
      console.error('[PdfLayerViewer] create failed:', err);
    }
  }, [newLayerName, onLayerCreated]);

  const handleStartRename = useCallback((name: string) => {
    setRenamingLayer(name);
    setRenameValue(name);
  }, []);

  const handleRename = useCallback(
    async (oldName: string) => {
      const newName = renameValue.trim();
      if (!newName || oldName === newName) {
        setRenamingLayer(null);
        return;
      }
      try {
        await renameLayerMutation({ songNumber, filename, oldName, newName }).unwrap();
        setRenamingLayer(null);
        setRenameValue('');
        onLayerRenamed?.(oldName, newName);
      } catch (err) {
        console.error('[PdfLayerViewer] rename failed:', err);
      }
    },
    [renameValue, songNumber, filename, renameLayerMutation, onLayerRenamed],
  );

  const hasGeneralRow = showAnnotations !== undefined && onShowAnnotationsChange !== undefined;

  return (
    <>
      {triggerVariant === 'chip' ? (
        <Chip
          size="small"
          icon={<LayersIcon />}
          label={triggerLabel ?? LL.ANNOTATION.LAYERS()}
          onClick={handleOpen}
          clickable
          color="primary"
          variant="outlined"
        />
      ) : (
        <Tooltip title={LL.ANNOTATION.LAYERS()}>
          <IconButton size="small" onClick={handleOpen} sx={{ p: 0.25 }}>
            <LayersIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Popover
        open={open}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={anchorPos}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { minWidth: showDelete ? 280 : 200, maxWidth: 400, maxHeight: 480 } } }}
      >
        <Stack sx={{ p: 1.5 }} spacing={0}>
          <Typography variant="subtitle2" sx={{ px: 0.5, pb: 0.5 }}>
            {LL.ANNOTATION.LAYERS()}
          </Typography>

          {/* ── "Show layers" master-visibility row ── */}
          {hasGeneralRow && (
            <>
              <ListItem disablePadding sx={{ py: 0.25 }}>
                <Switch
                  size="small"
                  checked={showAnnotations}
                  onChange={(_, checked) => handleShowAnnotationsChange(checked)}
                  sx={{ mr: 1 }}
                />
                <ListItemText
                  primary={LL.ANNOTATION.LAYER_SHOW_LAYERS()}
                  slotProps={{
                    primary: {
                      variant: 'body2',
                      sx: { fontWeight: 600, opacity: showAnnotations ? 1 : 0.5 },
                    },
                  }}
                />
              </ListItem>
              <Divider sx={{ my: 0.5 }} />
            </>
          )}

          {/* ── Per-layer list ── */}
          {loading ? (
            <Stack
              sx={{
                alignItems: 'center',
                py: 2,
              }}
            >
              <CircularProgress size={24} />
            </Stack>
          ) : layerNames.length === 0 ? (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                px: 0.5,
                py: 1,
              }}
            >
              {LL.ANNOTATION.NO_LAYERS()}
            </Typography>
          ) : (
            <List dense disablePadding>
              {layerNames.map((layer) => {
                const isActive = selectedLayer === layer;
                const isBeingRenamed = renamingLayer === layer;
                const isVisible = !hiddenLayers.has(layer);

                return (
                  <ListItem key={layer} disablePadding sx={{ py: 0.25 }}>
                    {/* ① In edit mode: Radio button to select active layer */}
                    {showDelete && onLayerSelect && !isBeingRenamed && (
                      <Tooltip title={LL.ANNOTATION.SET_ACTIVE_LAYER()}>
                        <IconButton
                          size="small"
                          onClick={() => onLayerSelect(layer)}
                          color={isActive ? 'primary' : 'default'}
                          sx={{ flexShrink: 0, p: 0.25 }}
                        >
                          {isActive ? <ActiveIcon sx={{ fontSize: 16 }} /> : <InactiveIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* ② Visibility eye icon */}
                    {!isBeingRenamed && showVisibilityToggle && (
                      <Tooltip title={isVisible ? LL.ANNOTATION.HIDE_LAYER() : LL.ANNOTATION.SHOW_LAYER()}>
                        <IconButton size="small" onClick={() => onToggleLayerVisibility(layer)} sx={{ flexShrink: 0, p: 0.25 }}>
                          {isVisible ? <VisibilityIcon sx={{ fontSize: 16 }} /> : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* ③ Name — inline rename input OR clickable label */}
                    {isBeingRenamed ? (
                      <TextField
                        size="small"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(layer);
                          if (e.key === 'Escape') {
                            setRenamingLayer(null);
                            setRenameValue('');
                          }
                        }}
                        autoFocus
                        disabled={isRenaming}
                        sx={{ flex: 1, mx: 0.5, '& .MuiInputBase-input': { py: 0.4, fontSize: '0.75rem' } }}
                        slotProps={{
                          input: {
                            endAdornment: (
                              <InputAdornment position="end" sx={{ gap: 0.25 }}>
                                <IconButton size="small" onClick={() => handleRename(layer)} disabled={!renameValue.trim() || isRenaming}>
                                  <CheckIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setRenamingLayer(null);
                                    setRenameValue('');
                                  }}
                                >
                                  <CloseIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                    ) : showDelete ? (
                      /* Edit mode: clicking name selects the layer */
                      <ListItemButton
                        onClick={() => onLayerSelect?.(layer)}
                        dense
                        sx={{ flex: 1, minWidth: 0, mx: 0.25, py: 0, borderRadius: 0.5 }}
                      >
                        <ListItemText
                          primary={layer}
                          slotProps={{
                            primary: {
                              variant: 'body2',
                              noWrap: true,
                              sx: { fontWeight: isActive ? 700 : 400, opacity: isVisible ? 1 : 0.5 },
                            },
                          }}
                        />
                      </ListItemButton>
                    ) : (
                      /* Footer / read-only: clicking name toggles visibility */
                      <ListItemButton
                        onClick={() => onToggleLayerVisibility(layer)}
                        dense
                        sx={{ flex: 1, minWidth: 0, mx: 0.25, py: 0, borderRadius: 0.5 }}
                      >
                        <ListItemText
                          primary={layer}
                          slotProps={{
                            primary: {
                              variant: 'body2',
                              noWrap: true,
                              sx: { fontWeight: isActive ? 700 : 400, opacity: isVisible ? 1 : 0.5 },
                            },
                          }}
                        />
                      </ListItemButton>
                    )}
                    {/* ④ Edit + delete (edit mode only) */}
                    {showDelete && !isBeingRenamed && (
                      <Stack direction="row" spacing={0} sx={{ flexShrink: 0 }}>
                        <Tooltip title={LL.ANNOTATION.RENAME_LAYER()}>
                          <IconButton size="small" onClick={() => handleStartRename(layer)} sx={{ p: 0.25 }}>
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={LL.ANNOTATION.REMOVE_LAYER()}>
                          <IconButton size="small" onClick={() => handleDelete(layer)} sx={{ p: 0.25 }}>
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}

          {/* ── New layer row (edit mode only) ── */}
          {showDelete && (
            <>
              <Divider sx={{ my: 0.5 }} />
              {showNewInput ? (
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{
                    alignItems: 'center',
                    pt: 0.5,
                  }}
                >
                  <TextField
                    size="small"
                    placeholder={LL.ANNOTATION.NEW_LAYER_PLACEHOLDER()}
                    value={newLayerName}
                    onChange={(e) => setNewLayerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateLayer();
                      if (e.key === 'Escape') {
                        setShowNewInput(false);
                        setNewLayerName('');
                      }
                    }}
                    autoFocus
                    sx={{ flex: 1, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.75rem' } }}
                  />
                  <IconButton size="small" onClick={handleCreateLayer} disabled={!newLayerName.trim()}>
                    <CheckIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setShowNewInput(false);
                      setNewLayerName('');
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              ) : (
                <Stack
                  direction="row"
                  onClick={() => setShowNewInput(true)}
                  sx={{
                    alignItems: 'center',
                    pt: 0.25,
                    cursor: 'pointer',
                  }}
                >
                  <IconButton size="small">
                    <AddIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                    }}
                  >
                    {LL.ANNOTATION.NEW_LAYER()}
                  </Typography>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </Popover>
    </>
  );
};
