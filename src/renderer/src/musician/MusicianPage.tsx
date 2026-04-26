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
import { useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector, useGetShow } from '@/store/showSlice';
import { setSongsOrder, setSongOrders, useGetSongs } from '@/store/songsSlice';
import { useGetMusicianSettings, useUpdateMusicianSetting } from '@/store/musicianSlice';
import { Shows } from '@/components/show/Shows';
import { QrCodeShare } from '@/components/settings/QrCodeShare';
import { MusicianSidebar } from './MusicianSidebar';
import { MusicianToolbar, floatingBtnSx, type SyncMode } from './MusicianToolbar';
import { MusicianSettings } from './MusicianSettings';
import { PdfView } from './PdfView';
import { LyricsView } from './LyricsView';
import { usePdfViewer } from './usePdfViewer';
import { PdfUploadModal } from '@/components/pdf/PdfUploadModal';
import { PdfAreaMappingEditor } from '@/components/pdf/PdfAreaMappingEditor';
import { MidiLearnDialog } from '@/components/midi/MidiLearnDialog';
import { useMidi, type MidiAction } from '@/hooks/useMidi';
import { loadShowSongs } from '@/store/songsSlice';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import type { Show, ShowItem } from '@/api/shows.api';
import { useGetPresentationSettings } from '@/store/presentationSlice';

/**
 * Top-level page component for the Musician View.
 *
 * Orchestrates the sidebar, toolbar, settings drawer, PDF/lyrics content area,
 * and the show selector dialog. Rendered as the sole child of the musician
 * entry-point (musician.tsx).
 */
export const MusicianPage = () => {
  const NAV_MARGIN = 36;

  const { palette } = useTheme();
  const { LL } = useI18nContext();
  const {
    musicianName,
    musicianBand,
    musicianTheme,
    musicianPageView: defaultPageView,
    musicianBlockIndicator: blockIndicator,
    musicianTextSize: textSize,
    musicianShowFooter: showFooter,
    musicianSyncMode: syncModeSetting,
    musicianSidebarOpen: persistedSidebarOpen,
    musicianLastItemIndex: persistedLastItemIndex,
  } = useGetMusicianSettings();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { songs } = useGetSongs();

  // Operator's live position — read-only, never mutated by the musician
  const { activeItemIndex: operatorItemIndex, activeBlockIndex: operatorActiveBlockIndex } = useGetPresentationSettings();

  const updateMusicianSetting = useUpdateMusicianSetting();

  const dispatch = useAppDispatch();

  // ── Local UI state ───────────────────────────────────────────────
  const [activeItemIndex, setActiveItemIndex] = useState(persistedLastItemIndex);
  const [sidebarOpen, setSidebarOpen] = useState(persistedSidebarOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [areaMappingOpen, setAreaMappingOpen] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [pdfOverrideFilename, setPdfOverrideFilename] = useState<string | null>(null);
  const [midiOpen, setMidiOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>(syncModeSetting);
  const initialLoadDone = useRef(false);
  /** Holds the latest annotation refetch function registered by PdfAnnotationToolbar */
  const annotationRefetchRef = useRef<(() => void) | null>(null);
  const handleRegisterRefetch = useCallback((fn: () => void) => {
    annotationRefetchRef.current = fn;
  }, []);

  // Persist sync mode changes
  const handleSetSyncMode = useCallback((mode: SyncMode) => {
    setSyncMode(mode);
    updateMusicianSetting('musicianSyncMode', mode);
  }, []);

  // ── Active item derivation ───────────────────────────────────────
  const showItems: ShowItem[] = currentShow?.order ?? [];

  // Clamp persisted item index to valid range when show items load
  useEffect(() => {
    if (showItems.length > 0 && activeItemIndex >= showItems.length) {
      const clamped = Math.max(0, showItems.length - 1);
      setActiveItemIndex(clamped);
      updateMusicianSetting('musicianLastItemIndex', clamped);
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
      updateMusicianSetting('musicianLastItemIndex', index);
    },
    [pdfViewer, updateMusicianSetting],
  );

  /** Manual navigation (prev/next buttons) — disables sync first */
  const handleManualNav = useCallback(
    (index: number) => {
      if (syncMode !== 'off') {
        setSyncMode('off');
        updateMusicianSetting('musicianSyncMode', 'off');
      }
      handleSelectItem(index);
    },
    [syncMode, updateMusicianSetting, handleSelectItem],
  );

  /** Handle MIDI actions for navigation */
  const handleMidiAction = useCallback(
    (action: MidiAction) => {
      switch (action) {
        case 'next_song':
          if (activeItemIndex < showItems.length - 1) handleManualNav(activeItemIndex + 1);
          break;
        case 'prev_song':
          if (activeItemIndex > 0) handleManualNav(activeItemIndex - 1);
          break;
        case 'next_page':
          if (pdfViewer.currentPage < pdfViewer.numPages) pdfViewer.setCurrentPage(pdfViewer.currentPage + 1);
          break;
        case 'prev_page':
          if (pdfViewer.currentPage > 1) pdfViewer.setCurrentPage(pdfViewer.currentPage - 1);
          break;
      }
    },
    [activeItemIndex, showItems.length, handleManualNav, pdfViewer],
  );

  // Always-on MIDI — MIDI is a local hardware input and should work regardless of
  // the network sync mode. The MidiLearnDialog has its own separate useMidi instance.
  useMidi({ onAction: handleMidiAction, enabled: true });

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      updateMusicianSetting('musicianSidebarOpen', next);
      return next;
    });
  }, [updateMusicianSetting]);

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

      {/* MIDI mapping dialog */}
      <MidiLearnDialog open={midiOpen} onClose={() => setMidiOpen(false)} onAction={handleMidiAction} />

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
            onOpenMidi={() => setMidiOpen(true)}
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
