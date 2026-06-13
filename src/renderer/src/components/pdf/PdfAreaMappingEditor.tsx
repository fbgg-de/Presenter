/**
 * PDF Area Mapping Editor — visual editor to map PDF regions to song blocks (§11.5).
 * Allows drawing rectangles on PDF pages and assigning each to a block name.
 *
 * Features:
 *  - Draw new rectangle for the selected block
 *  - Click an existing rectangle on the canvas to select its block
 *  - Resize existing rectangles via 8 drag handles
 *  - Snap-to-edges: drawn/resized boundaries align to existing rectangle edges
 *  - Edit icon in the sidebar list to jump to a block
 */
import { useState, useRef, useCallback, useEffect, useMemo, type MouseEvent, type TouchEvent } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Save as SaveIcon, PictureInPicture as CropIcon } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { useI18nContext } from '@/i18n/i18n-react';
import { BLOCK_COLORS } from '@/theme';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export interface PdfAreaMapping {
  blockName: string;
  page: number;
  region?: {
    x: number; // percentage 0–100
    y: number;
    width: number;
    height: number;
  };
}

interface PdfAreaMappingEditorProps {
  open: boolean;
  onClose: () => void;
  pdfUrl: string;
  blockNames: string[];
  initialMappings?: PdfAreaMapping[];
  onSave: (mappings: PdfAreaMapping[]) => void;
}

