import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Box, Stack, Typography, Button, CircularProgress, IconButton, Tooltip, Snackbar, Alert } from '@mui/material';
import {
  KeyboardArrowUp as PrevSongIcon,
  KeyboardArrowDown as NextSongIcon,
  KeyboardArrowLeft as PrevPageIcon,
  KeyboardArrowRight as NextPageIcon,
  SkipPrevious as PrevBlockIcon,
  SkipNext as NextBlockIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector, updateShowItem, setDirty, useGetShow } from '@/store/showSlice';
import { setSongsOrder, setSongOrders, setCurrentSongOrder, updateSongInStore, useGetSongs } from '@/store/songsSlice';
import { useGetMusicianSettings, useUpdateMusicianSetting } from '@/store/musicianSlice';
import { useGetSettings } from '@/store/settingsSlice';
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
import { RemoteControlDialog } from '@/components/midi/RemoteControlDialog';
import { useMidi, type MidiAction } from '@/hooks/useMidi';
import { useKeyboardRemote } from '@/hooks/useKeyboardRemote';
import { useRemoteActionFilter } from '@/hooks/useRemoteActionFilter';
import { loadShowSongs } from '@/store/songsSlice';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import { Song } from '@/song';
import type { Show, ShowItem } from '@/api/shows.api';
import {
  useGetPresentationSettings,
  setActiveItemIndex as setPresentationItemIndex,
  setActiveBlockIndex as setPresentationBlockIndex,
} from '@/store/presentationSlice';
import { useShowUpdatePoller } from '@/hooks/useShowUpdatePoller';
import { formatRelativeTime } from '@/utils/relativeTime';
import { useWsSync } from '@/hooks/useWsSync';
import { useWsOperator } from '@/hooks/useWsOperator';
import { useMetrics } from '@/hooks/useMetrics';
import { useGetSessionQuery } from '@/api/session.api';
import { useUpdateSongMutation } from '@/api/songs.api';
import { useSaveShowMutation, useGetShowQuery } from '@/api/shows.api';
import { SongOrderEditor } from '@/components/song/SongOrderEditor';
import { useLazySearchChurchToolsSongsQuery } from '@/api/churchtools.api';
import { presenterApi } from '@/api/base.api';

/**
 * Top-level page component for the Musician View.
 *
 * Orchestrates the sidebar, toolbar, settings drawer, PDF/lyrics content area,
 * and the show selector dialog. Rendered as the sole child of the musician
 * entry-point (musician.tsx).
 */
/** How often auto-refresh re-validates PDFs and annotations (they have no revision feed). */
const AUTO_REFRESH_INTERVAL_MS = 60_000;

