/**
 * Rearranging a PDF's pages: lasso a part, drag it somewhere else — onto another page as well —
 * remove a part, delete a page, then save the file in place.
 *
 * Loaded on demand (the annotation toolbar imports it lazily), so pdf-lib and this UI cost nothing
 * until someone opens it. Every edit is applied to the real bytes straight away (`pageEdits.ts`)
 * and the pages are re-rendered from them, so the preview *is* the file that will be saved.
 * Annotations and block mappings are carried along on save.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close as CloseIcon, Undo as UndoIcon, DeleteOutlined as DeletePageIcon, LayersClear as EraseIcon } from '@mui/icons-material';
import { pdfjs } from 'react-pdf';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetPdfAreaMappingsQuery, useSavePdfAreaMappingsMutation, useSavePdfBytesMutation, type PdfAreaMapping } from '@/api/pdfs.api';
import { useDeleteAnnotationMutation, useListAnnotationsQuery, useUpdateAnnotationMutation } from '@/api/pdfAnnotations.api';
import {
  applyPageEdit,
  insidePolygon,
  remapAnnotation,
  remapMapping,
  throughEdits,
  type PageBox,
  type PageEdit,
  type Point,
} from './pageEdits';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
/** The file after some number of edits, ready to show. */
type Step = { bytes: Uint8Array; doc: PdfDoc; boxes: PageBox[] };
/** CSS pixels relative to a page's top-left corner on screen. */
type Px = [number, number];

const GAP = 24;

async function openStep(bytes: Uint8Array): Promise<Step> {
  // pdf.js takes ownership of the buffer it is handed, so it gets a copy and `bytes` stays usable.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const boxes = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then((page) => page.view as PageBox)));
  return { bytes, doc, boxes };
}

