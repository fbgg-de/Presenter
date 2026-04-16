import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Box, Stack, Typography, Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import {
  KeyboardArrowUp as PrevSongIcon,
  KeyboardArrowDown as NextSongIcon,
  KeyboardArrowLeft as PrevPageIcon,
  KeyboardArrowRight as NextPageIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector } from '@/store/showSlice';
import { setSongsOrder, setSongOrders } from '@/store/songsSlice';
import { updateSetting } from '@/store/settingsSlice';
import { Shows } from '@/components/Shows';
import { QrCodeShare } from '@/components/QrCodeShare';
import { MusicianSidebar } from './MusicianSidebar';
import { MusicianToolbar, floatingBtnSx, type SyncMode } from './MusicianToolbar';
import { MusicianSettings } from './MusicianSettings';
import { PdfView } from './PdfView';
import { LyricsView } from './LyricsView';
import { usePdfViewer } from './usePdfViewer';
import { PdfUploadModal } from '@/components/PdfUploadModal';
import { PdfAreaMappingEditor } from '@/components/PdfAreaMappingEditor';
import { loadShowSongs } from '@/store/songsSlice';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import type { Show, ShowItem } from '@/api/shows.api';

/**
 * Top-level page component for the Musician View.
 *
 * Orchestrates the sidebar, toolbar, settings drawer, PDF/lyrics content area,
 * and the show selector dialog. Rendered as the sole child of the musician
 * entry-point (musician.tsx).
 */
