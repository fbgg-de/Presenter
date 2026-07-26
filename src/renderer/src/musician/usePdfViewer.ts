import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useGetPdfAreaMappingsQuery, useListPdfsQuery, useResolvePdfQuery, useSavePdfAreaMappingsMutation } from '@/api/pdfs.api';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import type { ShowItem } from '@/api/shows.api';
import type { PdfAreaMapping } from '@/components/pdf/PdfAreaMappingEditor';

export type PageViewMode = 'two-page' | 'one-page';
export type SyncMode = 'off' | 'operator' | 'midi';

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_DEFAULT = 1.0;

/** Tracks the intended smooth-scroll destination per container to enable correct
 *  visibility checks while an animation is in progress. Shared with PdfView via
 *  the exported helpers below so both scroll mechanisms agree on pending targets. */
const pdfScrollTargets = new WeakMap<HTMLElement, number>();

export const getPdfScrollTarget = (container: HTMLElement): number | undefined => pdfScrollTargets.get(container);

/** Smooth-scroll a container and track the destination until the scroll settles.
 *  The timeout fallback covers browsers without `scrollend`, interrupted animations
 *  and no-op scrolls (already at target), which never emit a scrollend event. */
export const pdfSmoothScrollTo = (container: HTMLElement, targetY: number): void => {
  pdfScrollTargets.set(container, targetY);
  container.scrollTo({ top: targetY, behavior: 'smooth' });
  const clear = () => {
    container.removeEventListener('scrollend', clear);
    clearTimeout(timer);
    if (pdfScrollTargets.get(container) === targetY) pdfScrollTargets.delete(container);
  };
  const timer = setTimeout(clear, 1500);
  container.addEventListener('scrollend', clear);
};

const SONGS_STORAGE_KEY = 'presenter_musician';
const SONGS_STORAGE_KEY_OLD = 'presenter_musician_songs'; // migration ToDo remove

interface PageState {
  zoom?: number;
  /** @deprecated Use scrollX/scrollY instead */
  scroll?: number;
  scrollX?: number;
  scrollY?: number;
}

interface SongFileState {
  pageView?: PageViewMode;
  pages?: Record<string, PageState>;
}

type SongsStorage = Record<string, Record<string, SongFileState>>;

// ToDo move to redux slice
const loadSongsStorage = (): SongsStorage => {
  try {
    // Try new key first; pdf data lives under "pdfState" subkey
    const v = localStorage.getItem(SONGS_STORAGE_KEY);
    if (v) {
      const parsed = JSON.parse(v) as Record<string, unknown>;
      return (parsed.pdfState as SongsStorage | undefined) ?? {};
    }
    // Migration: read old standalone key
    const old = localStorage.getItem(SONGS_STORAGE_KEY_OLD);
    if (old) {
      const data = JSON.parse(old) as SongsStorage;
      saveSongsStorage(data);
      localStorage.removeItem(SONGS_STORAGE_KEY_OLD);
      return data;
    }
    return {};
  } catch {
    return {};
  }
};

const saveSongsStorage = (data: SongsStorage): void => {
  try {
    const raw = localStorage.getItem(SONGS_STORAGE_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    current['pdfState'] = data;
    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(current));
  } catch {}
};

const getSongFileState = (songNumber: number, filename: string): SongFileState => {
  const data = loadSongsStorage();
  return data[String(songNumber)]?.[filename] ?? {};
};

export const getPageState = (songNumber: number, filename: string, page: number): PageState => {
  const file = getSongFileState(songNumber, filename);
  return file.pages?.[String(page)] ?? {};
};

const setSongFileField = (songNumber: number, filename: string, patch: Partial<Omit<SongFileState, 'pages'>>): void => {
  const data = loadSongsStorage();
  const sn = String(songNumber);
  if (!data[sn]) data[sn] = {};
  data[sn][filename] = { ...data[sn][filename], ...patch };
  saveSongsStorage(data);
};

export const setPageField = (songNumber: number, filename: string, page: number, patch: Partial<PageState>): void => {
  const data = loadSongsStorage();
  const sn = String(songNumber);
  if (!data[sn]) data[sn] = {};
  if (!data[sn][filename]) data[sn][filename] = {};
  if (!data[sn][filename].pages) data[sn][filename].pages = {};
  const p = String(page);
  data[sn][filename].pages![p] = { ...data[sn][filename].pages![p], ...patch };
  saveSongsStorage(data);
};

