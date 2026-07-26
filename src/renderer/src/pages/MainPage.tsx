import { useEffect, useRef, useState } from 'react';
import {
  Stack,
  Box,
  useMediaQuery,
  useTheme,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Snackbar,
  Alert,
  Button,
} from '@mui/material';
import { ViewList as ShowListIcon, TouchApp as ControlIcon } from '@mui/icons-material';
import Footer from '@/components/layout/Footer';
import Sidebar, { type SidebarHandle } from '@/components/layout/Sidebar';
import Control from '@/components/show/Control';
import { RequireAuth } from '@/routes/RequireAuth';
import { Shows } from '@/components/show/Shows';
import type { Show, ShowItem } from '@/api/shows.api';
import { useSaveShowMutation } from '@/api/shows.api';
import { useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector, useGetShow } from '@/store/showSlice';
import { setSongsOrder as setSongsOrderAction, setSongOrders as setSongOrdersAction, loadShowSongs } from '@/store/songsSlice';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useWsCompanionCommands } from '@/hooks/useWsCompanionCommands';
import { useBroadcastCompanionState } from '@/hooks/useBroadcastCompanionState';
import PresentationSyncHost from '@/components/layout/PresentationSyncHost';
import { useMetrics } from '@/hooks/useMetrics';
import { useI18nContext } from '@/i18n/i18n-react';
import { useShowUpdatePoller } from '@/hooks/useShowUpdatePoller';
import { formatRelativeTime } from '@/utils/relativeTime';
import { DesktopAppBanner } from '@/components/settings/DesktopAppBanner';
import { useGetAccountSettingsQuery, useGetSessionQuery } from '@/api/session.api';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useGetMusicianSettings } from '@/store/musicianSlice';

export const MainPage = () => {
  const dispatch = useAppDispatch();
  const { LL, locale } = useI18nContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [mobileTab, setMobileTab] = useState(0); // 0 = show list / sidebar, 1 = control

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
  } = useShowUpdatePoller({ autoReload: followsRemote });

  // Gate all authenticated queries on confirmed session status.
  // MainPage hooks run immediately on mount — before <RequireAuth> has a chance
  // to block the children render — so we must guard them here explicitly.
  // useGetSessionQuery re-uses the cached result from RequireAuth (no extra request).
  const { offlineMode } = useGetSettings();
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

  // Keyboard navigation hook
  useKeyboardNavigation();
  useWsCompanionCommands();
  useBroadcastCompanionState();

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
      {!isShowSelectorOpen && (
        <Stack
          sx={{
            height: '100vh',
          }}
        >
          <DesktopAppBanner />
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
              </Stack>
              {/* Bottom navigation replacing the footer on mobile */}
              <Paper elevation={3} sx={{ borderTop: 1, borderColor: 'divider' }}>
                <BottomNavigation value={mobileTab} onChange={(_, v) => setMobileTab(v)} showLabels>
                  <BottomNavigationAction label={LL.SHOWS.TITLE()} icon={<ShowListIcon />} />
                  <BottomNavigationAction label={LL.CONTROL.TITLE()} icon={<ControlIcon />} />
                </BottomNavigation>
              </Paper>
            </>
          ) : (
            // ── Desktop layout ─────────────────────────────────────────────
            <>
              <Stack direction="row" sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0 }}>
                <Sidebar ref={sidebarRef} />
                <Control
                  onOpenSearch={() => sidebarRef.current?.openSearch()}
                  onOpenMediaBrowser={(subType) => sidebarRef.current?.openMediaBrowser(subType)}
                  onOpenBiblePicker={() => sidebarRef.current?.openBiblePicker()}
                />
              </Stack>
              <Footer />
            </>
          )}
        </Stack>
      )}
    </RequireAuth>
  );
};
