import { useEffect, useRef, useState } from 'react';
import { Stack, Box, BottomNavigation, BottomNavigationAction, Paper, Snackbar, Alert, Button } from '@mui/material';
import { ViewList as ShowListIcon, TouchApp as ControlIcon, Monitor as OutputIcon } from '@mui/icons-material';
import Footer from '@/components/layout/Footer';
import Sidebar, { type SidebarHandle } from '@/components/layout/Sidebar';
import Control from '@/components/show/Control';
import { OperatorTopBar } from '@/components/operator/OperatorTopBar';
import { ItemInspector } from '@/components/operator/ItemInspector';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { LayerBar } from '@/components/operator/LayerBar';
import { ColumnResizer } from '@/components/operator/ColumnResizer';
import { INSPECTOR_DEFAULT, INSPECTOR_RANGE, SET_LIST_DEFAULT, SET_LIST_RANGE, clampSize } from '@/components/operator/tileSize';
import { RequireAuth } from '@/routes/RequireAuth';
import { Shows } from '@/components/show/Shows';
import type { Show, ShowItem } from '@/api/shows.api';
import { useSaveShowMutation } from '@/api/shows.api';
import { useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector, useGetShow } from '@/store/showSlice';
import { setSongsOrder as setSongsOrderAction, setSongOrders as setSongOrdersAction, loadShowSongs } from '@/store/songsSlice';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import CompanionHost from '@/components/layout/CompanionHost';
import PresentationSyncHost from '@/components/layout/PresentationSyncHost';
import StageEngineHost from '@/components/layout/StageEngineHost';
import { useMetrics } from '@/hooks/useMetrics';
import { useI18nContext } from '@/i18n/i18n-react';
import { useShowUpdatePoller } from '@/hooks/useShowUpdatePoller';
import { useIsMobile } from '@/hooks/useIsMobile';
import { formatRelativeTime } from '@/utils/relativeTime';
import { DesktopAppBanner } from '@/components/settings/DesktopAppBanner';
import { useGetAccountSettingsQuery, useGetSessionQuery } from '@/api/session.api';
import { useNextcloudAccountCheck } from '@/nextcloud/useNextcloudAccountCheck';
import { useDefaultScreenGroups } from '@/hooks/useDefaultScreenGroups';
import { sidePanelState, sidePanelVisible } from '@/components/operator/sidePanel';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useGetMusicianSettings } from '@/store/musicianSlice';

/** The keyboard handler follows the live slide; as a leaf that re-renders nothing else (see CompanionHost). */
const KeyboardHost = () => {
  useKeyboardNavigation();
  return null;
};