interface UsePdfViewerProps {
  activeItem?: ShowItem;
  musicianName: string;
  musicianBand: string | null;
  syncMode: SyncMode;
  operatorActiveBlockIndex: number | null;
  lyricsBlocks: any[];
  defaultPageView: PageViewMode;
  blockIndicator: boolean;
  pdfOverrideFilename: string | null;
}

export const usePdfViewer = ({
  activeItem,
  musicianName,
  musicianBand,
  syncMode,
  operatorActiveBlockIndex,
  lyricsBlocks,
  defaultPageView,
  blockIndicator,
  pdfOverrideFilename,
}: UsePdfViewerProps) => {
  // const dispatch = useAppDispatch();
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  // Track when the container element actually mounts so effects can depend on it
  const [pdfContainerEl, setPdfContainerEl] = useState<HTMLDivElement | null>(null);
  const pdfContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    pdfContainerRef.current = node;
    setPdfContainerEl(node);
  }, []);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(ZOOM_DEFAULT);
  const [pageView, setPageView] = useState<PageViewMode>(defaultPageView);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [areaMappings, setAreaMappings] = useState<PdfAreaMapping[]>([]);

  const activeSongNumber = activeItem?.type === 'song' ? activeItem.songNumber : undefined;
  const parsedOrder = useMemo(() => parseOrderKey(activeItem?.order), [activeItem?.order]);
  const activeKey = activeItem?.key || parsedOrder.key;
  const activeSongOrder = parsedOrder.order || 'Default';

  const { data: resolveResult, currentData: currentResolveResult } = useResolvePdfQuery(
    {
      songNumber: activeSongNumber!,
      musician: musicianName || undefined,
      order: musicianBand || activeSongOrder,
      key: activeKey || undefined,
    },
    { skip: activeSongNumber == null },
  );

  const resolvedFilename = pdfOverrideFilename ?? resolveResult?.filename ?? null;
  const stableResolvedFilename = currentResolveResult?.filename ?? null;
  const totalPdfCount = resolveResult?.total ?? 0;

  // List all available PDF filenames for the file selector
  const { data: pdfListData } = useListPdfsQuery({ songNumber: activeSongNumber! }, { skip: activeSongNumber == null });
  const availableFilenames = useMemo(() => (pdfListData as any)?.map?.((f: { filename: string }) => f.filename) ?? [], [pdfListData]);

  const resolvedFilenameRef = useRef<string | null>(null);
  useEffect(() => {
    resolvedFilenameRef.current = resolvedFilename;
  }, [resolvedFilename]);

  const pdfUrl = useMemo(() => {
    if (!activeItem || activeItem.type !== 'song' || activeItem.songNumber == null) return null;
    if (!resolvedFilename) return null;
    const path = `rest/Pdfs/${activeItem.songNumber}/${encodeURIComponent(resolvedFilename)}`;
    const url = new URL(path, window.location.origin + '/');
    return url.href;
  }, [activeItem, resolvedFilename]);

  const [saveMappingsMutation] = useSavePdfAreaMappingsMutation();

  const { data: serverMappings } = useGetPdfAreaMappingsQuery(
    { songNumber: activeSongNumber!, filename: resolvedFilename!, musician: musicianName || '_' },
    { skip: activeSongNumber == null || !resolvedFilename },
  );

  useEffect(() => {
    if (serverMappings) setAreaMappings(serverMappings);
    else setAreaMappings([]);
  }, [serverMappings]);

  // Track container width — depend on pdfContainerEl so it re-runs after mount
  useEffect(() => {
    const el = pdfContainerEl;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [pdfContainerEl]);

  const pageBaseWidth = useMemo(() => {
    const available = containerWidth || 800;
    if (pageView === 'two-page') {
      const gap = 8;
      return Math.min((available - gap) / 2, 550);
    }
    return Math.min(available, 800);
  }, [containerWidth, pageView]);

  // Guard: skip zoom/scroll save when a restore is in progress (prevents writing stale values during song transitions)
  const skipZoomSaveRef = useRef(false);

  // Set when a synced block advance changes currentPage — consumed by the
  // page-top scroll effect so it doesn't fight the block-targeted smooth scroll.
  const blockSyncPageChangeRef = useRef(false);

  // Pending retry timer for the block-sync scroll while the PDF is still rendering
  const blockScrollRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // True while block sync is responsible for positioning the view — the saved-scroll
  // restore must not fire then, or it would override the block-targeted scroll.
  const syncPositionsViewRef = useRef(false);
  syncPositionsViewRef.current =
    (syncMode === 'operator' || syncMode === 'midi') &&
    blockIndicator &&
    operatorActiveBlockIndex != null &&
    operatorActiveBlockIndex >= 0 &&
    !!areaMappings.find((m) => m.blockName === lyricsBlocks[operatorActiveBlockIndex]?.name)?.region;

  // Ref that always holds current pageView for use in callbacks without re-creating them
  const pageViewRef = useRef(pageView);
  pageViewRef.current = pageView;

  const saveScrollPosition = useCallback(() => {
    const container = pdfContainerRef.current;
    if (container && activeSongNumber != null && stableResolvedFilename) {
      // In two-page mode the outer container doesn't scroll — PdfView handles per-panel persistence
      if (pageViewRef.current === 'two-page') return;
      setPageField(activeSongNumber, stableResolvedFilename, currentPage, {
        scrollX: container.scrollLeft,
        scrollY: container.scrollTop,
      });
    }
  }, [activeSongNumber, currentPage, stableResolvedFilename]);

  // Persistence effects — use stableResolvedFilename (null during query transitions) to avoid
  // reading/writing state for a mismatched songNumber + stale filename pair.
  useEffect(() => {
    // Set skip flag so the zoom save effect (which runs later in this effect batch)
    // doesn't write the stale zoomLevel to the new song's storage.
    skipZoomSaveRef.current = true;

    if (activeSongNumber != null && stableResolvedFilename) {
      const fileState = getSongFileState(activeSongNumber, stableResolvedFilename);
      const restoredPageView = fileState.pageView ?? defaultPageView;
      setPageView(restoredPageView);
      if (restoredPageView !== 'two-page') {
        // One-page mode: restore the stored zoom
        const ps = getPageState(activeSongNumber, stableResolvedFilename, 1);
        const newZoom = ps.zoom != null ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ps.zoom)) : ZOOM_DEFAULT;
        setZoomLevel(newZoom);
      }
      // In two-page mode: PdfView handles per-page zoom and syncs the global level via onZoomSync.
      // Don't touch zoomLevel here — PdfView will set it correctly.
    } else if (activeSongNumber == null) {
      setZoomLevel(ZOOM_DEFAULT);
      setPageView(defaultPageView);
    }
    // When stableResolvedFilename is null (query in-flight), do nothing — wait for the correct filename.

    // Re-enable saves after all React render/effect cycles from this transition complete.
    // setTimeout(0) fires after synchronous rendering, unlike queueMicrotask which fires between renders.
    const timer = setTimeout(() => {
      skipZoomSaveRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [stableResolvedFilename, activeSongNumber, defaultPageView]);

  // Save zoom level when it changes — in one-page mode only (two-page mode is handled by PdfView per-panel)
  useEffect(() => {
    if (pageView === 'two-page') return;
    // Skip writes during a restore cycle to prevent stale zoom from previous song leaking
    if (skipZoomSaveRef.current) return;
    if (activeSongNumber != null && stableResolvedFilename && !pdfOverrideFilename && currentPage > 0) {
      setPageField(activeSongNumber, stableResolvedFilename, currentPage, { zoom: zoomLevel });
    }
  }, [zoomLevel, activeSongNumber, stableResolvedFilename, pdfOverrideFilename, currentPage, pageView]);

  const handleSetPageView = useCallback(
    (mode: PageViewMode) => {
      setPageView(mode);
      if (activeSongNumber != null && stableResolvedFilename) {
        setSongFileField(activeSongNumber, stableResolvedFilename, { pageView: mode });
      }
    },
    [activeSongNumber, stableResolvedFilename],
  );

  useEffect(() => {
    return () => saveScrollPosition();
  }, [saveScrollPosition]);

  // Zoom handlers
  const applyZoom = useCallback((factor: number) => {
    setZoomLevel((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor)));
  }, []);

  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10)), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10)), []);
  const handleZoomReset = useCallback(() => setZoomLevel(ZOOM_DEFAULT), []);

  const handleZoomFitWidth = useCallback(() => {
    const container = pdfContainerRef.current;
    if (!container) return;
    const pageEl = container.querySelector('.react-pdf__Page') as HTMLElement | null;
    if (pageEl) {
      const renderedWidth = pageEl.getBoundingClientRect().width;
      const available = container.clientWidth;
      const targetWidth = pageView === 'two-page' ? (available - 8) / 2 : available;
      if (renderedWidth > 0) {
        const newZoom = zoomLevel * (targetWidth / renderedWidth);
        setZoomLevel(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(newZoom * 100) / 100)));
        return;
      }
    }
    setZoomLevel(ZOOM_DEFAULT);
  }, [pageView, zoomLevel]);

  // Event listeners for zoom
  useEffect(() => {
    const container = pdfContainerEl;
    if (!container) return;

    const preventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener('wheel', preventBrowserZoom, { passive: false });

    let lastPointerPinchAt = 0;
    const DEDUP_MS = 500;

    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() - lastPointerPinchAt < DEDUP_MS) return;
      const delta = -e.deltaY;
      const clamped = Math.max(-50, Math.min(50, delta));
      applyZoom(1 + clamped * 0.008);
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    const getDistance = () => {
      const pts = Array.from(pointers.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinchStartDist = getDistance();
        // Disable native panning while pinch-zooming
        container.style.touchAction = 'none';
        for (const id of pointers.keys()) {
          try {
            container.setPointerCapture(id);
          } catch {}
        }
      }
      // Single finger: leave native scroll intact (no capture)
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStartDist > 0) {
        const dist = getDistance();
        const ratio = dist / pinchStartDist;
        if (Math.abs(ratio - 1) > 0.005) {
          applyZoom(ratio);
          pinchStartDist = dist;
          lastPointerPinchAt = Date.now();
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const wasPinching = pointers.size >= 2;
      pointers.delete(e.pointerId);
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}
      if (wasPinching) {
        lastPointerPinchAt = Date.now();
        pinchStartDist = 0;
        // Restore native scrolling after pinch ends
        container.style.touchAction = 'pan-x pan-y';
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('wheel', preventBrowserZoom);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [applyZoom, pdfContainerEl]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: np }: { numPages: number }) => {
      setNumPages(np);
      setPdfLoadError(false);

      // In two-page mode PdfView handles per-panel scroll restore via its own refs
      if (pageView === 'two-page') return;
      const fname = resolvedFilenameRef.current;
      if (activeSongNumber != null && fname) {
        const ps = getPageState(activeSongNumber, fname, currentPage);
        const savedY = ps.scrollY ?? ps.scroll ?? 0;
        const savedX = ps.scrollX ?? 0;
        if ((savedY > 0 || savedX > 0) && pdfContainerRef.current) {
          setTimeout(() => {
            // While block sync positions the view, restoring a saved scroll would
            // fight the block-targeted scroll. Checked at fire time so mappings
            // that arrive during the delay are taken into account.
            if (syncPositionsViewRef.current) return;
            if (pdfContainerRef.current) {
              pdfContainerRef.current.scrollTop = savedY;
              pdfContainerRef.current.scrollLeft = savedX;
            }
          }, 200);
        }
      }
    },
    [activeSongNumber, currentPage, pageView],
  );

  const handleSaveAreaMappings = useCallback(
    (mappings: PdfAreaMapping[]) => {
      setAreaMappings(mappings);
      const fname = resolvedFilenameRef.current;
      if (activeSongNumber != null && fname) {
        saveMappingsMutation({
          songNumber: activeSongNumber,
          filename: fname,
          musician: musicianName || '_',
          mappings,
        }).catch((err) => console.error('[MusicianPDF] Failed to save area mappings:', err));
      }
    },
    [musicianName, activeSongNumber, saveMappingsMutation],
  );

  // Sync scroll to mapped block — only when the block region is not already visible.
  // Uses a module-level WeakMap to track the intended scroll destination so that
  // visibility checks during an in-progress smooth scroll use the target position
  // (where the container *will* be) rather than the live mid-animation scrollTop.
  useEffect(() => {
    if ((syncMode !== 'operator' && syncMode !== 'midi') || !blockIndicator || areaMappings.length === 0) return;
    if (operatorActiveBlockIndex == null || operatorActiveBlockIndex < 0) return;

    const activeBlock = lyricsBlocks[operatorActiveBlockIndex];
    if (!activeBlock) return;

    const mapping = areaMappings.find((m) => m.blockName === activeBlock.name);
    if (!mapping || !mapping.region) return;

    if (mapping.page !== currentPage) {
      // This effect performs its own targeted smooth scroll below, so the
      // instant "jump to page top" effect must not fire for this page change.
      blockSyncPageChangeRef.current = true;
      setCurrentPage(mapping.page);
    }

    const attempt = (retriesLeft: number) => {
      const container = pdfContainerRef.current;
      if (!container) return;

      const pages = container.querySelectorAll('.react-pdf__Page');
      const pageIdx = pageView === 'two-page' ? Math.floor((mapping.page - 1) / 2) : mapping.page - 1;
      const pageEl = pages[pageIdx] as HTMLElement | undefined;
      if (!pageEl || pageEl.offsetHeight === 0) {
        // PDF document/page not rendered yet (e.g. right after a song switch) —
        // retry until it is, so the block positioning isn't silently dropped.
        if (retriesLeft > 0) {
          blockScrollRetryRef.current = setTimeout(() => attempt(retriesLeft - 1), 150);
        }
        return;
      }

      // Compute block top/bottom in scroll-space. Measured via bounding rects so
      // positioned wrapper elements between page and container (e.g. the overlay
      // anchor around each page) don't break the calculation like offsetTop would.
      const pageTop = pageEl.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      const regionTopFraction = mapping.region!.y / 100;
      const regionBottomFraction = (mapping.region!.y + mapping.region!.height) / 100;
      const blockTop = pageTop + regionTopFraction * pageEl.offsetHeight;
      const blockBottom = pageTop + regionBottomFraction * pageEl.offsetHeight;

      // Use the pending target if a smooth scroll is in progress, otherwise live scrollTop.
      const pending = getPdfScrollTarget(container);
      const effectiveTop = pending ?? container.scrollTop;
      const fullyVisible = blockTop >= effectiveTop && blockBottom <= effectiveTop + container.clientHeight;

      if (!fullyVisible) {
        const targetY = Math.max(0, blockTop - container.clientHeight / 2 + (blockBottom - blockTop) / 2);
        pdfSmoothScrollTo(container, targetY);
      }
    };

    if (blockScrollRetryRef.current) clearTimeout(blockScrollRetryRef.current);
    attempt(40);
    return () => {
      if (blockScrollRetryRef.current) {
        clearTimeout(blockScrollRetryRef.current);
        blockScrollRetryRef.current = null;
      }
    };
  }, [operatorActiveBlockIndex, syncMode, blockIndicator, areaMappings, lyricsBlocks, currentPage, pageView]);

  useEffect(() => {
    // Skip the instant page-top jump when the page change came from block sync —
    // the sync effect scrolls precisely to the mapped block (and only if needed).
    if (blockSyncPageChangeRef.current) {
      blockSyncPageChangeRef.current = false;
      return;
    }
    if (pdfContainerRef.current && numPages > 0) {
      const pages = pdfContainerRef.current.querySelectorAll('.react-pdf__Page');
      const idx = pageView === 'two-page' ? Math.floor((currentPage - 1) / 2) : currentPage - 1;
      pages[idx]?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [currentPage]);

  return {
    pdfContainerRef: pdfContainerCallbackRef,
    currentPage,
    setCurrentPage,
    numPages,
    zoomLevel,
    setZoomLevel,
    pageView,
    containerWidth,
    pdfLoadError,
    setPdfLoadError,
    areaMappings,
    handleSaveAreaMappings,
    resolvedFilename,
    stableResolvedFilename,
    totalPdfCount,
    availableFilenames,
    pdfUrl,
    pageBaseWidth,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomFitWidth,
    handleSetPageView,
    onDocumentLoadSuccess,
    saveScrollPosition,
  };
};
