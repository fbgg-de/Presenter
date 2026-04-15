import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Show, ShowItem } from '@/api/shows.api';

const SHOW_STORAGE_KEY = 'presenter_current_show';

// Try to restore the last selected show from localStorage
const loadPersistedShow = (): Show | null => {
  try {
    const stored = localStorage.getItem(SHOW_STORAGE_KEY);
    if (stored) {
      const show = JSON.parse(stored) as Show;
      if (show && show.title && Array.isArray(show.order)) {
        return show;
      }
    }
  } catch {
    // ignore
  }
  return null;
};

const persistShow = (show: Show | null) => {
  try {
    if (show) {
      localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(show));
    } else {
      localStorage.removeItem(SHOW_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
};

export interface ShowState {
  currentShow: Show | null;
  /** Snapshot of the show as it exists on the server — used for dirty detection */
  serverSnapshot: Show | null;
  isShowSelectorOpen: boolean;
  isDirty: boolean;
}

const restoredShow = loadPersistedShow();

const initialState: ShowState = {
  currentShow: restoredShow,
  serverSnapshot: restoredShow ? JSON.parse(JSON.stringify(restoredShow)) : null,
  isShowSelectorOpen: restoredShow === null,
  isDirty: false,
};

export const showSlice = createSlice({
  name: 'show',
  initialState,
  reducers: {
    setCurrentShow: (state, action: PayloadAction<Show | null>) => {
      state.currentShow = action.payload;
      state.serverSnapshot = action.payload ? JSON.parse(JSON.stringify(action.payload)) : null;
      state.isDirty = false;
      persistShow(action.payload);
    },
    updateShowOrder: (state, action: PayloadAction<ShowItem[]>) => {
      if (state.currentShow) {
        state.currentShow.order = action.payload;
      }
    },
    setShowSelectorOpen: (state, action: PayloadAction<boolean>) => {
      state.isShowSelectorOpen = action.payload;
    },
    closeShowSelector: (state) => {
      state.isShowSelectorOpen = false;
    },
    addShowItem: (state, action: PayloadAction<ShowItem>) => {
      if (state.currentShow) {
        state.currentShow.order.push(action.payload);
        state.isDirty = true;
        persistShow(state.currentShow);
      }
    },
    insertShowItem: (state, action: PayloadAction<{ index: number; item: ShowItem }>) => {
      if (state.currentShow) {
        state.currentShow.order.splice(action.payload.index, 0, action.payload.item);
        state.isDirty = true;
        persistShow(state.currentShow);
      }
    },
    removeShowItem: (state, action: PayloadAction<number>) => {
      if (state.currentShow) {
        state.currentShow.order.splice(action.payload, 1);
        state.isDirty = true;
        persistShow(state.currentShow);
      }
    },
    reorderShowItems: (state, action: PayloadAction<{ source: number; destination: number }>) => {
      if (state.currentShow) {
        const { source, destination } = action.payload;
        const items = [...state.currentShow.order];
        const [removed] = items.splice(source, 1);
        items.splice(destination, 0, removed);
        state.currentShow.order = items;
        state.isDirty = true;
        persistShow(state.currentShow);
      }
    },
    updateShowItem: (state, action: PayloadAction<{ index: number; item: Partial<ShowItem> }>) => {
      if (state.currentShow && state.currentShow.order[action.payload.index]) {
        state.currentShow.order[action.payload.index] = {
          ...state.currentShow.order[action.payload.index],
          ...action.payload.item,
        };
        state.isDirty = true;
        persistShow(state.currentShow);
      }
    },
    setDirty: (state, action: PayloadAction<boolean>) => {
      state.isDirty = action.payload;
      // When explicitly marking as clean (e.g. after save), sync the server snapshot
      if (!action.payload && state.currentShow) {
        state.serverSnapshot = JSON.parse(JSON.stringify(state.currentShow));
      }
    },
    setShowStyleId: (state, action: PayloadAction<number | undefined>) => {
      if (state.currentShow) {
        state.currentShow.styleId = action.payload;
        state.isDirty = true;
      }
    },
  },
});

export const {
  setCurrentShow,
  updateShowOrder,
  setShowSelectorOpen,
  closeShowSelector,
  addShowItem,
  insertShowItem,
  removeShowItem,
  reorderShowItems,
  updateShowItem,
  setDirty,
  setShowStyleId,
} = showSlice.actions;

/**
 * Selector that derives dirty state by comparing the current show order
 * with the server snapshot. Falls back to the manual `isDirty` flag
 * when no server snapshot is available.
 */
export const selectIsDirty = (state: { show: ShowState }): boolean => {
  const { currentShow, serverSnapshot, isDirty } = state.show;
  if (!currentShow) return false;
  if (!serverSnapshot) return isDirty;
  return (
    isDirty || JSON.stringify(currentShow.order) !== JSON.stringify(serverSnapshot.order) || currentShow.styleId !== serverSnapshot.styleId
  );
};

export default showSlice.reducer;
