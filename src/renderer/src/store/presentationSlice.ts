import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { shallowEqual } from 'react-redux';
import { useAppSelector, useSliceFields } from './hooks';
import type { WsPeerInfo } from '@/hooks/useWsOperator';

export interface PresentationState {
  blockChangeOrigin: 'operator' | 'media';
  blockChangeRevision: number;
  activeItemIndex: number;
  activeBlockIndex: number;
  activeLineIndex: number;
  isBlack: boolean;
  isTextHidden: boolean;
  isIdentifying: boolean;
  frozenWindows: string[];
  keyboardDisabled: boolean;
  videoVisible: boolean;
  /** The media layer (image, video and slideshow content entries) shows; Hide in the layer bar turns it off. */
  mediaVisible: boolean;
  wsConnectedCount: number;
  /**
   * What the connected clients are (musician + sync mode, mobile remote, viewer), as
   * reported by the relay. May be shorter than `wsConnectedCount` when clients or the
   * relay predate the descriptor handshake — the remainder is of unknown kind.
   */
  wsPeers: WsPeerInfo[];
  wsMidiSyncAt: number;
  /** Whether the operator's own WS connection to the relay is established. */
  wsOperatorConnected: boolean;
  /**
   * A slide picked for the preview but not sent to the screens yet — only with "preview before
   * live" in Live mode. Anything going live clears it.
   */
  previewTarget: PreviewTarget | null;
  /**
   * The agenda entry open in the operator view when it is not the live one: a click in the agenda
   * opens an entry to look at or edit it without touching the screens. `null` follows the live
   * entry. Anything changing the live entry clears it, so the view follows the screens again.
   */
  openItemIndex: number | null;
}

export interface PreviewTarget {
  itemIndex: number;
  blockIndex: number;
}

const initialState: PresentationState = {
  blockChangeOrigin: 'operator',
  blockChangeRevision: 0,
  activeItemIndex: 0,
  activeBlockIndex: 0,
  activeLineIndex: 0,
  isBlack: false,
  isTextHidden: false,
  isIdentifying: false,
  frozenWindows: [],
  keyboardDisabled: false,
  videoVisible: true,
  mediaVisible: true,
  wsConnectedCount: 0,
  wsPeers: [],
  wsMidiSyncAt: 0,
  wsOperatorConnected: false,
  previewTarget: null,
  openItemIndex: null,
};

