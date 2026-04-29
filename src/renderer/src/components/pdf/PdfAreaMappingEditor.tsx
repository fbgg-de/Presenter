/**
 * PDF Area Mapping Editor — visual editor to map PDF regions to song blocks (§11.5).
 * Allows drawing rectangles on PDF pages and assigning each to a block name.
 */
import { useState, useRef, useCallback, useEffect, useMemo, type MouseEvent, type TouchEvent } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon, Save as SaveIcon, PictureInPicture as CropIcon } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { useI18nContext } from '@/i18n/i18n-react';
import { BLOCK_COLORS } from '@/theme';

// Ensure pdf.js worker is configured
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export interface PdfAreaMapping {
  blockName: string;
  page: number;
  region?: {
    x: number; // percentage 0-100
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

export const PdfAreaMappingEditor = ({ open, onClose, pdfUrl, blockNames, initialMappings = [], onSave }: PdfAreaMappingEditorProps) => {
  const [mappings, setMappings] = useState<PdfAreaMapping[]>(initialMappings);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState<string>(blockNames[0] || '');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMappings(initialMappings);
  }, [initialMappings]);

  useEffect(() => {
    if (blockNames.length > 0 && !selectedBlock) {
      setSelectedBlock(blockNames[0]);
    }
  }, [blockNames, selectedBlock]);

  const getRelativeCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getRelativeCoords(clientX, clientY);
      if (!coords) return;
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawCurrent(coords);
    },
    [getRelativeCoords],
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawing) return;
      const coords = getRelativeCoords(clientX, clientY);
      if (coords) setDrawCurrent(coords);
    },
    [isDrawing, getRelativeCoords],
  );

  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove]);

  const handleTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      handlePointerDown(t.clientX, t.clientY);
    },
    [handlePointerDown],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      handlePointerMove(t.clientX, t.clientY);
    },
    [handlePointerMove],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !drawStart || !drawCurrent || !selectedBlock) {
      setIsDrawing(false);
      return;
    }

    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    // Ignore very small regions (accidental clicks)
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

      // Replace existing mapping for this block, or add new
      setMappings((prev) => {
        const filtered = prev.filter((m) => m.blockName !== selectedBlock);
        return [...filtered, newMapping];
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }, [isDrawing, drawStart, drawCurrent, selectedBlock, currentPage]);

  const handleRemoveMapping = useCallback((blockName: string) => {
    setMappings((prev) => prev.filter((m) => m.blockName !== blockName));
  }, []);

  const handleSave = useCallback(() => {
    onSave(mappings);
    onClose();
  }, [mappings, onSave, onClose]);

  // Current page mappings for overlay display
  const pageMappings = useMemo(() => mappings.filter((m) => m.page === currentPage), [mappings, currentPage]);

  // Drawing rectangle
  const drawRect = useMemo(() => {
    if (!isDrawing || !drawStart || !drawCurrent) return null;
    return {
      left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
      top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
      width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
      height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
    };
  }, [isDrawing, drawStart, drawCurrent]);

  // Color for each block
  const blockColors = useMemo(() => {
    const map: Record<string, string> = {};
    blockNames.forEach((name, i) => {
      map[name] = BLOCK_COLORS[i % BLOCK_COLORS.length];
    });
    return map;
  }, [blockNames]);

  const { LL } = useI18nContext();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
          }}
        >
          <CropIcon />
          <Typography variant="h6">{LL.PDF.AREA_MAPPING_TITLE()}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={2} sx={{ height: '70vh' }}>
          {/* PDF View with overlay */}
          <Box sx={{ flex: 2, overflow: 'auto', position: 'relative' }}>
            {/* Page navigation */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: 'center',
                mb: 1,
              }}
            >
              <Button size="small" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                {LL.PDF.PAGE_PREV()}
              </Button>
              <Typography variant="body2">{LL.PDF.PAGE_OF({ current: currentPage, total: numPages })}</Typography>
              <Button size="small" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>
                {LL.PDF.PAGE_NEXT()}
              </Button>
            </Stack>

            {/* PDF + drawing overlay */}
            <Box
              ref={containerRef}
              sx={{
                position: 'relative',
                display: 'inline-block',
                cursor: 'crosshair',
                userSelect: 'none',
                touchAction: 'none',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              onTouchCancel={handleMouseUp}
            >
              <Document file={pdfUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
                <Page pageNumber={currentPage} width={600} renderTextLayer={false} renderAnnotationLayer={false} />
              </Document>

              {/* Existing mappings overlay */}
              {pageMappings.map((m) =>
                m.region ? (
                  <Box
                    key={m.blockName}
                    sx={{
                      position: 'absolute',
                      left: `${m.region.x}%`,
                      top: `${m.region.y}%`,
                      width: `${m.region.width}%`,
                      height: `${m.region.height}%`,
                      border: `2px solid ${blockColors[m.blockName] || '#2196f3'}`,
                      backgroundColor: `${blockColors[m.blockName] || '#2196f3'}22`,
                      pointerEvents: 'none',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        top: -18,
                        left: 0,
                        bgcolor: blockColors[m.blockName] || '#2196f3',
                        color: '#fff',
                        px: 0.5,
                        fontSize: '0.65rem',
                        borderRadius: '2px 2px 0 0',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.blockName}
                    </Typography>
                  </Box>
                ) : null,
              )}

              {/* Active drawing rectangle */}
              {drawRect && (
                <Box
                  sx={{
                    position: 'absolute',
                    ...drawRect,
                    border: `2px dashed ${blockColors[selectedBlock] || '#2196f3'}`,
                    backgroundColor: `${blockColors[selectedBlock] || '#2196f3'}15`,
                    pointerEvents: 'none',
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Right panel: block selector + mappings list */}
          <Stack sx={{ flex: 1, minWidth: 220 }} spacing={2}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
              }}
            >
              {LL.PDF.SELECT_BLOCK_TO_MAP()}
            </Typography>
            <Select value={selectedBlock} onChange={(e) => setSelectedBlock(e.target.value)} size="small" fullWidth>
              {blockNames.map((name) => (
                <MenuItem key={name} value={name}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: 'center',
                    }}
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: blockColors[name],
                      }}
                    />
                    <span>{name}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>

            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {LL.PDF.DRAW_RECTANGLE_HELP()}
            </Typography>

            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                mt: 2,
              }}
            >
              {LL.PDF.MAPPINGS_TITLE({ count: mappings.length })}
            </Typography>
            <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
              {mappings.map((m) => (
                <ListItem
                  key={m.blockName}
                  secondaryAction={
                    <IconButton size="small" onClick={() => handleRemoveMapping(m.blockName)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{
                          alignItems: 'center',
                        }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: blockColors[m.blockName],
                          }}
                        />
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
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  textAlign: 'center',
                }}
              >
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