export const MusicianPage = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { palette } = useTheme();
  const NAV_MARGIN = 36;

  // ── Redux selectors ──────────────────────────────────────────────
  const currentShow = useAppSelector((s) => s.show.currentShow);
  const isShowSelectorOpen = useAppSelector((s) => s.show.isShowSelectorOpen);
  const songs = useAppSelector((s) => s.songs.songs);

  // Operator's live position — read-only, never mutated by the musician
  const operatorItemIndex = useAppSelector((s) => s.presentation.activeItemIndex);
  const operatorActiveBlockIndex = useAppSelector((s) => s.presentation.activeBlockIndex);

  // Musician-specific settings
  const musicianName = useAppSelector((s) => s.settings.musicianName);
  const musicianBand = useAppSelector((s) => s.settings.musicianBand);
  const musicianTheme = useAppSelector((s) => s.settings.musicianTheme);
  const defaultPageView = useAppSelector((s) => s.settings.musicianPageView);
  const blockIndicator = useAppSelector((s) => s.settings.musicianBlockIndicator);
  const textSize = useAppSelector((s) => s.settings.musicianTextSize);
  const showFooter = useAppSelector((s) => s.settings.musicianShowFooter);
  const syncModeSetting = useAppSelector((s) => s.settings.musicianSyncMode) as SyncMode;
  const persistedSidebarOpen = useAppSelector((s) => s.settings.musicianSidebarOpen);
  const persistedLastItemIndex = useAppSelector((s) => s.settings.musicianLastItemIndex);

  // ── Local UI state ───────────────────────────────────────────────
  const [activeItemIndex, setActiveItemIndex] = useState(persistedLastItemIndex);
  const [sidebarOpen, setSidebarOpen] = useState(persistedSidebarOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [areaMappingOpen, setAreaMappingOpen] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [pdfOverrideFilename, setPdfOverrideFilename] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>(syncModeSetting);
  const initialLoadDone = useRef(false);
  /** Holds the latest annotation refetch function registered by PdfAnnotationToolbar */
  const annotationRefetchRef = useRef<(() => void) | null>(null);
  const handleRegisterRefetch = useCallback((fn: () => void) => {
    annotationRefetchRef.current = fn;
  }, []);

  // Persist sync mode changes
  const handleSetSyncMode = useCallback(
    (mode: SyncMode) => {
      setSyncMode(mode);
      dispatch(updateSetting({ key: 'musicianSyncMode', value: mode }));
    },
    [dispatch],
  );

  // ── Active item derivation ───────────────────────────────────────
  const showItems: ShowItem[] = currentShow?.order ?? [];

  // Clamp persisted item index to valid range when show items load
  useEffect(() => {
    if (showItems.length > 0 && activeItemIndex >= showItems.length) {
      const clamped = Math.max(0, showItems.length - 1);
      setActiveItemIndex(clamped);
      dispatch(updateSetting({ key: 'musicianLastItemIndex', value: clamped }));
    }
  }, [showItems.length, activeItemIndex, dispatch]);

  const activeItem: ShowItem | undefined = showItems[activeItemIndex];
  const activeSongNumber = activeItem?.type === 'song' ? activeItem.songNumber : undefined;
  const activeSong = activeSongNumber != null ? songs[activeSongNumber] : undefined;

  const canGoPrev = activeItemIndex > 0;
  const canGoNext = showItems.length > 0 && activeItemIndex < showItems.length - 1;

  const parsedOrder = useMemo(() => parseOrderKey(activeItem?.order), [activeItem?.order]);
  const activeKey = activeItem?.key || parsedOrder.key;
  const activeSongOrder = parsedOrder.order || 'Default';

  // Compute lyrics blocks for the active song
  const lyricsBlocks = useMemo(() => {
    if (!activeSong) return [];
    try {
      return activeSong.getBlocks(activeSongOrder);
    } catch {
      return [];
    }
  }, [activeSong, activeSongOrder]);

  // Collect unique musician names from song orders for the settings picker
  const musicianNames = useMemo(() => {
    const names = new Set<string>();
    for (const song of Object.values(songs)) {
      if (song.order) {
        for (const orderName of Object.keys(song.order)) {
          const parsed = parseOrderKey(orderName);
          if (parsed.order && parsed.order !== 'Default') {
            names.add(parsed.order);
          }
        }
      }
    }
    return Array.from(names).sort();
  }, [songs]);

  // Available band / order names from all loaded songs
  const availableBands = useMemo(() => {
    const bands = new Set<string>(['Default']);
    for (const song of Object.values(songs)) {
      if (song.order) {
        for (const orderName of Object.keys(song.order)) {
          const parsed = parseOrderKey(orderName);
          if (parsed.order) bands.add(parsed.order);
        }
      }
    }
    return Array.from(bands).sort();
  }, [songs]);

  // Block names for area mapping editor (exclude copyright pseudo-block)
  const activeSongBlocks = useMemo(() => lyricsBlocks.filter((b) => !b.copyright).map((b) => b.name), [lyricsBlocks]);

  // ── PDF viewer hook ──────────────────────────────────────────────
  const pdfViewer = usePdfViewer({
    activeItem,
    musicianName,
    musicianBand,
    syncMode,
    operatorActiveBlockIndex,
    lyricsBlocks,
    defaultPageView,
    blockIndicator,
    pdfOverrideFilename,
  });

  const hasPdfs = pdfViewer.totalPdfCount > 0;
  const isSongItem = activeItem?.type === 'song';

  // PDF page navigation
  const canGoPrevPage = hasPdfs && pdfViewer.currentPage > 1;
  const canGoNextPage = hasPdfs && pdfViewer.currentPage < pdfViewer.numPages;

  // ── Show loading ─────────────────────────────────────────────────
  useEffect(() => {
    if (!initialLoadDone.current && currentShow && !isShowSelectorOpen) {
      initialLoadDone.current = true;
      void dispatch(loadShowSongs(currentShow));
    }
  }, [currentShow, isShowSelectorOpen, dispatch]);

  const handleShowSelected = useCallback(
    async (show: Show | null, isNew: boolean) => {
      if (!show) return;
      dispatch(setCurrentShow(show));
      dispatch(closeShowSelector());
      if (!isNew) {
        await dispatch(loadShowSongs(show));
      } else {
        dispatch(setSongsOrder([]));
        dispatch(setSongOrders({}));
      }
    },
    [dispatch],
  );

  const handleSelectItem = useCallback(
    (index: number) => {
      pdfViewer.saveScrollPosition();
      setAnnotateMode(false);
      setPdfOverrideFilename(null);
      setActiveItemIndex(index);
      dispatch(updateSetting({ key: 'musicianLastItemIndex', value: index }));
    },
    [pdfViewer, dispatch],
  );

  /** Manual navigation (prev/next buttons) — disables sync first */
  const handleManualNav = useCallback(
    (index: number) => {
      if (syncMode !== 'off') {
        setSyncMode('off');
        dispatch(updateSetting({ key: 'musicianSyncMode', value: 'off' }));
      }
      handleSelectItem(index);
    },
    [syncMode, dispatch, handleSelectItem],
  );

  // Persist sidebar toggle
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      dispatch(updateSetting({ key: 'musicianSidebarOpen', value: next }));
      return next;
    });
  }, [dispatch]);

  // Reset annotate mode when the active item changes
  useEffect(() => {
    setAnnotateMode(false);
    setPdfOverrideFilename(null);
  }, [activeItemIndex]);

  // ── Sync: follow operator item selection ─────────────────────────
  useEffect(() => {
    if (syncMode === 'operator' && operatorItemIndex !== activeItemIndex) {
      handleSelectItem(operatorItemIndex);
    }
  }, [syncMode, operatorItemIndex]); // intentionally exclude handleSelectItem / activeItemIndex to avoid loops

  const isSynced = syncMode === 'operator' && blockIndicator;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* Show selector dialog */}
      <Shows
        open={isShowSelectorOpen}
        onShowSelected={handleShowSelected}
        allowClose={!!currentShow}
        onClose={() => dispatch(closeShowSelector())}
        currentShowTitle={currentShow?.title}
      />

      {/* QR sharing dialog */}
      <QrCodeShare open={qrOpen} onClose={() => setQrOpen(false)} />

      {/* PDF Upload dialog — always available for song items */}
      {activeSongNumber != null && (
        <PdfUploadModal
          songNumber={activeSongNumber}
          open={pdfUploadOpen}
          onClose={() => setPdfUploadOpen(false)}
          musicianNames={musicianNames}
          selectedPdf={pdfOverrideFilename || pdfViewer.resolvedFilename}
          onSelectPdf={(f) => setPdfOverrideFilename(f)}
          onOpenAreaMapping={() => setAreaMappingOpen(true)}
        />
      )}

      {/* PDF Area Mapping editor */}
      {pdfViewer.pdfUrl && (
        <PdfAreaMappingEditor
          open={areaMappingOpen}
          onClose={() => setAreaMappingOpen(false)}
          pdfUrl={pdfViewer.pdfUrl}
          blockNames={activeSongBlocks}
          initialMappings={pdfViewer.areaMappings}
          onSave={pdfViewer.handleSaveAreaMappings}
        />
      )}

      {/* Settings drawer */}
      <MusicianSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        musicianName={musicianName}
        musicianBand={musicianBand}
        musicianTheme={musicianTheme}
        defaultPageView={defaultPageView}
        blockIndicator={blockIndicator}
        textSize={textSize}
        showFooter={showFooter}
        musicianNames={musicianNames}
        availableBands={availableBands}
        setQrOpen={setQrOpen}
        setPdfUploadOpen={setPdfUploadOpen}
      />

      {/* Main layout */}
      <Stack direction="row" sx={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <MusicianSidebar
          open={sidebarOpen}
          activeItemIndex={activeItemIndex}
          operatorActiveIndex={operatorItemIndex}
          onSelectItem={handleSelectItem}
          onOpenPdfModal={() => setPdfUploadOpen(true)}
        />

        {/* Content area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            // Push content above mobile system navigation bars (Android gesture bar,
            // iOS home indicator) without affecting desktop where safe-area-inset-bottom is 0.
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Floating toolbar */}
          <MusicianToolbar
            sidebarOpen={sidebarOpen}
            onToggleSidebar={handleToggleSidebar}
            syncMode={syncMode}
            onSetSyncMode={handleSetSyncMode}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPdfModal={() => setPdfUploadOpen(true)}
            isSongItem={isSongItem}
            activeSongNumber={activeSongNumber}
            pageView={pdfViewer.pageView}
            onSetPageView={pdfViewer.handleSetPageView}
            zoomLevel={pdfViewer.zoomLevel}
            onZoomIn={pdfViewer.handleZoomIn}
            onZoomOut={pdfViewer.handleZoomOut}
            onZoomReset={pdfViewer.handleZoomReset}
            onZoomFitWidth={pdfViewer.handleZoomFitWidth}
            annotateMode={annotateMode}
            onToggleAnnotate={() => setAnnotateMode((a) => !a)}
            hasPdfs={hasPdfs}
            onRefetchAnnotations={() => annotationRefetchRef.current?.()}
          />

          {/* Main content */}
          {!currentShow ? (
            <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, p: 4 }}>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                {LL.MUSICIAN.NO_SHOW()}
              </Typography>
              <Button variant="contained" onClick={() => dispatch(closeShowSelector())}>
                {LL.MUSICIAN.SELECT_SHOW()}
              </Button>
            </Stack>
          ) : !activeItem ? (
            <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, p: 4 }}>
              <CircularProgress />
            </Stack>
          ) : isSongItem && hasPdfs ? (
            /* PDF view for songs with PDFs */
            <PdfView
              pdfUrl={pdfViewer.pdfUrl}
              pdfContainerRef={pdfViewer.pdfContainerRef}
              currentPage={pdfViewer.currentPage}
              numPages={pdfViewer.numPages}
              zoomLevel={pdfViewer.zoomLevel}
              pageView={pdfViewer.pageView}
              pageBaseWidth={pdfViewer.pageBaseWidth}
              annotateMode={annotateMode}
              onDocumentLoadSuccess={pdfViewer.onDocumentLoadSuccess}
              onDocumentLoadError={() => pdfViewer.setPdfLoadError(true)}
              musicianName={musicianName}
              activeSongNumber={activeSongNumber}
              activeSongName={activeSong?.title}
              showFooter={showFooter}
              resolvedFilename={pdfViewer.resolvedFilename}
              stableResolvedFilename={pdfViewer.stableResolvedFilename}
              availableFilenames={pdfViewer.availableFilenames}
              onSelectPdf={(f) => setPdfOverrideFilename(f)}
              onOpenPdfModal={() => setPdfUploadOpen(true)}
              onZoomIn={pdfViewer.handleZoomIn}
              onZoomOut={pdfViewer.handleZoomOut}
              onZoomReset={pdfViewer.handleZoomReset}
              onZoomFitWidth={pdfViewer.handleZoomFitWidth}
              onZoomSync={pdfViewer.setZoomLevel}
              onRegisterRefetch={handleRegisterRefetch}
            />
          ) : isSongItem && activeSong ? (
            /* Lyrics fallback for songs without PDFs */
            <LyricsView
              activeSongNumber={activeSongNumber}
              activeKey={activeKey}
              lyricsBlocks={lyricsBlocks}
              isSynced={isSynced}
              operatorActiveBlockIndex={operatorActiveBlockIndex}
              pageView={pdfViewer.pageView}
              textSize={textSize}
              showFooter={showFooter}
              activeSong={activeSong}
              setPdfUploadOpen={setPdfUploadOpen}
            />
          ) : (
            /* Non-song items — placeholder */
            <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, p: 4, opacity: 0.5 }}>
              <Typography variant="body1" color="text.secondary">
                {activeItem.label || activeItem.bibleRef || 'Media'}
              </Typography>
            </Stack>
          )}

          {/* Floating navigation buttons — bottom corners.
               Hidden when annotateMode is active so they don't intercept drawing events. */}
          {/* Left group: prev page + prev song */}
          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              position: 'absolute',
              left: NAV_MARGIN,
              bottom: `calc(${NAV_MARGIN}px + env(safe-area-inset-bottom, 0px))`,
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <Tooltip title={LL.MUSICIAN.PREV_PAGE()} placement="top">
              <IconButton
                onClick={() => canGoPrevPage && pdfViewer.setCurrentPage(pdfViewer.currentPage - 1)}
                size="small"
                sx={{
                  ...floatingBtnSx(palette),
                  opacity: canGoPrevPage ? 1 : 0.15,
                  pointerEvents: canGoPrevPage ? 'auto' : 'none',
                }}
              >
                <PrevPageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={LL.MUSICIAN.PREV_SONG()} placement="top">
              <IconButton
                onClick={() => canGoPrev && handleManualNav(activeItemIndex - 1)}
                size="small"
                sx={{
                  ...floatingBtnSx(palette),
                  opacity: canGoPrev ? 1 : 0.15,
                  pointerEvents: canGoPrev ? 'auto' : 'none',
                }}
              >
                <PrevSongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Right group: next song + next page */}
          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              position: 'absolute',
              right: NAV_MARGIN,
              bottom: NAV_MARGIN,
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <Tooltip title={LL.MUSICIAN.NEXT_SONG()} placement="top">
              <IconButton
                onClick={() => canGoNext && handleManualNav(activeItemIndex + 1)}
                size="small"
                sx={{
                  ...floatingBtnSx(palette),
                  opacity: canGoNext ? 1 : 0.15,
                  pointerEvents: canGoNext ? 'auto' : 'none',
                }}
              >
                <NextSongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={LL.MUSICIAN.NEXT_PAGE()} placement="top">
              <IconButton
                onClick={() => canGoNextPage && pdfViewer.setCurrentPage(pdfViewer.currentPage + 1)}
                size="small"
                sx={{
                  ...floatingBtnSx(palette),
                  opacity: canGoNextPage ? 1 : 0.15,
                  pointerEvents: canGoNextPage ? 'auto' : 'none',
                }}
              >
                <NextPageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>
    </>
  );
};