export const MainPage = () => {
  const dispatch = useAppDispatch();
  const { LL, locale } = useI18nContext();
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState(0); // 0 = show list / sidebar, 1 = control, 2 = footer

  const { currentShow, isShowSelectorOpen } = useGetShow();
  const [saveShowMutation] = useSaveShowMutation();
  const { trackEvent } = useMetrics();
  const initialLoadDone = useRef(false);
  const sidebarRef = useRef<SidebarHandle>(null);

  // ── Show update polling ──────────────────────────────────────────────
  // While following remote commands the operator is driven from the musician pages, so
  // server-side edits are adopted automatically — nobody is at this screen to confirm them.
  const { midiTrackingMaster } = useGetMusicianSettings();
  const followsRemote = midiTrackingMaster === 'midi';
  const {
    updateAvailable: showUpdateAvailable,
    updatedAt: showUpdatedAt,
    reloadShow,
    dismiss: dismissShowUpdate,
    reloadFailed: showReloadFailed,
  } = useShowUpdatePoller({ autoReload: followsRemote });

  /**
   * A connected device sent a position we could not place, because it is holding a
   * different version of the show (`usePresentationSync` raises this rather than jumping
   * to a wrong item). Refusing silently would just look like a dead footswitch, so either
   * go and fetch the new version — we already auto-reload while following remote commands —
   * or tell the operator that somebody has to reload.
   *
   * This also closes the up-to-30s gap after an edit: the poller would find the change on
   * its own eventually, but the musicians are pressing buttons *now*.
   */
  const [syncMismatch, setSyncMismatch] = useState<{ songTitle?: string } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { songTitle?: string } | undefined;
      if (followsRemote) {
        void reloadShow();
        return;
      }
      setSyncMismatch({ songTitle: detail?.songTitle });
    };
    window.addEventListener('presenter:sync-show-mismatch', handler);
    return () => window.removeEventListener('presenter:sync-show-mismatch', handler);
  }, [followsRemote, reloadShow]);

  // Gate all authenticated queries on confirmed session status.
  // MainPage hooks run immediately on mount — before <RequireAuth> has a chance
  // to block the children render — so we must guard them here explicitly.
  // useGetSessionQuery re-uses the cached result from RequireAuth (no extra request).
  const settings = useGetSettings(
    'offlineMode',
    'operatorSetListOpen',
    'operatorSetListWidth',
    'operatorInspectorWidth',
    'operatorSidePanelOpen',
    'operatorInspectorOpen',
    'operatorPreviewOpen',
  );
  const { offlineMode, operatorSetListOpen, operatorSetListWidth, operatorInspectorWidth } = settings;
  // The side panel holds the preview on top and the inspector below; either can be off, and one
  // switch hides the whole panel.
  const sidePanel = sidePanelState(settings);
  const rightColumnOpen = sidePanelVisible(sidePanel);
  // Column widths while an edge is dragged; the settings are written once on release.
  const [draggedWidths, setDraggedWidths] = useState<{ setList?: number; inspector?: number }>({});
  const setListWidth = draggedWidths.setList ?? clampSize(operatorSetListWidth, SET_LIST_RANGE, SET_LIST_DEFAULT);
  const inspectorWidth = draggedWidths.inspector ?? clampSize(operatorInspectorWidth, INSPECTOR_RANGE, INSPECTOR_DEFAULT);
  // Top-bar elements the set list's toolbar is portalled into (desktop operator view).
  const [showsActionsSlot, setShowsActionsSlot] = useState<HTMLElement | null>(null);
  const [listActionsSlot, setListActionsSlot] = useState<HTMLElement | null>(null);
  const [saveActionSlot, setSaveActionSlot] = useState<HTMLElement | null>(null);
  const [appActionsSlot, setAppActionsSlot] = useState<HTMLElement | null>(null);
  const [devicesActionsSlot, setDevicesActionsSlot] = useState<HTMLElement | null>(null);
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const isAuthenticated = offlineMode || session?.isAuthenticated === true;

  // Sync server-side account settings (global style) into local Redux store.
  // Skipped in offline mode — globalStyleId persists in localStorage from the
  // last online session and is loaded into the Redux store on startup.
  const { data: accountSettings } = useGetAccountSettingsQuery(undefined, { skip: !isAuthenticated || offlineMode });
  const updateSetting = useUpdateSetting();
  useEffect(() => {
    if (accountSettings?.defaultStyleId !== undefined) {
      updateSetting('globalStyleId', accountSettings.defaultStyleId ?? 0);
    }
    if (accountSettings?.showTitleTemplate != null) {
      updateSetting('showSaveFormat', accountSettings.showTitleTemplate);
    }
  }, [accountSettings?.defaultStyleId, accountSettings?.showTitleTemplate]);

  // Web version: drop a Nextcloud connection that no longer fits the account.
  useNextcloudAccountCheck(offlineMode || !!window.api);
  // A brand-new account starts with a presentation and a stage group instead of an empty board.
  useDefaultScreenGroups();

  // On mount: if a show was restored from localStorage, load its songs.
  // Guard on isAuthenticated so the songs API is not called before the session
  // check completes (the show is persisted in localStorage, so currentShow is
  // truthy immediately — without this guard the effect fires unauthenticated).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!initialLoadDone.current && currentShow && !isShowSelectorOpen) {
      initialLoadDone.current = true;
      void dispatch(loadShowSongs(currentShow));
    }
  }, [currentShow, isShowSelectorOpen, isAuthenticated]);

  const handleShowSelected = async (show: Show | null, isNew: boolean, override?: boolean) => {
    if (show) {
      if (isNew || override) {
        try {
          const orderToSave: ShowItem[] = override ? (currentShow?.order ?? []) : [];

          await saveShowMutation({
            title: show.title,
            order: orderToSave,
            groups: override ? currentShow?.groups : show.groups,
            styleId: override ? (currentShow?.styleId ?? null) : (show.styleId ?? null),
            eventId: (override ? currentShow?.eventId : show.eventId) ?? null,
            eventName: (override ? currentShow?.eventName : show.eventName) ?? null,
          }).unwrap();
        } catch (error) {
          console.error('Failed to create new show:', error);
          return;
        }
      }

      dispatch(setCurrentShow(show));
      dispatch(closeShowSelector());
      trackEvent(isNew ? 'show_created' : 'show_loaded', 'show', show.title);

      if (!isNew && !override) {
        await dispatch(loadShowSongs(show));
      } else if (!override) {
        dispatch(setSongsOrderAction([]));
        dispatch(setSongOrdersAction({}));
      }

      // On mobile, after selecting a show, switch to control tab
      if (isMobile) setMobileTab(1);
    }
  };

  return (
    <RequireAuth>
      <Shows open={isShowSelectorOpen} onShowSelected={handleShowSelected} />
      <PresentationSyncHost />
      <StageEngineHost />
      <CompanionHost />
      <KeyboardHost />
      {/* Show update notification */}
      <Snackbar open={showUpdateAvailable} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => reloadShow()}>
              {LL.SHOWS.UPDATE_AVAILABLE_ACTION()}
            </Button>
          }
          onClose={dismissShowUpdate}
        >
          {LL.SHOWS.UPDATE_AVAILABLE()}
          {showUpdatedAt ? ` · ${LL.SHOWS.UPDATE_AVAILABLE_AT({ time: formatRelativeTime(showUpdatedAt, locale) })}` : ''}
        </Alert>
      </Snackbar>
      {/* A change was detected but could not be loaded (auto reload keeps retrying).
          Without this the operator drifts silently: remote pages keep sending indices
          that point into an order this app no longer has. */}
      <Snackbar open={showReloadFailed} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => reloadShow()}>
              {LL.SHOWS.UPDATE_AVAILABLE_ACTION()}
            </Button>
          }
        >
          {LL.SHOWS.UPDATE_FETCH_FAILED()}
        </Alert>
      </Snackbar>
      {/* A connected device is on another version of the show, so its indices were refused. */}
      <Snackbar open={!!syncMismatch} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setSyncMismatch(null);
                void reloadShow();
              }}
            >
              {LL.REMOTE.SYNC_RELOAD()}
            </Button>
          }
          onClose={() => setSyncMismatch(null)}
        >
          {syncMismatch?.songTitle
            ? LL.REMOTE.SYNC_STALE_OPERATOR({ song: syncMismatch.songTitle })
            : LL.REMOTE.SYNC_STALE_OPERATOR_NO_SONG()}
        </Alert>
      </Snackbar>
      {!isShowSelectorOpen && (
        <Stack
          sx={{
            height: '100vh',
          }}
        >
          {/* On desktop the download offer sits in the account menu instead of taking a row. */}
          {isMobile && <DesktopAppBanner />}
          {isMobile ? (
            // ── Mobile layout ──────────────────────────────────────────────
            <>
              <Stack sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0 }}>
                {/* Sidebar (show list) */}
                <Box sx={{ display: mobileTab === 0 ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <Sidebar ref={sidebarRef} />
                </Box>
                {/* Control (song/item control) */}
                <Box sx={{ display: mobileTab === 1 ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <Control
                    onOpenSearch={() => {
                      setMobileTab(0);
                      sidebarRef.current?.openSearch();
                    }}
                    onOpenMediaBrowser={(subType) => {
                      setMobileTab(0);
                      sidebarRef.current?.openMediaBrowser(subType);
                    }}
                    onOpenBiblePicker={() => {
                      setMobileTab(0);
                      sidebarRef.current?.openBiblePicker();
                    }}
                  />
                </Box>
                {/* The footer's controls — windows, black, connections — as their own tab.
                    They have no bar to live in here, and they are not optional: black-out and
                    the window list are what an operator reaches for mid-service. Kept mounted
                    like the other tabs so its window polling and warnings do not restart on
                    every visit. */}
                <Box sx={{ display: mobileTab === 2 ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <Footer variant="panel" />
                </Box>
              </Stack>
              {/* Bottom navigation replacing the footer on mobile */}
              <Paper elevation={3} sx={{ borderTop: 1, borderColor: 'divider' }}>
                <BottomNavigation value={mobileTab} onChange={(_, v) => setMobileTab(v)} showLabels>
                  <BottomNavigationAction label={LL.SHOWS.TITLE()} icon={<ShowListIcon />} />
                  <BottomNavigationAction label={LL.CONTROL.TITLE()} icon={<ControlIcon />} />
                  <BottomNavigationAction label={LL.FOOTER.TITLE()} icon={<OutputIcon />} />
                </BottomNavigation>
              </Paper>
            </>
          ) : (
            // ── Desktop layout ─────────────────────────────────────────────
            <>
              {/* Operator view: monitors, mode and the set list's toolbar on top, set list | slides | look
                  in the middle (both side columns can be hidden), everything that runs in the layer bar,
                  connections in the footer. */}
              <OperatorTopBar
                showsActionsRef={setShowsActionsSlot}
                listActionsRef={setListActionsSlot}
                saveActionRef={setSaveActionSlot}
                appActionsRef={setAppActionsSlot}
                devicesActionsRef={setDevicesActionsSlot}
              />
              <Stack direction="row" sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0 }}>
                <Sidebar
                  ref={sidebarRef}
                  toolbarSlots={{
                    app: appActionsSlot,
                    shows: showsActionsSlot,
                    lists: listActionsSlot,
                    save: saveActionSlot,
                    devices: devicesActionsSlot,
                  }}
                  collapsed={operatorSetListOpen === false}
                  width={setListWidth}
                />
                {operatorSetListOpen !== false && (
                  <ColumnResizer
                    width={setListWidth}
                    range={SET_LIST_RANGE}
                    direction={1}
                    label={LL.OPERATOR.RESIZE_COLUMN()}
                    onResize={(width) => setDraggedWidths((current) => ({ ...current, setList: width }))}
                    onCommit={(width) => {
                      updateSetting('operatorSetListWidth', width);
                      setDraggedWidths((current) => ({ ...current, setList: undefined }));
                    }}
                    onHide={() => updateSetting('operatorSetListOpen', false)}
                  />
                )}
                <Control
                  onOpenSearch={() => sidebarRef.current?.openSearch()}
                  onOpenMediaBrowser={(subType) => sidebarRef.current?.openMediaBrowser(subType)}
                  onOpenBiblePicker={() => sidebarRef.current?.openBiblePicker()}
                />
                {rightColumnOpen && (
                  <>
                    <ColumnResizer
                      width={inspectorWidth}
                      range={INSPECTOR_RANGE}
                      direction={-1}
                      label={LL.OPERATOR.RESIZE_COLUMN()}
                      onResize={(width) => setDraggedWidths((current) => ({ ...current, inspector: width }))}
                      onCommit={(width) => {
                        updateSetting('operatorInspectorWidth', width);
                        setDraggedWidths((current) => ({ ...current, inspector: undefined }));
                      }}
                      onHide={() => updateSetting('operatorSidePanelOpen', false)}
                    />
                    <Stack sx={{ width: inspectorWidth, flexShrink: 0, borderLeft: 1, borderColor: 'divider', minHeight: 0 }}>
                      {sidePanel.preview && <PreviewPanel />}
                      {sidePanel.inspector && <ItemInspector width="100%" />}
                    </Stack>
                  </>
                )}
              </Stack>
              {/* The layer bar's status line carries the footer's windows and connections. */}
              <LayerBar />
            </>
          )}
        </Stack>
      )}
    </RequireAuth>
  );
};
