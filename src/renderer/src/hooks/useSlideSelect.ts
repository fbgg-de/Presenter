import { useCallback } from 'react';
import { useStore } from 'react-redux';
import { useAppDispatch, type RootState } from '@/store';
import {
  setActiveBlockIndex,
  setActiveItemAndBlock,
  setActiveItemIndex,
  setBlack,
  setPreviewTarget,
  useGetPresentationSettings,
} from '@/store/presentationSlice';

/**
 * What a click on a slide or an agenda item does.
 *
 * Normally it goes live at once. With "preview before live" switched on in Live mode, the first
 * click only puts the slide into the preview panel; a second click on the same slide, or Enter,
 * sends it to the screens. Keyboard stepping always stays live, so a running service is never
 * slowed down by it.
 *
 * The actions read the live state when they run rather than subscribing to it: subscribed, every
 * caller (sidebar, layer bar, preview, slide grids) re-rendered on every slide change. Only
 * `previewTarget` is subscribed, for the callers that draw it.
 */
export function useSlideSelect() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { previewTarget } = useGetPresentationSettings('previewTarget');

  const goLive = useCallback(
    (itemIndex: number, blockIndex: number) => {
      const { presentation, settings } = store.getState();
      if (itemIndex !== presentation.activeItemIndex) {
        if (blockIndex === 0) dispatch(setActiveItemIndex(itemIndex));
        else dispatch(setActiveItemAndBlock({ itemIndex, blockIndex }));
        if (settings.resetBlackOnSwitch) dispatch(setBlack(false));
      } else {
        dispatch(setActiveBlockIndex(blockIndex));
      }
    },
    [store, dispatch],
  );

  const select = useCallback(
    (itemIndex: number, blockIndex: number) => {
      const { presentation, settings } = store.getState();
      const previewFirst = settings.operatorMode === 'live' && settings.operatorPreviewBeforeLive;
      const target = presentation.previewTarget;
      if (!previewFirst || (target && target.itemIndex === itemIndex && target.blockIndex === blockIndex)) {
        goLive(itemIndex, blockIndex);
        return;
      }
      dispatch(setPreviewTarget({ itemIndex, blockIndex }));
    },
    [store, goLive, dispatch],
  );

  /**
   * Send the previewed slide to the screens — else `blockIndex` (default the first) of the entry
   * opened in the agenda. Returns whether there was one.
   */
  const sendPreviewLive = useCallback(
    (blockIndex = 0) => {
      const { previewTarget: target, openItemIndex, activeItemIndex } = store.getState().presentation;
      if (target) goLive(target.itemIndex, target.blockIndex);
      else if (openItemIndex !== null && openItemIndex !== activeItemIndex) goLive(openItemIndex, blockIndex);
      else return false;
      return true;
    },
    [store, goLive],
  );

  return { select, sendPreviewLive, goLive, previewTarget };
}
