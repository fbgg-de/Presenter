import { useRef, useCallback, useState, useEffect, MutableRefObject, Ref, RefObject } from 'react';
import { Box, Stack, CircularProgress } from '@mui/material';
import type { PdfAreaMapping } from '@/components/pdf/PdfAreaMappingEditor';
import { Document, Page } from 'react-pdf';
import { PdfAnnotationToolbar } from '@/components/pdf/PdfAnnotationToolbar';
import { MusicianFooter } from './MusicianFooter';
import type { PageViewMode } from './usePdfViewer';
import { getPageState, setPageField } from './usePdfViewer';

interface PdfViewProps {
  pdfUrl: string | null;
  pdfContainerRef: Ref<HTMLDivElement>;
  currentPage: number;
  numPages: number;
  zoomLevel: number;
  pageView: PageViewMode;
  pageBaseWidth: number;
  annotateMode: boolean;
  onDocumentLoadSuccess: (data: { numPages: number }) => void;
  onDocumentLoadError: (error: Error) => void;
  musicianName: string;
  activeSongNumber?: number;
  /** Optional display name of the active song — included in the exported PDF filename. */
  activeSongName?: string;
  showFooter?: boolean;
  resolvedFilename?: string | null;
  /** Filename that is null during query transitions — used for restore logic to avoid stale data */
  stableResolvedFilename?: string | null;
  availableFilenames?: string[];
  onSelectPdf?: (filename: string) => void;
  onOpenPdfModal?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onZoomFitWidth?: () => void;
  /** Called when two-page mode needs to sync the global zoom to the active page's zoom */
  onZoomSync?: (zoom: number) => void;
  /**
   * Called once the annotation toolbar mounts (or the song changes) with the
   * annotation `refetch` function — forwarded from PdfAnnotationToolbar so the
   * floating MusicianToolbar can trigger immediate reloads.
   */
  onRegisterRefetch?: (refetch: () => void) => void;
  /** All block area mappings — rendered as persistent fade-in/out overlays */
  allBlockAreaMappings?: PdfAreaMapping[];
  /** Active block area mapping to display as a visual indicator overlay */
  activeBlockAreaMapping?: PdfAreaMapping;
  /** Next block area mapping to display as a grey visual hint overlay */
  nextBlockAreaMapping?: PdfAreaMapping;
  /** Whether sync is active — controls visibility of the block indicator overlays */
  isSynced?: boolean;
  /** Current operator block index — used to detect block advances even for repeated section names */
  activeBlockIndex?: number;
  /** Ordered block names for the active song (includes duplicates). */
  orderedBlockNames?: string[];
}