// ── Resize handle types ──────────────────────────────────────────────────────
type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: HandleType[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_CURSORS: Record<HandleType, string> = {
  nw: 'nw-resize',
  n: 'n-resize',
  ne: 'ne-resize',
  e: 'e-resize',
  se: 'se-resize',
  s: 's-resize',
  sw: 'sw-resize',
  w: 'w-resize',
};

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ResizeState {
  blockName: string;
  handle: HandleType;
  startRegion: Region;
  startMouse: { x: number; y: number };
}

/** Returns the 8 handle anchor positions (in %) for a given region. */
const getHandlePositions = (r: Region): Record<HandleType, { x: number; y: number }> => ({
  nw: { x: r.x, y: r.y },
  n: { x: r.x + r.width / 2, y: r.y },
  ne: { x: r.x + r.width, y: r.y },
  e: { x: r.x + r.width, y: r.y + r.height / 2 },
  se: { x: r.x + r.width, y: r.y + r.height },
  s: { x: r.x + r.width / 2, y: r.y + r.height },
  sw: { x: r.x, y: r.y + r.height },
  w: { x: r.x, y: r.y + r.height / 2 },
});

/** Compute the new region after dragging a handle by (dx, dy) in %. */
const applyResize = (start: Region, handle: HandleType, dx: number, dy: number): Region => {
  let { x, y, width, height } = start;
  switch (handle) {
    case 'nw':
      x += dx;
      y += dy;
      width -= dx;
      height -= dy;
      break;
    case 'n':
      y += dy;
      height -= dy;
      break;
    case 'ne':
      y += dy;
      width += dx;
      height -= dy;
      break;
    case 'e':
      width += dx;
      break;
    case 'se':
      width += dx;
      height += dy;
      break;
    case 's':
      height += dy;
      break;
    case 'sw':
      x += dx;
      width -= dx;
      height += dy;
      break;
    case 'w':
      x += dx;
      width -= dx;
      break;
  }
  width = Math.max(1, width);
  height = Math.max(1, height);
  x = Math.max(0, Math.min(x, 99));
  y = Math.max(0, Math.min(y, 99));
  if (x + width > 100) width = 100 - x;
  if (y + height > 100) height = 100 - y;
  return { x, y, width, height };
};

// ── Snap threshold (in % units) ───────────────────────────────────────────────
const SNAP_THRESHOLD = 2;

// ── Component ────────────────────────────────────────────────────────────────
export const PdfAreaMappingEditor = ({ open, onClose, pdfUrl, blockNames, initialMappings = [], onSave }: PdfAreaMappingEditorProps) => {
  const { LL } = useI18nContext();

  const [mappings, setMappings] = useState<PdfAreaMapping[]>(initialMappings);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState<string>(blockNames[0] || '');
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [pointerCurrent, setPointerCurrent] = useState<{ x: number; y: number } | null>(null);

  // Resize state
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMappings(initialMappings);
  }, [initialMappings]);
  useEffect(() => {
    if (blockNames.length > 0 && !selectedBlock) setSelectedBlock(blockNames[0]);
  }, [blockNames, selectedBlock]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getRelativeCoords = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)),
    };
  }, []);

  /** Snap coords to nearby existing rectangle boundaries. Excludes `excludeBlock`. */
  const applySnap = useCallback(
    (coords: { x: number; y: number }, excludeBlock?: string) => {
      if (!snapEnabled) return coords;
      let sx = coords.x,
        sy = coords.y;
      for (const m of mappings) {
        if (!m.region || m.blockName === excludeBlock) continue;
        const { x, y, width, height } = m.region;
        for (const bx of [x, x + width]) {
          if (Math.abs(coords.x - bx) < SNAP_THRESHOLD) {
            sx = bx;
            break;
          }
        }
        for (const by of [y, y + height]) {
          if (Math.abs(coords.y - by) < SNAP_THRESHOLD) {
            sy = by;
            break;
          }
        }
      }
      return { x: sx, y: sy };
    },
    [snapEnabled, mappings],
  );

  // ── Pointer event handlers ────────────────────────────────────────────────
  const resizePreviewRegion = useMemo<Region | null>(() => {
    if (!resizeState || !pointerCurrent) return null;
    const dx = pointerCurrent.x - resizeState.startMouse.x;
    const dy = pointerCurrent.y - resizeState.startMouse.y;
    return applyResize(resizeState.startRegion, resizeState.handle, dx, dy);
  }, [resizeState, pointerCurrent]);

  // ── Pointer event handlers ────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getRelativeCoords(clientX, clientY);
      if (!coords) return;
      setIsDrawing(true);
      const snapped = applySnap(coords, selectedBlock);
      setDrawStart(snapped);
      setPointerCurrent(snapped);
    },
    [getRelativeCoords, applySnap, selectedBlock],
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getRelativeCoords(clientX, clientY);
      if (!coords) return;

      if (resizeState) {
        setPointerCurrent(applySnap(coords, resizeState.blockName));
        return;
      }
      if (isDrawing) {
        setPointerCurrent(applySnap(coords, selectedBlock));
      }
    },
    [resizeState, isDrawing, getRelativeCoords, applySnap, selectedBlock],
  );

  const handlePointerUp = useCallback(() => {
    // ── Commit resize ──
    if (resizeState) {
      if (pointerCurrent) {
        const dx = pointerCurrent.x - resizeState.startMouse.x;
        const dy = pointerCurrent.y - resizeState.startMouse.y;
        const newRegion = applyResize(resizeState.startRegion, resizeState.handle, dx, dy);
        setMappings((prev) => prev.map((m) => (m.blockName === resizeState.blockName ? { ...m, region: newRegion } : m)));
      }
      setResizeState(null);
      setPointerCurrent(null);
      return;
    }

    // ── Commit draw ──
    if (!isDrawing || !drawStart || !pointerCurrent || !selectedBlock) {
      setIsDrawing(false);
      return;
    }

    const x = Math.min(drawStart.x, pointerCurrent.x);
    const y = Math.min(drawStart.y, pointerCurrent.y);
    const width = Math.abs(pointerCurrent.x - drawStart.x);
    const height = Math.abs(pointerCurrent.y - drawStart.y);

    if (width > 2 && height > 2) {
      const newMapping: PdfAreaMapping = {
        blockName: selectedBlock,
        page: currentPage,
        region: {
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          width: Math.round(width * 100) / 100,
          height: Math.round(height * 100) / 100,
        },
      };
      setMappings((prev) => [...prev.filter((m) => m.blockName !== selectedBlock), newMapping]);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setPointerCurrent(null);
  }, [resizeState, isDrawing, drawStart, pointerCurrent, selectedBlock, currentPage]);

  // Mouse wrappers
  const onMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);
  const onMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove]);
  const onMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp]);
  const onMouseLeave = useCallback(() => {
    // Cancel draw on leave (but keep resize going — user may move outside briefly)
    if (!resizeState && isDrawing) {
      setIsDrawing(false);
      setDrawStart(null);
      setPointerCurrent(null);
    }
  }, [resizeState, isDrawing]);

  // Touch wrappers
  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      handlePointerDown(t.clientX, t.clientY);
    },
    [handlePointerDown],
  );
  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      handlePointerMove(t.clientX, t.clientY);
    },
    [handlePointerMove],
  );
  const onTouchEnd = useCallback(() => handlePointerUp(), [handlePointerUp]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const handleRemoveMapping = useCallback((blockName: string) => {
    setMappings((prev) => prev.filter((m) => m.blockName !== blockName));
  }, []);

  const handleEditMapping = useCallback((m: PdfAreaMapping) => {
    setSelectedBlock(m.blockName);
    setCurrentPage(m.page);
  }, []);

  const handleSave = useCallback(() => {
    onSave(mappings);
    onClose();
  }, [mappings, onSave, onClose]);

  // ── Derived display data ──────────────────────────────────────────────────

  const pageMappings = useMemo(() => mappings.filter((m) => m.page === currentPage), [mappings, currentPage]);

  const drawRect = useMemo(() => {
    if (!isDrawing || !drawStart || !pointerCurrent) return null;
    return {
      left: `${Math.min(drawStart.x, pointerCurrent.x)}%`,
      top: `${Math.min(drawStart.y, pointerCurrent.y)}%`,
      width: `${Math.abs(pointerCurrent.x - drawStart.x)}%`,
      height: `${Math.abs(pointerCurrent.y - drawStart.y)}%`,
    };
  }, [isDrawing, drawStart, pointerCurrent]);

  const blockColors = useMemo(() => {
    const map: Record<string, string> = {};
    blockNames.forEach((name, i) => {
      map[name] = BLOCK_COLORS[i % BLOCK_COLORS.length];
    });
    return map;
  }, [blockNames]);

  // ── Container cursor ──────────────────────────────────────────────────────
  const containerCursor = resizeState ? HANDLE_CURSORS[resizeState.handle] : 'crosshair';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <CropIcon />
          <Typography variant="h6">{LL.PDF.AREA_MAPPING_TITLE()}</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" spacing={2} sx={{ height: '70vh' }}>
          {/* ── PDF canvas ── */}
          <Box sx={{ flex: 2, overflow: 'auto', position: 'relative' }}>
            {/* Page navigation */}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <Button size="small" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                {LL.PDF.PAGE_PREV()}
              </Button>
              <Typography variant="body2">{LL.PDF.PAGE_OF({ current: currentPage, total: numPages })}</Typography>
              <Button size="small" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>
                {LL.PDF.PAGE_NEXT()}
              </Button>
            </Stack>

            {/* PDF + overlay */}
            <Box
              ref={containerRef}
              sx={{
                position: 'relative',
                display: 'inline-block',
                cursor: containerCursor,
                userSelect: 'none',
                touchAction: 'none',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              <Document file={pdfUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
                <Page pageNumber={currentPage} width={600} renderTextLayer={false} renderAnnotationLayer={false} />
              </Document>

              {/* Existing mapping overlays */}
              {pageMappings.map((m) => {
                if (!m.region) return null;
                const isSelected = m.blockName === selectedBlock;
                // During resize for this block, show the preview region instead
                const displayRegion = resizeState?.blockName === m.blockName && resizePreviewRegion ? resizePreviewRegion : m.region;
                const color = blockColors[m.blockName] || '#2196f3';
                return (
                  <Box
                    key={m.blockName}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlock(m.blockName);
                    }}
                    sx={{
                      position: 'absolute',
                      left: `${displayRegion.x}%`,
                      top: `${displayRegion.y}%`,
                      width: `${displayRegion.width}%`,
                      height: `${displayRegion.height}%`,
                      border: `2px solid ${color}`,
                      outline: isSelected ? `2px dashed ${color}` : 'none',
                      outlineOffset: '2px',
                      backgroundColor: `${color}22`,
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                      zIndex: isSelected ? 3 : 2,
                      boxSizing: 'border-box',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        top: -18,
                        left: 0,
                        bgcolor: color,
                        color: '#fff',
                        px: 0.5,
                        fontSize: '0.65rem',
                        borderRadius: '2px 2px 0 0',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {m.blockName}
                    </Typography>

                    {/* Resize handles — only on the selected block */}
                    {isSelected &&
                      !isDrawing &&
                      (() => {
                        const positions = getHandlePositions(displayRegion);
                        return HANDLES.map((handle) => {
                          const pos = positions[handle];
                          return (
                            <Box
                              key={handle}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                const coords = getRelativeCoords(e.clientX, e.clientY);
                                if (!coords) return;
                                setResizeState({
                                  blockName: m.blockName,
                                  handle,
                                  startRegion: { ...displayRegion },
                                  startMouse: coords,
                                });
                                setPointerCurrent(coords);
                              }}
                              sx={{
                                position: 'absolute',
                                left: `calc(${((pos.x - displayRegion.x) / displayRegion.width) * 100}% - 5px)`,
                                top: `calc(${((pos.y - displayRegion.y) / displayRegion.height) * 100}% - 5px)`,
                                width: 10,
                                height: 10,
                                bgcolor: color,
                                border: '1.5px solid #fff',
                                borderRadius: '2px',
                                cursor: HANDLE_CURSORS[handle],
                                zIndex: 10,
                                pointerEvents: 'auto',
                                boxShadow: '0 0 2px rgba(0,0,0,0.4)',
                              }}
                            />
                          );
                        });
                      })()}
                  </Box>
                );
              })}

              {/* Active draw preview */}
              {drawRect && (
                <Box
                  sx={{
                    position: 'absolute',
                    ...drawRect,
                    border: `2px dashed ${blockColors[selectedBlock] || '#2196f3'}`,
                    backgroundColor: `${blockColors[selectedBlock] || '#2196f3'}15`,
                    pointerEvents: 'none',
                    zIndex: 4,
                  }}
                />
              )}
            </Box>
          </Box>

          {/* ── Right sidebar ── */}
          <Stack sx={{ flex: 1, minWidth: 230 }} spacing={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {LL.PDF.SELECT_BLOCK_TO_MAP()}
            </Typography>

            <Select value={selectedBlock} onChange={(e) => setSelectedBlock(e.target.value)} size="small" fullWidth>
              {blockNames.map((name) => (
                <MenuItem key={name} value={name}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: blockColors[name] }} />
                    <span>{name}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {LL.PDF.DRAW_RECTANGLE_HELP()}
            </Typography>

            {/* Snap toggle */}
            <FormControlLabel
              control={<Switch size="small" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />}
              label={<Typography variant="body2">{LL.PDF.SNAP_TO_EDGES()}</Typography>}
            />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
              {LL.PDF.MAPPINGS_TITLE({ count: mappings.length })}
            </Typography>

            <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
              {mappings.map((m) => (
                <ListItem
                  key={m.blockName}
                  sx={{
                    borderRadius: 1,
                    bgcolor: m.blockName === selectedBlock ? 'action.selected' : 'transparent',
                  }}
                  secondaryAction={
                    <Stack direction="row" spacing={0}>
                      <Tooltip title={LL.PDF.EDIT_MAPPING()}>
                        <IconButton size="small" onClick={() => handleEditMapping(m)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <IconButton size="small" color="error" onClick={() => handleRemoveMapping(m.blockName)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: blockColors[m.blockName], flexShrink: 0 }} />
                        <Typography variant="body2">{m.blockName}</Typography>
                      </Stack>
                    }
                    secondary={
                      m.region
                        ? LL.PDF.MAPPING_REGION({
                            page: m.page,
                            x: String(Math.round(m.region.x)),
                            y: String(Math.round(m.region.y)),
                            width: String(Math.round(m.region.width)),
                            height: String(Math.round(m.region.height)),
                          })
                        : LL.PDF.MAPPING_PAGE({ page: m.page })
                    }
                  />
                </ListItem>
              ))}
            </List>

            {mappings.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                {LL.PDF.NO_MAPPINGS_YET()}
              </Typography>
            )}
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
          {LL.PDF.SAVE_MAPPINGS()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
