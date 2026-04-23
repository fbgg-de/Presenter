import { useEffect, useRef, useState } from 'react';
import { Stack, Box, useMediaQuery, useTheme, BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { ViewList as ShowListIcon, TouchApp as ControlIcon } from '@mui/icons-material';
import Footer from '@/components/layout/Footer';
import Sidebar from '@/components/layout/Sidebar';
import Control from '@/components/show/Control';
import { RequireAuth } from '@/routes/RequireAuth';
import { Shows } from '@/components/show/Shows';
import type { Show, ShowItem } from '@/api/shows.api';
import { useSaveShowMutation } from '@/api/shows.api';
import { useAppSelector, useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector } from '@/store/showSlice';
import { setSongsOrder as setSongsOrderAction, setSongOrders as setSongOrdersAction, loadShowSongs } from '@/store/songsSlice';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import PresentationSyncHost from '@/components/layout/PresentationSyncHost';
import { useMetrics } from '@/hooks/useMetrics';
import { useI18nContext } from '@/i18n/i18n-react';
import { DesktopAppBanner } from '@/components/settings/DesktopAppBanner';

export const MainPage = () => {
  const dispatch = useAppDispatch();
  const { LL } = useI18nContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [mobileTab, setMobileTab] = useState(0); // 0 = show list / sidebar, 1 = control

  const currentShow = useAppSelector((state) => state.show.currentShow);
  const isShowSelectorOpen = useAppSelector((state) => state.show.isShowSelectorOpen);
  const [saveShowMutation] = useSaveShowMutation();
  const { trackEvent } = useMetrics();
  const initialLoadDone = useRef(false);

  // Keyboard navigation hook
  useKeyboardNavigation();

  // On mount: if a show was restored from localStorage, load its songs
  useEffect(() => {
    if (!initialLoadDone.current && currentShow && !isShowSelectorOpen) {
      initialLoadDone.current = true;
      void dispatch(loadShowSongs(currentShow));
    }
  }, [currentShow, isShowSelectorOpen]);

  const handleShowSelected = async (show: Show | null, isNew: boolean, override?: boolean) => {
    if (show) {
      if (isNew || override) {
        try {
          const orderToSave: ShowItem[] = override ? (currentShow?.order ?? []) : [];

          await saveShowMutation({
            title: show.title,
            order: orderToSave,
            styleId: override ? (currentShow?.styleId ?? null) : (show.styleId ?? null),
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
      <DesktopAppBanner />
      {!isShowSelectorOpen && (
        <Stack height="100vh">
          {isMobile ? (
            // ── Mobile layout ──────────────────────────────────────────────
            <>
              <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
                {/* Sidebar (show list) */}
                <Box sx={{ display: mobileTab === 0 ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <Sidebar />
                </Box>
                {/* Control (song/item control) */}
                <Box sx={{ display: mobileTab === 1 ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <Control />
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
              <Stack direction="row" sx={{ flexGrow: 1, overflow: 'hidden' }}>
                <Sidebar />
                <Control />
              </Stack>
              <Footer />
            </>
          )}
        </Stack>
      )}
    </RequireAuth>
  );
};
