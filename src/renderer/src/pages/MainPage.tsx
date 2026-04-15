import { useEffect, useRef } from 'react';
import { Stack } from '@mui/material';
import Footer from '@/components/Footer';
import Sidebar from '@/components/Sidebar';
import Control from '@/components/Control';
import { RequireAuth } from '@/routes/RequireAuth';
import { Shows } from '@/components/Shows';
import type { Show, ShowItem } from '@/api/shows.api';
import { useSaveShowMutation } from '@/api/shows.api';
import { useAppSelector, useAppDispatch } from '@/store';
import { setCurrentShow, closeShowSelector } from '@/store/showSlice';
import { setSongsOrder as setSongsOrderAction, setSongOrders as setSongOrdersAction } from '@/store/songsSlice';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { usePresentationSync } from '@/hooks/usePresentationSync';
import { useMetrics } from '@/hooks/useMetrics';
import { fetchShowSongs } from '@/utils/fetchShowSongs';

export const MainPage = () => {
  const dispatch = useAppDispatch();
  const currentShow = useAppSelector((state) => state.show.currentShow);
  const isShowSelectorOpen = useAppSelector((state) => state.show.isShowSelectorOpen);
  const [saveShowMutation] = useSaveShowMutation();
  const { trackEvent } = useMetrics();
  const initialLoadDone = useRef(false);

  // Keyboard navigation hook
  useKeyboardNavigation();

  // Sync presentation state to open windows
  usePresentationSync();

  // On mount: if a show was restored from localStorage, load its songs
  useEffect(() => {
    if (!initialLoadDone.current && currentShow && !isShowSelectorOpen) {
      initialLoadDone.current = true;
      void fetchShowSongs(currentShow, dispatch);
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
        await fetchShowSongs(show, dispatch);
      } else if (!override) {
        dispatch(setSongsOrderAction([]));
        dispatch(setSongOrdersAction({}));
      }
    }
  };

  return (
    <RequireAuth>
      <Shows open={isShowSelectorOpen} onShowSelected={handleShowSelected} />
      {!isShowSelectorOpen && (
        <Stack height="100vh">
          <Stack direction="row" sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <Sidebar />
            <Control />
          </Stack>
          <Footer />
        </Stack>
      )}
    </RequireAuth>
  );
};