export const presentationSlice = createSlice({
  name: 'presentation',
  initialState,
  reducers: {
    setPreviewTarget: (state, action: PayloadAction<PreviewTarget | null>) => {
      state.previewTarget = action.payload;
    },
    setOpenItemIndex: (state, action: PayloadAction<number | null>) => {
      state.openItemIndex = action.payload === state.activeItemIndex ? null : action.payload;
    },
    setActiveBlockFromMedia: (state, action: PayloadAction<number>) => {
      state.blockChangeOrigin = 'media';
      state.activeBlockIndex = action.payload;
      state.activeLineIndex = 0;
    },
    setActiveItemIndex: (state, action: PayloadAction<number>) => {
      state.activeItemIndex = action.payload;
      state.openItemIndex = null;
      state.blockChangeOrigin = 'operator';
      state.blockChangeRevision += 1;
      state.previewTarget = null;
      state.activeBlockIndex = 0;
      state.activeLineIndex = 0;
    },
    setActiveBlockIndex: (state, action: PayloadAction<number>) => {
      state.blockChangeOrigin = 'operator';
      state.blockChangeRevision += 1;
      state.previewTarget = null;
      state.activeBlockIndex = action.payload;
      state.activeLineIndex = 0;
    },
    setActiveLineIndex: (state, action: PayloadAction<number>) => {
      state.activeLineIndex = action.payload;
    },
    nextItem: (state, action: PayloadAction<{ maxIndex: number }>) => {
      if (state.activeItemIndex < action.payload.maxIndex) {
        state.activeItemIndex += 1;
        state.openItemIndex = null;
        state.blockChangeOrigin = 'operator';
        state.blockChangeRevision += 1;
        state.previewTarget = null;
        state.activeBlockIndex = 0;
        state.activeLineIndex = 0;
      }
    },
    prevItem: (state) => {
      if (state.activeItemIndex > 0) {
        state.activeItemIndex -= 1;
        state.openItemIndex = null;
        state.blockChangeOrigin = 'operator';
        state.blockChangeRevision += 1;
        state.previewTarget = null;
        state.activeBlockIndex = 0;
        state.activeLineIndex = 0;
      }
    },
    nextBlock: (state, action: PayloadAction<{ maxIndex: number }>) => {
      if (state.activeBlockIndex < action.payload.maxIndex) {
        state.blockChangeOrigin = 'operator';
        state.blockChangeRevision += 1;
        state.previewTarget = null;
        state.activeBlockIndex += 1;
        state.activeLineIndex = 0;
      }
    },
    prevBlock: (state) => {
      if (state.activeBlockIndex > 0) {
        state.blockChangeOrigin = 'operator';
        state.blockChangeRevision += 1;
        state.previewTarget = null;
        state.activeBlockIndex -= 1;
        state.activeLineIndex = 0;
      }
    },
    nextLine: (state, action: PayloadAction<{ maxLineIndex: number; maxBlockIndex: number }>) => {
      if (state.activeLineIndex < action.payload.maxLineIndex) {
        state.activeLineIndex += 1;
      } else if (state.activeBlockIndex < action.payload.maxBlockIndex) {
        // Auto-advance to next block
        state.blockChangeOrigin = 'operator';
        state.blockChangeRevision += 1;
        state.previewTarget = null;
        state.activeBlockIndex += 1;
        state.activeLineIndex = 0;
      }
    },
    prevLine: (state, action: PayloadAction<{ prevBlockLastLineIndex: number }>) => {
      if (state.activeLineIndex > 0) {
        state.activeLineIndex -= 1;
      } else if (state.activeBlockIndex > 0) {
        state.blockChangeOrigin = 'operator';
        state.blockChangeRevision += 1;
        state.previewTarget = null;
        state.activeBlockIndex -= 1;
        state.activeLineIndex = action.payload.prevBlockLastLineIndex;
      }
    },
    toggleBlack: (state) => {
      state.isBlack = !state.isBlack;
    },
    setBlack: (state, action: PayloadAction<boolean>) => {
      state.isBlack = action.payload;
    },
    toggleTextHidden: (state) => {
      state.isTextHidden = !state.isTextHidden;
    },
    setTextHidden: (state, action: PayloadAction<boolean>) => {
      state.isTextHidden = action.payload;
    },
    toggleIdentify: (state) => {
      state.isIdentifying = !state.isIdentifying;
    },
    setIdentifying: (state, action: PayloadAction<boolean>) => {
      state.isIdentifying = action.payload;
    },
    freezeWindow: (state, action: PayloadAction<string>) => {
      if (!state.frozenWindows.includes(action.payload)) {
        state.frozenWindows.push(action.payload);
      }
    },
    unfreezeWindow: (state, action: PayloadAction<string>) => {
      state.frozenWindows = state.frozenWindows.filter((n) => n !== action.payload);
    },
    toggleFreezeWindow: (state, action: PayloadAction<string>) => {
      const idx = state.frozenWindows.indexOf(action.payload);
      if (idx >= 0) {
        state.frozenWindows.splice(idx, 1);
      } else {
        state.frozenWindows.push(action.payload);
      }
    },
    setKeyboardDisabled: (state, action: PayloadAction<boolean>) => {
      state.keyboardDisabled = action.payload;
    },
    setVideoVisible: (state, action: PayloadAction<boolean>) => {
      state.videoVisible = action.payload;
    },
    toggleVideoVisible: (state) => {
      state.videoVisible = !state.videoVisible;
    },
    setMediaVisible: (state, action: PayloadAction<boolean>) => {
      state.mediaVisible = action.payload;
    },
    setWsConnectedCount: (state, action: PayloadAction<number>) => {
      state.wsConnectedCount = action.payload;
    },
    setWsPeers: (state, action: PayloadAction<WsPeerInfo[]>) => {
      state.wsPeers = action.payload;
    },
    setWsMidiSyncAt: (state, action: PayloadAction<number>) => {
      state.wsMidiSyncAt = action.payload;
    },
    setWsOperatorConnected: (state, action: PayloadAction<boolean>) => {
      state.wsOperatorConnected = action.payload;
    },
    setActiveItemAndBlock: (state, action: PayloadAction<{ itemIndex: number; blockIndex: number }>) => {
      state.activeItemIndex = action.payload.itemIndex;
      state.openItemIndex = null;
      state.blockChangeOrigin = 'operator';
      state.blockChangeRevision += 1;
      state.previewTarget = null;
      state.activeBlockIndex = action.payload.blockIndex;
      state.activeLineIndex = 0;
    },
  },
});

export const {
  setPreviewTarget,
  setOpenItemIndex,
  setActiveBlockFromMedia,
  setActiveItemIndex,
  setActiveBlockIndex,
  setActiveLineIndex,
  nextItem,
  prevItem,
  nextBlock,
  prevBlock,
  nextLine,
  prevLine,
  toggleBlack,
  setBlack,
  toggleTextHidden,
  setTextHidden,
  toggleIdentify,
  setIdentifying,
  freezeWindow,
  unfreezeWindow,
  toggleFreezeWindow,
  setKeyboardDisabled,
  setVideoVisible,
  toggleVideoVisible,
  setMediaVisible,
  setWsConnectedCount,
  setWsPeers,
  setWsMidiSyncAt,
  setWsOperatorConnected,
  setActiveItemAndBlock,
} = presentationSlice.actions;

/** The named presentation fields (re-renders when one of them changes); no names = all of them. */
export function useGetPresentationSettings(): PresentationState;
export function useGetPresentationSettings<K extends keyof PresentationState>(...keys: K[]): Pick<PresentationState, K>;
export function useGetPresentationSettings(...keys: (keyof PresentationState)[]) {
  return useSliceFields('presentation', keys);
}

/**
 * The entry the operator view shows: the opened one, else the live one. `isLive` says whether it
 * is the one on screen. An opened index past the end of the agenda falls back to the live entry.
 */
export const useOpenItem = () =>
  useAppSelector((state) => {
    const { openItemIndex, activeItemIndex } = state.presentation;
    const count = state.show.currentShow?.order?.length ?? 0;
    const index = openItemIndex !== null && openItemIndex < count ? openItemIndex : activeItemIndex;
    return { index, isLive: index === activeItemIndex };
  }, shallowEqual);

export default presentationSlice.reducer;