const boundsOf = (points: Px[]) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** One page, drawn by pdf.js at the size it is shown (and the screen's pixel density). */
const PageCanvas = ({
  doc,
  index,
  width,
  register,
}: {
  doc: PdfDoc;
  index: number;
  width: number;
  register: (index: number, canvas: HTMLCanvasElement | null) => void;
}) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    void doc.getPage(index + 1).then((page) => {
      if (cancelled) return;
      // ponytail: pages are shown unrotated so screen and PDF coordinates agree; a /Rotate page
      // appears sideways here. Rotate the lasso math instead if rotated charts turn up.
      const base = page.getViewport({ scale: 1, rotation: 0 });
      const scale = (width / base.width) * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale, rotation: 0 });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      // A context, as react-pdf passes it. Handing pdf.js the `canvas` instead drew some words of a
      // SongSelect chart in blue that the viewer shows black.
      const render = page.render({ canvas: null, canvasContext: canvas.getContext('2d')!, viewport });
      task = render;
      render.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, index, width]);

  return (
    <canvas
      ref={(el) => {
        ref.current = el;
        register(index, el);
      }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
};

export type PdfPageEditorProps = {
  songNumber: number;
  filename: string;
  /** The file as the viewer loaded it. */
  pdfUrl: string;
  onClose: () => void;
};

export default function PdfPageEditor({ songNumber, filename, pdfUrl, onClose }: PdfPageEditorProps) {
  const { LL } = useI18nContext();
  const [steps, setSteps] = useState<Step[]>([]);
  const [edits, setEdits] = useState<PageEdit[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const [lasso, setLasso] = useState<{ page: number; points: Px[] } | null>(null);
  const [selection, setSelection] = useState<{ page: number; points: Px[] } | null>(null);
  const [drag, setDrag] = useState<{ ghost: string; width: number; height: number; offset: Px; at: Px; moved: boolean } | null>(null);

  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const pageEls = useRef<(HTMLElement | null)[]>([]);
  const [areaWidth, setAreaWidth] = useState(0);
  const areaObserver = useRef<ResizeObserver | null>(null);
  const areaRef = useCallback((el: HTMLDivElement | null) => {
    areaObserver.current?.disconnect();
    if (!el) return;
    areaObserver.current = new ResizeObserver(([entry]) => setAreaWidth(entry.contentRect.width));
    areaObserver.current.observe(el);
  }, []);

  const { data: annotations } = useListAnnotationsQuery({ songNumber, filename });
  const { data: mappings } = useGetPdfAreaMappingsQuery({ songNumber, filename });
  const [savePdfBytes] = useSavePdfBytesMutation();
  const [saveMappings] = useSavePdfAreaMappingsMutation();
  const [updateAnnotation] = useUpdateAnnotationMutation();
  const [deleteAnnotation] = useDeleteAnnotationMutation();

  const current = steps[steps.length - 1];
  const pageCount = current?.boxes.length ?? 0;

  // Load the file as it is on the server.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(pdfUrl, { credentials: 'include' });
        if (!response.ok) throw new Error(String(response.status));
        const step = await openStep(new Uint8Array(await response.arrayBuffer()));
        if (cancelled) void step.doc.destroy();
        else setSteps([step]);
      } catch (err) {
        console.error('[PdfPageEditor] load failed:', err);
        if (!cancelled) setError(LL.PDF_EDIT.LOAD_FAILED());
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, LL]);

  // pdf.js documents hold a worker-side copy each; let them go with the editor.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  });
  useEffect(() => () => stepsRef.current.forEach((step) => void step.doc.destroy()), []);

  // Two pages side by side where there is room, which is the usual chart: both pages of one song.
  const columns = pageCount > 1 && areaWidth >= 700 ? 2 : 1;
  const pageWidth = Math.max(240, Math.min(640, (areaWidth - GAP * (columns + 1)) / columns));
  const scaleOf = (page: number) => {
    const box = current.boxes[page];
    return pageWidth / (box[2] - box[0]);
  };
  const toPoint = (page: number, [x, y]: Px): Point => {
    const box = current.boxes[page];
    const scale = scaleOf(page);
    return [box[0] + x / scale, box[3] - y / scale];
  };
  const toPx = (page: number, [x, y]: Point): Px => {
    const box = current.boxes[page];
    const scale = scaleOf(page);
    return [(x - box[0]) * scale, (box[3] - y) * scale];
  };

  const apply = async (edit: PageEdit, after?: (step: Step) => void) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const step = await openStep(await applyPageEdit(current.bytes, edit));
      setSteps((prev) => [...prev, step]);
      setEdits((prev) => [...prev, edit]);
      after?.(step);
    } catch (err) {
      console.error('[PdfPageEditor] edit failed:', err);
      setError(LL.PDF_EDIT.EDIT_FAILED());
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    if (steps.length < 2 || busy) return;
    void steps[steps.length - 1].doc.destroy();
    setSteps(steps.slice(0, -1));
    setEdits(edits.slice(0, -1));
    setSelection(null);
  };

  const erase = () => {
    if (!selection || busy) return;
    const { page, points } = selection;
    setSelection(null);
    void apply({ kind: 'erase', page, polygon: points.map((p) => toPoint(page, p)) });
  };

  const deletePage = (page: number) => {
    if (pageCount < 2 || busy) return;
    setSelection(null);
    void apply({ kind: 'delete', page });
  };

  // Keyboard: Delete removes the selection, Ctrl+Z undoes.
  const keys = useRef({ erase, undo });
  useEffect(() => {
    keys.current = { erase, undo };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') keys.current.erase();
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        keys.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const local = (page: number, event: { clientX: number; clientY: number }): Px => {
    const rect = pageEls.current[page]!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  /** Picks up the selection: a clipped copy of the page under it follows the pointer. */
  const startDrag = (page: number, at: Px, event: ReactPointerEvent) => {
    const canvas = canvases.current[page];
    if (!selection || !canvas) return;
    const ratio = canvas.width / pageWidth;
    const b = boundsOf(selection.points);
    const ghost = document.createElement('canvas');
    ghost.width = Math.max(1, Math.ceil(b.width * ratio));
    ghost.height = Math.max(1, Math.ceil(b.height * ratio));
    const ctx = ghost.getContext('2d')!;
    ctx.beginPath();
    selection.points.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - b.x) * ratio, (y - b.y) * ratio));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(canvas, b.x * ratio, b.y * ratio, b.width * ratio, b.height * ratio, 0, 0, ghost.width, ghost.height);

    const offset: Px = [at[0] - b.x, at[1] - b.y];
    const start: Px = [event.clientX, event.clientY];
    setDrag({ ghost: ghost.toDataURL(), width: b.width, height: b.height, offset, at: start, moved: false });

    const from = page;
    const fromSelection = selection;
    // Kept here, not read back from state: the drop must not run inside a state updater.
    let moved = false;
    const onMove = (e: PointerEvent) => {
      moved ||= Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4;
      setDrag((d) => d && { ...d, at: [e.clientX, e.clientY], moved });
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (moved && e.type === 'pointerup') drop(from, fromSelection, offset, [e.clientX, e.clientY]);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /** Where the dragged part landed: the page under the pointer, the part's corner where the ghost's is. */
  const drop = (from: number, sel: { points: Px[] }, offset: Px, [clientX, clientY]: Px) => {
    const to = pageEls.current.findIndex((el) => {
      const r = el?.getBoundingClientRect();
      return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    });
    if (to < 0) return;
    const rect = pageEls.current[to]!.getBoundingClientRect();
    const b = boundsOf(sel.points);
    const [sx, sy] = toPoint(from, [b.x, b.y]);
    const [tx, ty] = toPoint(to, [clientX - offset[0] - rect.left, clientY - offset[1] - rect.top]);
    const dx = tx - sx;
    const dy = ty - sy;
    const polygon = sel.points.map((p) => toPoint(from, p));
    // The selection follows the part, so it can be nudged again right away.
    void apply({ kind: 'move', from, to, polygon, dx, dy }, () =>
      setSelection({ page: to, points: polygon.map(([x, y]) => toPx(to, [x + dx, y + dy])) }),
    );
  };

  const onPointerDown = (page: number, event: ReactPointerEvent<HTMLElement>) => {
    if (busy || drag || event.button > 0) return;
    const at = local(page, event);
    if (selection?.page === page && insidePolygon(at, selection.points)) {
      startDrag(page, at, event);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection(null);
    setLasso({ page, points: [at] });
  };

  const onPointerMove = (page: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!lasso || lasso.page !== page) return;
    const at = local(page, event);
    const last = lasso.points[lasso.points.length - 1];
    if (Math.hypot(at[0] - last[0], at[1] - last[1]) >= 3) setLasso({ page, points: [...lasso.points, at] });
  };

  const onPointerUp = () => {
    if (!lasso) return;
    const b = boundsOf(lasso.points);
    // A click, or a scribble too small to hold anything, selects nothing.
    if (lasso.points.length >= 3 && b.width > 8 && b.height > 8) setSelection(lasso);
    setLasso(null);
  };

  const save = async () => {
    if (!current || edits.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await savePdfBytes({ songNumber, filename, data: current.bytes }).unwrap();
    } catch (err) {
      console.error('[PdfPageEditor] save failed:', err);
      setError(LL.PDF_EDIT.SAVE_FAILED());
      setBusy(false);
      return;
    }

    // The file is saved; now the things that sit on it. Each is independent, so one that fails
    // does not stop the others, and the count tells what is left misplaced.
    const boxes = steps.slice(0, -1).map((step) => step.boxes);
    const jobs: Promise<unknown>[] = [];
    if (mappings?.length) {
      const next = mappings.map((m) => throughEdits(m, edits, boxes, remapMapping)).filter((m): m is PdfAreaMapping => m !== null);
      jobs.push(saveMappings({ songNumber, filename, mappings: next }).unwrap());
    }
    for (const annotation of annotations ?? []) {
      const next = throughEdits(annotation, edits, boxes, remapAnnotation);
      if (!next) jobs.push(deleteAnnotation({ songNumber, filename, annotationId: annotation.id }).unwrap());
      else if (
        JSON.stringify([next.page, next.x, next.y, next.data]) !==
        JSON.stringify([annotation.page, annotation.x, annotation.y, annotation.data])
      )
        jobs.push(
          updateAnnotation({
            songNumber,
            filename,
            annotationId: annotation.id,
            page: next.page,
            x: next.x,
            y: next.y,
            data: next.data,
          }).unwrap(),
        );
    }
    const failed = (await Promise.allSettled(jobs)).filter((result) => result.status === 'rejected').length;
    setBusy(false);
    if (failed === 0) {
      onClose();
      return;
    }
    // Saved, but not everything followed: start over from the saved file and say so.
    steps.slice(0, -1).forEach((step) => void step.doc.destroy());
    setSteps([current]);
    setEdits([]);
    setNotice(LL.PDF_EDIT.SAVED_PARTLY({ count: failed }));
  };

  const requestClose = () => (edits.length > 0 ? setConfirmClose(true) : onClose());

  const selectionBounds = useMemo(() => (selection ? boundsOf(selection.points) : null), [selection]);

  return (
    <Dialog fullScreen open onClose={requestClose}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ mr: 1 }}>
          {LL.PDF_EDIT.TITLE()}
        </Typography>
        <Typography variant="body2" noWrap sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }}>
          {filename}
        </Typography>
        <Tooltip title={LL.PDF_EDIT.ERASE()}>
          <span>
            <IconButton onClick={erase} disabled={!selection || busy}>
              <EraseIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={LL.PDF_EDIT.UNDO()}>
          <span>
            <IconButton onClick={undo} disabled={edits.length === 0 || busy}>
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="contained" onClick={() => void save()} disabled={edits.length === 0 || busy}>
          {LL.PDF_EDIT.SAVE()}
        </Button>
        <IconButton onClick={requestClose} aria-label={LL.COMMON.CLOSE()}>
          <CloseIcon />
        </IconButton>
      </Stack>
      {busy ? <LinearProgress /> : <Box sx={{ height: 4 }} />}

      <Box ref={areaRef} sx={{ flex: 1, overflow: 'auto', bgcolor: 'action.hover' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', pt: 2, px: 2 }}>
          {LL.PDF_EDIT.HINT()}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mx: 'auto', mt: 2, maxWidth: 600 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="warning" sx={{ mx: 'auto', mt: 2, maxWidth: 600 }} onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {current && areaWidth > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `${GAP}px`, p: `${GAP}px` }}>
            {current.boxes.map((box, page) => {
              const height = pageWidth * ((box[3] - box[1]) / (box[2] - box[0]));
              const points = lasso?.page === page ? lasso.points : selection?.page === page ? selection.points : null;
              const dragging = !!drag && selection?.page === page;
              return (
                <Stack key={`${steps.length}-${page}`} sx={{ gap: 0.5 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {LL.PDF_EDIT.PAGE({ number: page + 1, total: pageCount })}
                    </Typography>
                    <Tooltip title={LL.PDF_EDIT.DELETE_PAGE()}>
                      <span>
                        <IconButton size="small" onClick={() => deletePage(page)} disabled={pageCount < 2 || busy}>
                          <DeletePageIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                  <Box
                    data-edit-page={page}
                    ref={(el: HTMLElement | null) => {
                      pageEls.current[page] = el;
                    }}
                    onPointerDown={(e) => onPointerDown(page, e)}
                    onPointerMove={(e) => onPointerMove(page, e)}
                    onPointerUp={onPointerUp}
                    sx={{
                      position: 'relative',
                      width: pageWidth,
                      height,
                      bgcolor: '#fff',
                      boxShadow: 3,
                      touchAction: 'none',
                      userSelect: 'none',
                      cursor: selection?.page === page ? 'move' : 'crosshair',
                    }}
                  >
                    <PageCanvas
                      doc={current.doc}
                      index={page}
                      width={pageWidth}
                      register={(i, el) => {
                        canvases.current[i] = el;
                      }}
                    />
                    {points && (
                      <svg width={pageWidth} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <polygon
                          points={points.map((p) => p.join(',')).join(' ')}
                          fill={dragging ? 'rgba(255,255,255,0.75)' : 'rgba(25,118,210,0.10)'}
                          stroke="#1976d2"
                          strokeWidth={1.5}
                          strokeDasharray="6 4"
                        />
                      </svg>
                    )}
                  </Box>
                </Stack>
              );
            })}
          </Box>
        )}
      </Box>

      {/* The part being dragged, following the pointer over every page. */}
      {drag && selectionBounds && (
        <img
          src={drag.ghost}
          alt=""
          style={{
            position: 'fixed',
            left: drag.at[0] - drag.offset[0],
            top: drag.at[1] - drag.offset[1],
            width: drag.width,
            height: drag.height,
            pointerEvents: 'none',
            opacity: drag.moved ? 0.85 : 0,
            outline: '1px dashed #1976d2',
            zIndex: 2000,
          }}
        />
      )}

      <Dialog open={confirmClose} onClose={() => setConfirmClose(false)}>
        <DialogTitle>{LL.PDF_EDIT.DISCARD_TITLE()}</DialogTitle>
        <DialogContent>
          <DialogContentText>{LL.PDF_EDIT.DISCARD_TEXT()}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(false)}>{LL.COMMON.CANCEL()}</Button>
          <Button color="error" onClick={onClose}>
            {LL.PDF_EDIT.DISCARD()}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