const getRemainingConsecutiveCount = (orderedBlockNames: string[], activeBlockIndex: number): number => {
  if (activeBlockIndex < 0 || activeBlockIndex >= orderedBlockNames.length) return 0;
  const activeName = orderedBlockNames[activeBlockIndex];
  let count = 1;
  for (let i = activeBlockIndex + 1; i < orderedBlockNames.length; i += 1) {
    if (orderedBlockNames[i] !== activeName) break;
    count += 1;
  }
  return count;
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_DEFAULT = 1.0;
const SCROLL_SAVE_DEBOUNCE_MS = 200;

/** Shared with usePdfViewer — tracks intended smooth-scroll destination per container. */
const pdfScrollTargets = new WeakMap<HTMLElement, number>();

/**
 * Renders persistent overlay indicators for ALL mapped block areas on a given page.
 * Each overlay is always in the DOM at its fixed region — only opacity/border-color
 * transitions between "idle", "next" and "active" states, so there is no positional
 * jump on block changes and CSS transitions work smoothly.
 *
 * When isSynced is false all overlays are hidden (opacity 0) but still mounted.
 */
const BlockAreaOverlays = ({
  mappings,
  pageNum,
  activeBlockName,
  nextBlockName,
  isSynced,
  containerRef,
  scrollKey,
  orderedBlockNames,
  activeBlockIndex,
}: {
  mappings: PdfAreaMapping[];
  pageNum: number;
  activeBlockName: string | null;
  nextBlockName: string | null;
  isSynced: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Changes on every block advance so the scroll-into-view effect re-evaluates. */
  scrollKey: string;
  orderedBlockNames: string[];
  activeBlockIndex: number;
}) => {
  const activeOverlayRef = useRef<HTMLDivElement | null>(null);

  // Scroll the active overlay into view when the block changes.
  useEffect(() => {
    if (!isSynced || !activeBlockName) return;

    let raf2: number;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = activeOverlayRef.current;
        const c = containerRef.current;
        if (!el || !c) return;
        if (el.offsetHeight === 0) return;

        let elOffsetTop = 0;
        let node: HTMLElement | null = el;
        while (node && node !== c) {
          elOffsetTop += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        const elOffsetBottom = elOffsetTop + el.offsetHeight;

        const pending = pdfScrollTargets.get(c);
        const effectiveTop = pending ?? c.scrollTop;
        const fullyVisible = elOffsetTop >= effectiveTop && elOffsetBottom <= effectiveTop + c.clientHeight;

        if (!fullyVisible) {
          const targetScroll = Math.max(0, elOffsetTop - c.clientHeight / 2 + el.offsetHeight / 2);
          pdfScrollTargets.set(c, targetScroll);
          c.scrollTo({ top: targetScroll, behavior: 'smooth' });
          c.addEventListener('scrollend', function onScrollEnd() {
            c.removeEventListener('scrollend', onScrollEnd);
            if (pdfScrollTargets.get(c) === targetScroll) pdfScrollTargets.delete(c);
          });
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  const pageMappings = mappings.filter((m) => m.page === pageNum && m.region);
  const remainingRepeatCount = getRemainingConsecutiveCount(orderedBlockNames, activeBlockIndex);

  return (
    <>
      {pageMappings.map((m) => {
        const r = m.region!;
        const isActive = isSynced && m.blockName === activeBlockName;
        const isNext = isSynced && m.blockName === nextBlockName && !isActive;
        // opacity levels: active=1, next=0.6, idle (synced)=0.2, not synced=0
        const opacity = !isSynced ? 0 : isActive ? 1 : isNext ? 0.6 : 0.2;
        return (
          <Box
            key={m.blockName}
            ref={isActive ? activeOverlayRef : undefined}
            sx={{
              position: 'absolute',
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.width}%`,
              height: `${r.height}%`,
              borderLeft: isActive ? '4px solid' : '3px solid',
              borderColor: isActive ? 'primary.main' : isNext ? 'warning.main' : 'text.primary',
              backgroundColor: isActive
                ? 'rgba(25,118,210,0.12)'
                : isNext
                  ? 'rgba(237,108,2,0.08)'
                  : 'rgba(0,0,0,0.06)',
              pointerEvents: 'none',
              boxSizing: 'border-box',
              opacity,
              transition: 'opacity 0.2s ease-in-out, border-color 0.2s ease-in-out, background-color 0.2s ease-in-out',
            }}
          >
            {isActive && remainingRepeatCount > 1 && (
              <Box
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  minWidth: 24,
                  height: 20,
                  px: 0.75,
                  borderRadius: 0,
                  bgcolor: 'rgba(0,0,0,0.72)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                {`${remainingRepeatCount}x`}
              </Box>
            )}
          </Box>
        );
      })}
    </>
  );
};

/** Read scroll from storage with legacy fallback */
const readScroll = (songNumber: number, filename: string, page: number): { x: number; y: number } => {
  const ps = getPageState(songNumber, filename, page);
  return { x: ps.scrollX ?? 0, y: ps.scrollY ?? ps.scroll ?? 0 };
};

/** Write scroll position to storage */
const writeScroll = (songNumber: number, filename: string, page: number, scrollLeft: number, scrollTop: number): void => {
  setPageField(songNumber, filename, page, { scrollX: scrollLeft, scrollY: scrollTop });
};

/** Read zoom from storage */
const readZoom = (songNumber: number, filename: string, page: number): number => {
  const ps = getPageState(songNumber, filename, page);
  return ps.zoom != null ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ps.zoom)) : ZOOM_DEFAULT;
};

/** Persist zoom to storage immediately */
const writeZoom = (songNumber: number, filename: string, page: number, zoom: number): void => {
  setPageField(songNumber, filename, page, { zoom });
};

export const PdfView = ({
  pdfUrl,
  pdfContainerRef,
  currentPage,
  numPages,
  zoomLevel,
  pageView,
  pageBaseWidth,
  annotateMode,
  onDocumentLoadSuccess,
  onDocumentLoadError,
  musicianName,
  activeSongNumber,
  activeSongName,
  showFooter,
  resolvedFilename,
  stableResolvedFilename,
  availableFilenames = [],
  onSelectPdf,
  onOpenPdfModal,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFitWidth,
  onZoomSync,
  onRegisterRefetch,
  allBlockAreaMappings,
  activeBlockAreaMapping,
  nextBlockAreaMapping,
  isSynced,
  activeBlockIndex,
  orderedBlockNames = [],
}: PdfViewProps) => {
  const localContainerRef = useRef<HTMLDivElement>(null);
  // Stable panel refs using useRef — never recreated
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);

  /** Track if the PDF document is currently loading (e.g. after save changes pdfUrl) */
  const [pdfLoading, setPdfLoading] = useState(false);
  /** Last known container height — used as min-height during reloads to prevent layout jumps */
  const lastContainerHeightRef = useRef<number | null>(null);

  // ── Shared annotation visibility state (lifted from toolbar + footer) ──
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());

  const handleToggleLayerVisibility = useCallback((layer: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  }, []);

  const hasRightPage = currentPage + 1 <= numPages;
  const leftPageNum = currentPage;
  const rightPageNum = currentPage + 1;

  // Active page number (the panel that toolbar zoom applies to)
  const [activePage, setActivePage] = useState(leftPageNum);

  // Per-panel zoom keyed by page number
  const [pageZooms, setPageZooms] = useState<Record<number, number>>({});

  // Guard: suppress scroll-save during programmatic scroll restore
  const restoringScrollRef = useRef(false);
  // Guard: suppress global zoom delta during programmatic zoom restore/sync
  const restoringZoomRef = useRef(false);

  // Track pending scroll restore — incremented on context change, consumed after pages render
  const pendingScrollRestoreRef = useRef(0);

  // The filename used for persistence: null during query transitions to avoid stale reads/writes
  const persistFilename = stableResolvedFilename ?? null;

  // Ref that always holds current song context for use in scroll handlers
  const contextRef = useRef({
    songNumber: activeSongNumber,
    filename: persistFilename,
    leftPageNum,
    rightPageNum,
    numPages,
  });
  contextRef.current = {
    songNumber: activeSongNumber,
    filename: persistFilename,
    leftPageNum,
    rightPageNum,
    numPages,
  };

  // ── Get zoom for a page (from local state, or default) ──
  const getZoom = (page: number) => pageZooms[page] ?? ZOOM_DEFAULT;
  const leftZoom = getZoom(leftPageNum);
  const rightZoom = getZoom(rightPageNum);

  /** Set zoom for a page in React state AND persist to storage immediately */
  const setZoomForPage = useCallback((page: number, zoom: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
    setPageZooms((prev) => ({ ...prev, [page]: clamped }));
    // Persist directly — no separate effect needed
    const ctx = contextRef.current;
    if (ctx.songNumber != null && ctx.filename) {
      writeZoom(ctx.songNumber, ctx.filename, page, clamped);
    }
  }, []);

  // ── Debounced scroll handlers per panel ──
  const scrollTimerLeft = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRight = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScrollLeft = useCallback(() => {
    if (restoringScrollRef.current) return;
    if (scrollTimerLeft.current) clearTimeout(scrollTimerLeft.current);
    scrollTimerLeft.current = setTimeout(() => {
      const ctx = contextRef.current;
      const el = leftPanelRef.current;
      if (el && ctx.songNumber != null && ctx.filename) {
        writeScroll(ctx.songNumber, ctx.filename, ctx.leftPageNum, el.scrollLeft, el.scrollTop);
      }
    }, SCROLL_SAVE_DEBOUNCE_MS);
  }, []);

  const handleScrollRight = useCallback(() => {
    if (restoringScrollRef.current) return;
    if (scrollTimerRight.current) clearTimeout(scrollTimerRight.current);
    scrollTimerRight.current = setTimeout(() => {
      const ctx = contextRef.current;
      const el = rightPanelRef.current;
      if (el && ctx.songNumber != null && ctx.filename && ctx.rightPageNum <= ctx.numPages) {
        writeScroll(ctx.songNumber, ctx.filename, ctx.rightPageNum, el.scrollLeft, el.scrollTop);
      }
    }, SCROLL_SAVE_DEBOUNCE_MS);
  }, []);

  // ── Restore scroll positions after pages have rendered at their zoom level ──
  const doScrollRestore = useCallback(() => {
    if (pendingScrollRestoreRef.current <= 0) return;
    const ctx = contextRef.current;
    if (ctx.songNumber == null || !ctx.filename) return;

    restoringScrollRef.current = true;
    const leftS = readScroll(ctx.songNumber, ctx.filename, ctx.leftPageNum);
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollLeft = leftS.x;
      leftPanelRef.current.scrollTop = leftS.y;
    }
    if (rightPanelRef.current && ctx.rightPageNum <= ctx.numPages) {
      const rightS = readScroll(ctx.songNumber, ctx.filename, ctx.rightPageNum);
      rightPanelRef.current.scrollLeft = rightS.x;
      rightPanelRef.current.scrollTop = rightS.y;
    }

    pendingScrollRestoreRef.current = 0;
    // Re-enable scroll saving after a brief delay
    setTimeout(() => {
      restoringScrollRef.current = false;
    }, 100);
  }, []);

  // Called when a <Page> finishes rendering its canvas
  const handlePageRenderSuccess = useCallback(() => {
    if (pendingScrollRestoreRef.current > 0) {
      // Use requestAnimationFrame to ensure the DOM has painted
      requestAnimationFrame(() => doScrollRestore());
    }
  }, [doScrollRestore]);

  // ── On song/page change: restore zoom; mark scroll for restore ──
  useEffect(() => {
    if (pageView !== 'two-page' || activeSongNumber == null || !persistFilename) return;

    // Suppress the global zoom delta mechanism during this restore cycle
    restoringZoomRef.current = true;

    // Restore zoom for both pages from storage.
    // Always read page 2 even if numPages is not yet known (PDF may not have loaded),
    // because we want the stored zoom ready for when the page renders.
    const lz = readZoom(activeSongNumber, persistFilename, leftPageNum);
    const rz = readZoom(activeSongNumber, persistFilename, rightPageNum);
    setPageZooms({ [leftPageNum]: lz, [rightPageNum]: rz });
    setActivePage(leftPageNum);

    // Signal that scroll restore is pending — will be consumed once pages render
    pendingScrollRestoreRef.current += 1;

    // Sync global zoom ref so delta mechanism doesn't double-apply
    lastGlobalZoomRef.current = zoomLevel;

    // Sync parent's global zoom to the left page zoom so the delta mechanism
    // works relative to the correct zoom when the user starts zooming
    if (onZoomSync) {
      onZoomSync(lz);
    }

    // Allow delta mechanism again after this render cycle completes
    requestAnimationFrame(() => {
      restoringZoomRef.current = false;
    });
  }, [pageView, activeSongNumber, persistFilename, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── When active page changes, sync global zoom to that page's zoom ──
  const handleSetActivePage = useCallback(
    (pageNum: number) => {
      setActivePage(pageNum);
      const pageZoom = pageZooms[pageNum] ?? ZOOM_DEFAULT;
      // Suppress delta so the sync doesn't get misinterpreted as a toolbar zoom
      restoringZoomRef.current = true;
      if (onZoomSync) {
        onZoomSync(pageZoom);
      }
      // After React processes the zoom sync, update our tracking ref and re-enable delta
      requestAnimationFrame(() => {
        // lastGlobalZoomRef will be synced in the next render via the restoringZoomRef branch
        restoringZoomRef.current = false;
      });
    },
    [pageZooms, onZoomSync],
  );

  // ── Apply global zoom changes (toolbar) to the active page in two-page mode ──
  const lastGlobalZoomRef = useRef(zoomLevel);
  if (pageView === 'two-page' && !restoringZoomRef.current && zoomLevel !== lastGlobalZoomRef.current) {
    const delta = zoomLevel / lastGlobalZoomRef.current;
    const newZoom = (pageZooms[activePage] ?? ZOOM_DEFAULT) * delta;
    setZoomForPage(activePage, newZoom);
    lastGlobalZoomRef.current = zoomLevel;
  }
  if (pageView !== 'two-page' || restoringZoomRef.current) {
    lastGlobalZoomRef.current = zoomLevel;
  }

  // Merge the external callback/object ref with our local ref
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      localContainerRef.current = node;
      if (typeof pdfContainerRef === 'function') {
        pdfContainerRef(node);
      } else if (pdfContainerRef && 'current' in pdfContainerRef) {
        (pdfContainerRef as MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [pdfContainerRef],
  );

  // Snapshot container height and set loading state when the PDF source changes
  const prevPdfUrlRef = useRef(pdfUrl);
  useEffect(() => {
    if (pdfUrl !== prevPdfUrlRef.current) {
      const el = localContainerRef.current;
      if (el && el.offsetHeight > 0) {
        lastContainerHeightRef.current = el.offsetHeight;
      }
      setPdfLoading(true);
      prevPdfUrlRef.current = pdfUrl;
    }
  }, [pdfUrl]);

  /** Wrapped onDocumentLoadSuccess — clears loading state then delegates */
  const handleDocumentLoadSuccess = useCallback(
    (data: { numPages: number }) => {
      setPdfLoading(false);
      lastContainerHeightRef.current = null;
      onDocumentLoadSuccess(data);
    },
    [onDocumentLoadSuccess],
  );

  /** Shared style for each page panel in two-page mode */
  const pagePanelSx = (pageNum: number) => ({
    flex: '1 1 0',
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    boxShadow: 3,
    scrollbarWidth: 'none' as const,
    '&::-webkit-scrollbar': { display: 'none' },
    outline: activePage === pageNum ? '2px solid' : '2px solid transparent',
    outlineColor: activePage === pageNum ? 'primary.main' : 'transparent',
    outlineOffset: -2,
    transition: 'outline-color 0.15s',
    cursor: 'pointer',
  });

  return (
    <Box sx={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Scrollable PDF area */}
      <Box
        ref={mergedRef}
        sx={{
          flex: '1 1 0',
          minHeight: lastContainerHeightRef.current ?? 0,
          overflowY: pageView === 'two-page' ? 'hidden' : 'auto',
          overflowX: pageView === 'two-page' ? 'hidden' : 'auto',
          bgcolor: 'grey.100',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          // alignItems: stretch (default) lets the centering wrapper fill the full container
          // width so its justify-content:center works correctly. The wrapper's minWidth:max-content
          // ensures the content can overflow and be scrolled when wider than the viewport.
          alignItems: 'stretch',
          touchAction: 'pan-x pan-y',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {pdfUrl ? (
          <>
            {/* Loading overlay — shown during PDF reload to prevent visual flash */}
            {pdfLoading && (
              <Stack
                sx={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'absolute',
                  inset: 0,
                  zIndex: 20,
                  bgcolor: 'rgba(245,245,245,0.7)',
                  pointerEvents: 'none',
                }}
              >
                <CircularProgress />
              </Stack>
            )}

            <Document
              file={pdfUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
              className={pageView === 'two-page' ? 'pdf-doc-two-page' : undefined}
            >
              {pageView === 'two-page' ? (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {currentPage > 0 && (
                    <Box
                      ref={leftPanelRef}
                      sx={pagePanelSx(leftPageNum)}
                      onClick={() => handleSetActivePage(leftPageNum)}
                      onScroll={handleScrollLeft}
                    >
                      <Page
                        pageNumber={currentPage}
                        width={pageBaseWidth * leftZoom}
                        renderAnnotationLayer
                        renderTextLayer
                        onRenderSuccess={handlePageRenderSuccess}
                      />
                    </Box>
                  )}
                  {hasRightPage && (
                    <Box
                      ref={rightPanelRef}
                      sx={pagePanelSx(rightPageNum)}
                      onClick={() => handleSetActivePage(rightPageNum)}
                      onScroll={handleScrollRight}
                    >
                      <Page
                        pageNumber={currentPage + 1}
                        width={pageBaseWidth * rightZoom}
                        renderAnnotationLayer
                        renderTextLayer
                        onRenderSuccess={handlePageRenderSuccess}
                      />
                    </Box>
                  )}
                </Stack>
              ) : (
                // Centering wrapper: min-width 100% so it always fills the scrollable container,
                // plus flex justify-content:center so the PDF stack is centred when it fits.
                // When the PDF is wider than the viewport the wrapper overflows, enabling
                // full left-edge scroll access without clipping the content.
                <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: '100%', py: 1 }}>
                  <Stack
                    spacing={2}
                    sx={{
                      alignItems: 'center',
                      minWidth: 'max-content',
                    }}
                  >
                    {Array.from({ length: Math.max(0, numPages || 0) }, (_, i) => i + 1).map((pageNum) => {
                      return (
                        <Box key={pageNum} sx={{ boxShadow: 3, position: 'relative' }}>
                          <Page
                            pageNumber={pageNum}
                            width={pageBaseWidth * zoomLevel}
                            renderAnnotationLayer
                            renderTextLayer
                            canvasBackground="white"
                            loading={pageNum === currentPage ? <CircularProgress /> : null}
                          />
                          {/* All block area overlays — always in the DOM at fixed positions,
                              only opacity/color transitions between idle/next/active states. */}
                          {allBlockAreaMappings && allBlockAreaMappings.length > 0 && (
                            <BlockAreaOverlays
                              mappings={allBlockAreaMappings}
                              pageNum={pageNum}
                              activeBlockName={isSynced ? (activeBlockAreaMapping?.blockName ?? null) : null}
                              nextBlockName={isSynced ? (nextBlockAreaMapping?.blockName ?? null) : null}
                              isSynced={!!isSynced}
                              containerRef={localContainerRef}
                              scrollKey={`${activeBlockIndex ?? 0}-${activeBlockAreaMapping?.blockName ?? ''}-${activeBlockAreaMapping?.page ?? 0}`}
                              orderedBlockNames={orderedBlockNames}
                              activeBlockIndex={activeBlockIndex ?? -1}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Document>
          </>
        ) : (
          <Stack
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              p: 4,
            }}
          >
            <CircularProgress />
          </Stack>
        )}
      </Box>
      {/* ── Annotation toolbar overlay — always mounted so canvas overlays retain state.
           Positioned absolute relative to outer column Box (position:relative).
           When not in edit mode: pointerEvents:none and height:0/overflow:visible so
           it contributes zero layout space and does not intercept touch/pointer events.
           When in edit mode: floats over the PDF above the footer. ── */}
      {pdfUrl && numPages > 0 && activeSongNumber != null && resolvedFilename && (
        <Box
          sx={{
            position: 'absolute',
            bottom: showFooter ? 56 : 8,
            left: 0,
            right: 0,
            zIndex: 15,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            // When not editing the toolbar renders nothing (canvas portals go elsewhere),
            // so we keep the Box but it has no visual presence.
          }}
        >
          <Box sx={{ pointerEvents: annotateMode ? 'auto' : 'none' }}>
            <PdfAnnotationToolbar
              currentPage={currentPage}
              numPages={numPages}
              pageWidth={pageBaseWidth * zoomLevel}
              pageHeight={pageBaseWidth * zoomLevel * 1.414}
              pdfUrl={pdfUrl}
              musicianName={musicianName}
              songNumber={activeSongNumber}
              songName={activeSongName}
              filename={resolvedFilename}
              containerRef={localContainerRef as RefObject<HTMLDivElement>}
              editMode={annotateMode}
              showAnnotations={showAnnotations}
              onShowAnnotationsChange={setShowAnnotations}
              hiddenLayers={hiddenLayers}
              onToggleLayerVisibility={handleToggleLayerVisibility}
              onRegisterRefetch={onRegisterRefetch}
            />
          </Box>
        </Box>
      )}
      {/* Footer */}
      {showFooter && activeSongNumber != null && resolvedFilename && (
        <MusicianFooter
          variant="pdf"
          zoomLevel={zoomLevel}
          numPages={numPages}
          resolvedFilename={resolvedFilename}
          availableFilenames={availableFilenames}
          onSelectPdf={onSelectPdf}
          onOpenPdfModal={onOpenPdfModal}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
          onZoomFitWidth={onZoomFitWidth}
          songNumber={activeSongNumber}
          filename={resolvedFilename}
          showAnnotations={showAnnotations}
          onShowAnnotationsChange={setShowAnnotations}
          hiddenLayers={hiddenLayers}
          onToggleLayerVisibility={handleToggleLayerVisibility}
        />
      )}
    </Box>
  );
};