export const MusicianPage = () => {
  const NAV_MARGIN = 36;

  const { palette } = useTheme();
  const { LL, locale } = useI18nContext();
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
    musicianAutoRefresh: autoRefresh,
    musicianRemoteDebounceMs: remoteDebounceMs,
  } = useGetMusicianSettings();
  const { currentShow, isShowSelectorOpen } = useGetShow();
  const { songs } = useGetSongs();

  // Operator's live position — read-only, never mutated by the musician
  const { activeItemIndex: operatorItemIndex, activeBlockIndex: operatorActiveBlockIndex } = useGetPresentationSettings();

  const updateMusicianSetting = useUpdateMusicianSetting();

  const dispatch = useAppDispatch();
  const { trackEvent } = useMetrics();

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
  const [orderEditorOpen, setOrderEditorOpen] = useState(false);
  const [orderEditorOrders, setOrderEditorOrders] = useState<Record<string, string[]>>({ Default: [] });
  const [orderEditorName, setOrderEditorName] = useState('Default');
  const [orderEditor, setOrderEditor] = useState<string[]>([]);
  const [orderEditorDirty, setOrderEditorDirty] = useState(false);
  const [orderEditorSaving, setOrderEditorSaving] = useState(false);

  // Fetch session to get the authenticated account number
  const { offlineMode } = useGetSettings();
  const { data: sessionData } = useGetSessionQuery(undefined, { skip: offlineMode });
  const churchToolsEnabled = sessionData?.settings?.churchToolsEnabled ?? false;
  const [updateSongMutation] = useUpdateSongMutation();
  const [saveShowMutation] = useSaveShowMutation();

  // ChurchTools: resolve CT song ID from the active song's CCLI number
  const [ctSongId, setCtSongId] = useState<number | null>(null);
  const [ctSongName, setCtSongName] = useState<string>('');
  const [searchCtSongs] = useLazySearchChurchToolsSongsQuery();

  // Derive wsUrl from global session ws_hosts
  const wsUrl = useMemo(() => {
    const h = sessionData?.settings?.wsHost;
    if (h?.host && h?.port) {
      const path = h.path && h.path !== '/' ? h.path : '';
      return `${h.wss ? 'wss' : 'ws'}://${h.host}:${h.port}${path}`;
    }
    return '';
  }, [sessionData?.settings?.wsHost]);

  // The account number to use for WS authentication
  const wsAccount = useMemo(() => {
    const acc = sessionData?.account;
    return typeof acc === 'number' ? acc : null;
  }, [sessionData?.account]);
  const [showUpdateAvailable, setShowUpdateAvailable] = useState(false);
  const [operatorWsShowTitle, setOperatorWsShowTitle] = useState<string | undefined>(undefined);
  const [dismissedMismatchShowTitle, setDismissedMismatchShowTitle] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  /** Holds the latest annotation refetch function registered by PdfAnnotationToolbar */
  const annotationRefetchRef = useRef<(() => void) | null>(null);

  // ── Show update polling ──────────────────────────────────────────────
  // In auto-refresh mode the poller applies foreign changes itself and never raises the banner.
  const {
    updateAvailable: showUpdateAvailable2,
    updatedAt: showUpdatedAt,
    reloadShow,
    dismiss: dismissShowUpdate,
  } = useShowUpdatePoller({ autoReload: autoRefresh });
  // Only fetch the operator's show (by title) when following it — not the whole show library.
  const { data: operatorShowData } = useGetShowQuery({ title: operatorWsShowTitle ?? '' }, { skip: !operatorWsShowTitle });
  // Keep the snackbar driven by the hook
  useEffect(() => {
    if (showUpdateAvailable2) setShowUpdateAvailable(true);
  }, [showUpdateAvailable2]);

  // ── WebSocket sync (browser + Electron) ─────────────────────────────
  // Active for 'operator' (follow operator item+block) and 'midi'
  // (MIDI input controls navigation, while WS keeps peers in sync).
  const handleSelectItemRef = useRef<((index: number) => void) | null>(null);
  // Holds the latest state received via WS so it can be re-applied after songs load.
  const pendingWsStateRef = useRef<{ activeItemIndex?: number; activeBlockIndex?: number } | null>(null);
  // Track operator's current song number from WS so we only apply block indicators when songs match.
  const [operatorWsSongNumber, setOperatorWsSongNumber] = useState<number | undefined>(undefined);
  // Ref to current musician's active item for use inside WS callback (avoids stale closure).
  const activeItemIndexRef = useRef(persistedLastItemIndex);
  const showItemsRef = useRef<ShowItem[]>([]);

  const wsEnabled = (syncMode === 'operator' || syncMode === 'midi') && !!wsUrl && wsAccount !== null;
  const { status: wsStatus } = useWsSync({
    url: wsUrl,
    account: wsAccount,
    enabled: wsEnabled,
    onStateUpdate: useCallback(
      (state) => {
        // Always persist the latest state so we can re-apply after songs load.
        pendingWsStateRef.current = {
          activeItemIndex: typeof state.activeItemIndex === 'number' ? state.activeItemIndex : undefined,
          activeBlockIndex: typeof state.activeBlockIndex === 'number' ? state.activeBlockIndex : undefined,
        };
        // Track which song the operator is currently on for song-matching guard.
        if (typeof state.songNumber === 'number') {
          setOperatorWsSongNumber(state.songNumber);
        }
        if (typeof state.showTitle === 'string') {
          setOperatorWsShowTitle(state.showTitle);
        }
        if (typeof state.activeItemIndex === 'number') {
          if (syncMode !== 'midi') {
            // In operator mode: follow the operator's song selection too.
            // Non-song items (media, bible) are NOT followed — the musician keeps
            // their current sheet while the operator shows announcement slides etc.
            const targetItem = showItemsRef.current[state.activeItemIndex];
            if (!targetItem || targetItem.type === 'song') {
              handleSelectItemRef.current?.(state.activeItemIndex);
            }
          }
          // Always keep the Redux operator index in sync so block indicators work.
          dispatch(setPresentationItemIndex(state.activeItemIndex));
        }
        if (typeof state.activeBlockIndex === 'number') {
          // Only update block index when the operator is on the same song — prevents
          // highlighting bleeding from a different song the operator is viewing.
          const currentItem = showItemsRef.current[activeItemIndexRef.current] as (ShowItem & { songNumber?: number }) | undefined;
          const matchesSong = typeof state.songNumber !== 'number' || state.songNumber === currentItem?.songNumber;
          if (matchesSong) {
            dispatch(setPresentationBlockIndex(state.activeBlockIndex));
          }
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [dispatch, syncMode],
    ),
  });

  // Musician-side WS operator for broadcasting MIDI actions in midi mode.
  // Only enabled when syncMode === 'midi' and WS is configured.
  const midiWsBroadcastEnabled = syncMode === 'midi' && !!wsUrl && wsAccount !== null;
  const { broadcast: midiWsBroadcast } = useWsOperator(midiWsBroadcastEnabled ? wsUrl : '', midiWsBroadcastEnabled ? wsAccount : null);
  const handleRegisterRefetch = useCallback((fn: () => void) => {
    annotationRefetchRef.current = fn;
  }, []);

  // ── Manual + automatic refresh of server-side content ────────────────
  /** Reload the PDF list/resolution and the annotations of the visible sheet. */
  const refreshPdfsAndAnnotations = useCallback(() => {
    dispatch(presenterApi.util.invalidateTags(['Pdfs', 'PdfAnnotations']));
    annotationRefetchRef.current?.();
  }, [dispatch]);

  /** "Update show, songs, orders, PDFs" — re-reads everything from the server. */
  const handleRefreshContent = useCallback(async () => {
    refreshPdfsAndAnnotations();
    await reloadShow({ forceSongs: true });
  }, [refreshPdfsAndAnnotations, reloadShow]);

  // Auto mode: show/song changes are adopted by the pollers, but PDFs and annotations
  // have no revision feed — so re-validate them on a timer while auto-refresh is on.
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(refreshPdfsAndAnnotations, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [autoRefresh, refreshPdfsAndAnnotations]);

  const handleToggleAutoRefresh = useCallback(() => {
    const next = !autoRefresh;
    updateMusicianSetting('musicianAutoRefresh', next);
    // Turning it on should feel immediate rather than waiting for the first poll.
    if (next) void handleRefreshContent();
  }, [autoRefresh, updateMusicianSetting, handleRefreshContent]);

  // Persist sync mode changes
  const handleSetSyncMode = useCallback((mode: SyncMode) => {
    setSyncMode(mode);
    updateMusicianSetting('musicianSyncMode', mode);
  }, []);

  // ── Active item derivation ───────────────────────────────────────
  const showItems: ShowItem[] = currentShow?.order ?? [];
  // Keep refs in sync for use inside WS callbacks (avoid stale closures)
  activeItemIndexRef.current = activeItemIndex;
  showItemsRef.current = showItems;

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

  useEffect(() => {
    if (!activeSong) {
      setOrderEditorOpen(false);
      setOrderEditorOrders({ Default: [] });
      setOrderEditorName('Default');
      setOrderEditor([]);
      setOrderEditorDirty(false);
      return;
    }
    const sourceOrders =
      activeSong.order && Object.keys(activeSong.order).length > 0
        ? activeSong.order
        : {
            Default: activeSong.initialOrder ?? [],
          };
    const selectedOrderName = sourceOrders[activeSongOrder] ? activeSongOrder : (Object.keys(sourceOrders)[0] ?? 'Default');
    setOrderEditorOrders(sourceOrders);
    setOrderEditorName(selectedOrderName);
    setOrderEditor(sourceOrders[selectedOrderName] ?? []);
    setOrderEditorDirty(false);
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

  // Unique block names for area mapping editor — use the ordered sequence (deduplicated)
  // so the dropdown reflects the current order, including custom-ordered blocks.
  const activeSongBlocks = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const block of lyricsBlocks) {
      if (!seen.has(block.name)) {
        seen.add(block.name);
        result.push(block.name);
      }
    }
    // Fallback: if no ordered blocks available, use all block keys
    if (result.length === 0 && activeSong) {
      return Object.keys(activeSong.blocks ?? {});
    }
    return result;
  }, [lyricsBlocks, activeSong]);

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

  // Active block area mapping for the visual indicator overlay in PdfView
  const activeBlockAreaMapping = useMemo(() => {
    if (!pdfViewer.areaMappings || operatorActiveBlockIndex == null || operatorActiveBlockIndex < 0) return undefined;
    const activeBlock = lyricsBlocks[operatorActiveBlockIndex];
    if (!activeBlock) return undefined;
    return pdfViewer.areaMappings.find((m) => m.blockName === activeBlock.name && m.region);
  }, [pdfViewer.areaMappings, operatorActiveBlockIndex, lyricsBlocks]);

  // Next block area mapping for the grey hint overlay.
  // If the immediately next block has the same name as the current one, show nothing.
  const nextBlockAreaMapping = useMemo(() => {
    if (!pdfViewer.areaMappings || operatorActiveBlockIndex == null) return undefined;
    const activeBlock = lyricsBlocks[operatorActiveBlockIndex];
    const nextBlock = lyricsBlocks[operatorActiveBlockIndex + 1];
    if (!nextBlock || nextBlock.name === activeBlock?.name) return undefined;
    return pdfViewer.areaMappings.find((m) => m.blockName === nextBlock.name && m.region);
  }, [pdfViewer.areaMappings, operatorActiveBlockIndex, lyricsBlocks]);

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

  // Re-apply pending WS state once songs have loaded.
  // This handles the case where get_state response arrives before songs are ready.
  const songsLoadedRef = useRef(false);
  const songCount = Object.keys(songs).length;
  useEffect(() => {
    if (songCount === 0) {
      songsLoadedRef.current = false;
      return;
    }
    if (songsLoadedRef.current) return; // already applied
    songsLoadedRef.current = true;
    const pending = pendingWsStateRef.current;
    if (!pending) return;
    if (typeof pending.activeItemIndex === 'number') {
      // Only follow to song items — see the WS onStateUpdate handler.
      const targetItem = showItemsRef.current[pending.activeItemIndex];
      if (!targetItem || targetItem.type === 'song') {
        handleSelectItemRef.current?.(pending.activeItemIndex);
      }
      dispatch(setPresentationItemIndex(pending.activeItemIndex));
    }
    if (typeof pending.activeBlockIndex === 'number') {
      dispatch(setPresentationBlockIndex(pending.activeBlockIndex));
    }
  }, [songCount, dispatch]);

  const handleShowSelected = useCallback(
    async (show: Show | null, isNew: boolean) => {
      if (!show) return;
      dispatch(setCurrentShow(show));
      setActiveItemIndex(0);
      updateMusicianSetting('musicianLastItemIndex', 0);
      dispatch(closeShowSelector());
      if (!isNew) {
        await dispatch(loadShowSongs(show));
      } else {
        dispatch(setSongsOrder([]));
        dispatch(setSongOrders({}));
      }
    },
    [dispatch, updateMusicianSetting],
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
  // Keep ref in sync so useWsSync onStateUpdate can call it without re-registering the hook
  handleSelectItemRef.current = handleSelectItem;

  // Refs updated each render so callbacks always see the latest values without re-registering
  const midiWsBroadcastRef = useRef(midiWsBroadcast);
  midiWsBroadcastRef.current = midiWsBroadcast;
  const lyricsBlocksRef = useRef(lyricsBlocks);
  lyricsBlocksRef.current = lyricsBlocks;
  const activeSongNumberRef = useRef(activeSongNumber);
  activeSongNumberRef.current = activeSongNumber;

  /** Broadcast musician sync via both WS relay (for browser peers) and IPC (for Electron operator window). */
  const broadcastMidiSync = useCallback((data: Record<string, unknown>) => {
    midiWsBroadcastRef.current('musician_sync', data);
    // Also send directly to operator via Electron IPC when running in the desktop app
    window.api?.musicianSyncToOperator?.({ action: 'musician_sync', data });
  }, []);

  /** User-initiated navigation (sidebar click, prev/next buttons) — disables sync first unless in midi mode */
  const handleUserSelectItem = useCallback(
    (index: number) => {
      if (syncMode === 'midi') {
        handleSelectItem(index);
        dispatch(setPresentationItemIndex(index));
        const newItem = showItemsRef.current[index] as (ShowItem & { songNumber?: number }) | undefined;
        broadcastMidiSync({
          activeItemIndex: index,
          activeBlockIndex: 0,
          activeLineIndex: 0,
          songNumber: newItem?.type === 'song' ? newItem.songNumber : undefined,
        });
      } else {
        if (syncMode !== 'off') {
          setSyncMode('off');
          updateMusicianSetting('musicianSyncMode', 'off');
        }
        handleSelectItem(index);
      }
    },
    [syncMode, updateMusicianSetting, handleSelectItem, dispatch, broadcastMidiSync],
  );

  /** Manual navigation (prev/next buttons) — disables sync first unless in midi mode */
  const handleManualNav = useCallback(
    (index: number) => {
      if (syncMode === 'midi') {
        handleSelectItem(index);
        dispatch(setPresentationItemIndex(index));
        const newItem = showItemsRef.current[index] as (ShowItem & { songNumber?: number }) | undefined;
        broadcastMidiSync({
          activeItemIndex: index,
          activeBlockIndex: 0,
          activeLineIndex: 0,
          songNumber: newItem?.type === 'song' ? newItem.songNumber : undefined,
        });
      } else {
        if (syncMode !== 'off') {
          setSyncMode('off');
          updateMusicianSetting('musicianSyncMode', 'off');
        }
        handleSelectItem(index);
      }
    },
    [syncMode, updateMusicianSetting, handleSelectItem, dispatch, broadcastMidiSync],
  );

  /** Handle MIDI actions for navigation */
  const handleMidiAction = useCallback(
    (action: MidiAction) => {
      switch (action) {
        case 'next_song': {
          const idx = activeItemIndexRef.current;
          if (idx < showItemsRef.current.length - 1) handleManualNav(idx + 1);
          break;
        }
        case 'prev_song': {
          const idx = activeItemIndexRef.current;
          if (idx > 0) handleManualNav(idx - 1);
          break;
        }
        case 'next_block':
          if (syncMode === 'midi') {
            const next = operatorActiveBlockIndex + 1;
            if (next < lyricsBlocksRef.current.length) {
              dispatch(setPresentationBlockIndex(next));
              broadcastMidiSync({
                activeItemIndex: activeItemIndexRef.current,
                activeBlockIndex: next,
                activeLineIndex: 0,
                songNumber: activeSongNumberRef.current,
              });
            }
          }
          break;
        case 'prev_block':
          if (syncMode === 'midi') {
            const prev = operatorActiveBlockIndex - 1;
            if (prev >= 0) {
              dispatch(setPresentationBlockIndex(prev));
              broadcastMidiSync({
                activeItemIndex: activeItemIndexRef.current,
                activeBlockIndex: prev,
                activeLineIndex: 0,
                songNumber: activeSongNumberRef.current,
              });
            }
          }
          break;
        case 'next_page':
          if (pdfViewer.currentPage < pdfViewer.numPages) pdfViewer.setCurrentPage(pdfViewer.currentPage + 1);
          break;
        case 'prev_page':
          if (pdfViewer.currentPage > 1) pdfViewer.setCurrentPage(pdfViewer.currentPage - 1);
          break;
      }
    },
    [handleManualNav, pdfViewer, syncMode, operatorActiveBlockIndex, dispatch, broadcastMidiSync],
  );

  /**
   * Called when the user taps a mapped-block rectangle in the PDF view (MIDI sync mode only).
   * Navigates to the first occurrence of the block name in the current song order.
   * If the block is not in the order it is silently ignored.
   */
  const handleMappingBlockClick = useCallback(
    (blockName: string) => {
      if (syncMode !== 'midi') return;
      const idx = lyricsBlocksRef.current.findIndex((b) => b.name === blockName);
      if (idx < 0) return; // block not in current order — no navigation
      dispatch(setPresentationBlockIndex(idx));
      broadcastMidiSync({
        activeItemIndex: activeItemIndexRef.current,
        activeBlockIndex: idx,
        activeLineIndex: 0,
        songNumber: activeSongNumberRef.current,
      });
    },
    [syncMode, dispatch, broadcastMidiSync],
  );

  const handleOrderTagSelect = useCallback(
    (_name: string, orderIndex: number) => {
      if (syncMode !== 'midi') return;
      if (orderIndex < 0 || orderIndex >= orderEditor.length) return;
      dispatch(setPresentationBlockIndex(orderIndex));
      broadcastMidiSync({
        activeItemIndex: activeItemIndexRef.current,
        activeBlockIndex: orderIndex,
        activeLineIndex: 0,
        songNumber: activeSongNumberRef.current,
      });
    },
    [syncMode, orderEditor.length, dispatch, broadcastMidiSync],
  );

  const handleSaveOrderEditor = useCallback(async () => {
    if (!activeSong || activeSongNumber == null || !currentShow) return;
    const trimmedName = orderEditorName.trim();
    if (!trimmedName || orderEditor.length === 0) return;

    const nextOrders = { ...orderEditorOrders, [trimmedName]: orderEditor };
    const updatedSong = new Song({
      ...activeSong,
      order: nextOrders,
      initialOrder: activeSong.initialOrder,
    });

    try {
      setOrderEditorSaving(true);
      await updateSongMutation({
        songNumber: updatedSong.songNumber,
        title: updatedSong.title,
        authors: updatedSong.authors,
        copyright: updatedSong.copyright,
        initialOrder: updatedSong.initialOrder || [],
        order: updatedSong.order,
        blocks: updatedSong.blocks,
      }).unwrap();

      dispatch(updateSongInStore(updatedSong));
      trackEvent('song_updated', 'song', String(updatedSong.songNumber), { via: 'order' });
      dispatch(setCurrentSongOrder({ songNumber: updatedSong.songNumber, orderName: trimmedName }));
      dispatch(updateShowItem({ index: activeItemIndex, item: { order: trimmedName } }));

      const nextShowOrder = showItems.map((showItem, idx) => (idx === activeItemIndex ? { ...showItem, order: trimmedName } : showItem));
      // Omit eventId so the backend preserves the existing ChurchTools event link.
      await saveShowMutation({
        title: currentShow.title,
        order: nextShowOrder,
        groups: currentShow.groups,
        styleId: currentShow.styleId ?? null,
      }).unwrap();
      dispatch(setDirty(false));
      setOrderEditorDirty(false);
    } finally {
      setOrderEditorSaving(false);
    }
  }, [
    activeSong,
    activeSongNumber,
    currentShow,
    orderEditorName,
    orderEditor,
    orderEditorOrders,
    updateSongMutation,
    dispatch,
    activeItemIndex,
    showItems,
    saveShowMutation,
  ]);

  /**
   * Hardware-remote entry point (MIDI + keyboard/footswitch). Same actions as the
   * on-screen buttons, but filtered so a bouncing footswitch can't double-trigger.
   * The on-screen buttons keep calling handleMidiAction directly — a deliberate
   * double tap there should not be swallowed.
   */
  const acceptRemoteAction = useRemoteActionFilter(remoteDebounceMs);
  const handleRemoteAction = useCallback(
    (action: MidiAction) => {
      if (!acceptRemoteAction(action)) return;
      handleMidiAction(action);
    },
    [acceptRemoteAction, handleMidiAction],
  );

  // Always-on MIDI — MIDI is a local hardware input and should work regardless of
  // the network sync mode. The RemoteControlDialog has its own separate useMidi instance.
  useMidi({ onAction: handleRemoteAction, enabled: true });

  // Always-on keyboard remote — window-level listener, so the page owns the SINGLE
  // instance and shares it with the RemoteControlDialog (a second one would double-fire).
  const keyboardRemote = useKeyboardRemote({ onAction: handleRemoteAction, enabled: true });

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
    // Reset CT context when song changes
    setCtSongId(null);
    setCtSongName('');
  }, [activeItemIndex]);

  // ── Sync: follow operator item selection ─────────────────────────
  useEffect(() => {
    if (syncMode === 'operator' && operatorItemIndex !== activeItemIndex) {
      // Non-song items are not followed — the musician keeps their current sheet
      // while the operator shows announcement slides / media items.
      const targetItem = showItems[operatorItemIndex];
      if (targetItem && targetItem.type !== 'song') return;
      handleSelectItem(operatorItemIndex);
    }
  }, [syncMode, operatorItemIndex]); // intentionally exclude handleSelectItem / activeItemIndex to avoid loops

  // isSynced: block indicators visible only when sync is on, blockIndicator is enabled,
  // and the operator is on the same song as the musician.
  const operatorSongMatchesMusician = useMemo(() => {
    if (syncMode === 'midi') {
      // Electron shared Redux: compare item indices — both musician and operator index same show
      return operatorItemIndex === activeItemIndex;
    }
    // WS modes: compare song numbers received via WS
    if (operatorWsSongNumber == null) return true; // no info yet, assume match
    return operatorWsSongNumber === activeSongNumber;
  }, [syncMode, operatorItemIndex, activeItemIndex, operatorWsSongNumber, activeSongNumber]);

  const isSynced = (syncMode === 'operator' || syncMode === 'midi') && blockIndicator && operatorSongMatchesMusician;

  const showMismatchDetected =
    !!operatorWsShowTitle &&
    !!currentShow?.title &&
    operatorWsShowTitle !== currentShow.title &&
    dismissedMismatchShowTitle !== operatorWsShowTitle;

  const applyOperatorShow = useCallback(async () => {
    if (!operatorWsShowTitle) return;
    const operatorShow = operatorShowData?.shows?.[0];
    if (!operatorShow || operatorShow.title !== operatorWsShowTitle) return;
    dispatch(setCurrentShow(operatorShow));
    await dispatch(loadShowSongs(operatorShow));
    setActiveItemIndex(0);
    updateMusicianSetting('musicianLastItemIndex', 0);
    setDismissedMismatchShowTitle(null);
  }, [operatorWsShowTitle, operatorShowData?.shows, dispatch, updateMusicianSetting]);

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
      {/* Show update notification */}
      <Snackbar open={showUpdateAvailable} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ top: { xs: 8, sm: 16 } }}>
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={async () => {
                setShowUpdateAvailable(false);
                await reloadShow();
              }}
            >
              {LL.SHOWS.UPDATE_AVAILABLE_ACTION()}
            </Button>
          }
          onClose={() => {
            setShowUpdateAvailable(false);
            dismissShowUpdate();
          }}
        >
          {LL.SHOWS.UPDATE_AVAILABLE()}
          {showUpdatedAt ? ` · ${LL.SHOWS.UPDATE_AVAILABLE_AT({ time: formatRelativeTime(showUpdatedAt, locale) })}` : ''}
        </Alert>
      </Snackbar>{' '}
      <Snackbar open={showMismatchDetected} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ top: { xs: 72, sm: 80 } }}>
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={() => setDismissedMismatchShowTitle(operatorWsShowTitle ?? null)}>
                {LL.CONNECTIVITY.SNACK_DISMISS()}
              </Button>
              <Button color="inherit" size="small" onClick={() => void applyOperatorShow()}>
                {LL.MUSICIAN.SELECT_SHOW()}
              </Button>
            </Stack>
          }
          onClose={() => setDismissedMismatchShowTitle(operatorWsShowTitle ?? null)}
        >
          {LL.MUSICIAN.SHOW_MISMATCH_WARNING({ operatorShow: operatorWsShowTitle ?? '', currentShow: currentShow?.title ?? '' })}
        </Alert>
      </Snackbar>
      {/* PDF Upload dialog — always available for song items */}
      {activeSongNumber != null && (
        <PdfUploadModal
          songNumber={activeSongNumber}
          open={pdfUploadOpen}
          onClose={() => setPdfUploadOpen(false)}
          musicianNames={musicianNames}
          selectedPdf={pdfOverrideFilename || pdfViewer.resolvedFilename}
          onSelectPdf={(f) => setPdfOverrideFilename(f)}
          onOpenAreaMapping={() => {
            trackEvent('musician_mapping_used', undefined, undefined, { type: 'area' });
            trackEvent('modal_opened', undefined, undefined, { modal: 'area_mapping' });
            setAreaMappingOpen(true);
          }}
          ctSongName={ctSongName}
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
      {/* Remote control (MIDI + keyboard) mapping dialog */}
      <RemoteControlDialog open={midiOpen} onClose={() => setMidiOpen(false)} onAction={handleRemoteAction} keyboard={keyboardRemote} />
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
        setQrOpen={(open) => {
          if (open) trackEvent('modal_opened', undefined, undefined, { modal: 'qr_share' });
          setQrOpen(open);
        }}
        setPdfUploadOpen={setPdfUploadOpen}
        onOpenMidiSettings={() => {
          trackEvent('modal_opened', undefined, undefined, { modal: 'midi_learn' });
          setMidiOpen(true);
        }}
      />
      {/* Main layout */}
      <Stack direction="row" sx={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <MusicianSidebar
          open={sidebarOpen}
          activeItemIndex={activeItemIndex}
          operatorActiveIndex={operatorItemIndex}
          onSelectItem={handleUserSelectItem}
          onOpenPdfModal={() => {
            trackEvent('modal_opened', undefined, undefined, { modal: 'pdf_manage' });
            // When CT is enabled, resolve the CT song ID from the active song title
            if (churchToolsEnabled && activeSong && !ctSongId) {
              void searchCtSongs({ q: activeSong.title, limit: 1 }).then((res) => {
                const first = res.data?.songs?.[0];
                if (first) {
                  setCtSongId(first.id);
                  setCtSongName(first.name);
                }
              });
            }
            setPdfUploadOpen(true);
          }}
          onClose={handleToggleSidebar}
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
            wsStatus={wsStatus}
            onOpenSettings={() => {
              trackEvent('modal_opened', undefined, undefined, { modal: 'musician_settings' });
              setSettingsOpen(true);
            }}
            onOpenPdfModal={() => {
              trackEvent('modal_opened', undefined, undefined, { modal: 'pdf_manage' });
              if (churchToolsEnabled && activeSong && !ctSongId) {
                void searchCtSongs({ q: activeSong.title, limit: 1 }).then((res) => {
                  const first = res.data?.songs?.[0];
                  if (first) {
                    setCtSongId(first.id);
                    setCtSongName(first.name);
                  }
                });
              }
              setPdfUploadOpen(true);
            }}
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
            onRefreshContent={() => void handleRefreshContent()}
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={handleToggleAutoRefresh}
            orderEditorOpen={orderEditorOpen}
            onToggleOrderEditor={() => setOrderEditorOpen((prev) => !prev)}
          />

          {/* Main content */}
          {!currentShow ? (
            <Stack
              sx={{
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                p: 4,
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                {LL.MUSICIAN.NO_SHOW()}
              </Typography>
              <Button variant="contained" onClick={() => dispatch(closeShowSelector())}>
                {LL.MUSICIAN.SELECT_SHOW()}
              </Button>
            </Stack>
          ) : !activeItem ? (
            <Stack
              sx={{
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                p: 4,
              }}
            >
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
              activeBlockAreaMapping={activeBlockAreaMapping}
              nextBlockAreaMapping={nextBlockAreaMapping}
              allBlockAreaMappings={pdfViewer.areaMappings}
              isSynced={isSynced}
              activeBlockIndex={operatorActiveBlockIndex}
              orderedBlockNames={lyricsBlocks.map((block) => block.name)}
              onMappingClick={syncMode === 'midi' && !annotateMode ? handleMappingBlockClick : undefined}
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
            <Stack
              sx={{
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                p: 4,
                opacity: 0.5,
              }}
            >
              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {activeItem.label || activeItem.bibleRef || 'Media'}
              </Typography>
            </Stack>
          )}

          {orderEditorOpen && isSongItem && activeSong && (
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `calc(${showFooter ? 64 : 16}px + env(safe-area-inset-bottom, 0px))`,
                zIndex: 12,
                // Narrow screens wrap the order into a single column, which makes this
                // overlay tall — keep it clear of the side margins and the nav buttons.
                px: { xs: 1, sm: `${NAV_MARGIN}px` },
                display: 'flex',
                justifyContent: 'center',
                // The wrapper spans the full width; only the editor itself may take clicks,
                // so the empty areas beside it never block the floating toolbar/nav buttons.
                pointerEvents: 'none',
              }}
            >
              <Stack sx={{ width: 'min(1100px, 100%)', pointerEvents: 'auto' }}>
                <SongOrderEditor
                  orders={orderEditorOrders}
                  currentOrder={orderEditorName}
                  order={orderEditor}
                  availableBlocks={Object.keys(activeSong.blocks ?? {})}
                  selectedBlockName={lyricsBlocks[operatorActiveBlockIndex]?.name}
                  onSelectBlock={handleOrderTagSelect}
                  showOrderControls={false}
                  centerChips
                  activeChipColor="secondary"
                  selectedOrderIndex={operatorActiveBlockIndex}
                  inactiveChipSx={{
                    bgcolor: 'grey.900',
                    color: '#fff',
                    '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.75)' },
                    '&:hover': { bgcolor: 'grey.800' },
                  }}
                  onChange={({ orders: nextOrders, currentOrder: nextCurrentOrder, order: nextOrder }) => {
                    setOrderEditorOrders(nextOrders);
                    setOrderEditorName(nextCurrentOrder);
                    setOrderEditor(nextOrder);
                    setOrderEditorDirty(true);
                  }}
                />
                <Stack direction="row" sx={{ justifyContent: 'center', gap: 1, mt: { xs: 0.5, sm: 1 } }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const sourceOrders =
                        activeSong.order && Object.keys(activeSong.order).length > 0
                          ? activeSong.order
                          : {
                              Default: activeSong.initialOrder ?? [],
                            };
                      const selectedOrderName = sourceOrders[activeSongOrder]
                        ? activeSongOrder
                        : (Object.keys(sourceOrders)[0] ?? 'Default');
                      setOrderEditorOrders(sourceOrders);
                      setOrderEditorName(selectedOrderName);
                      setOrderEditor(sourceOrders[selectedOrderName] ?? []);
                      setOrderEditorDirty(false);
                    }}
                    disabled={orderEditorSaving || !orderEditorDirty}
                  >
                    {LL.COMMON.CANCEL()}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => void handleSaveOrderEditor()}
                    disabled={orderEditorSaving || !orderEditorDirty}
                  >
                    {LL.COMMON.SAVE()}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}

          {/* Floating navigation buttons — bottom corners.
               Hidden when annotateMode is active so they don't intercept drawing events. */}
          {/* Left group: prev page + prev song [+ prev block in midi mode] */}
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
            {syncMode === 'midi' && (
              <Tooltip title={LL.MUSICIAN.PREV_BLOCK()} placement="top">
                <IconButton
                  onClick={() => handleMidiAction('prev_block')}
                  size="small"
                  sx={{
                    ...floatingBtnSx(palette),
                    opacity: operatorActiveBlockIndex > 0 ? 1 : 0.15,
                    pointerEvents: operatorActiveBlockIndex > 0 ? 'auto' : 'none',
                  }}
                >
                  <PrevBlockIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {/* Right group: [next block in midi mode +] next song + next page */}
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
            {syncMode === 'midi' && (
              <Tooltip title={LL.MUSICIAN.NEXT_BLOCK()} placement="top">
                <IconButton
                  onClick={() => handleMidiAction('next_block')}
                  size="small"
                  sx={{
                    ...floatingBtnSx(palette),
                    opacity: operatorActiveBlockIndex < lyricsBlocks.length - 1 ? 1 : 0.15,
                    pointerEvents: operatorActiveBlockIndex < lyricsBlocks.length - 1 ? 'auto' : 'none',
                  }}
                >
                  <NextBlockIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
