import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Show, ShowItem } from '@/api/shows.api';
import { useAppSelector } from './hooks';

const SHOW_STORAGE_KEY = 'presenter_show';

export interface ShowState {
  currentShow: Show | null;
  /** Snapshot of the show as it exists on the server — used for dirty detection */
  serverSnapshot: Show | null;
  isShowSelectorOpen: boolean;
  isDirty: boolean;
}

const defaultState: ShowState = {
  currentShow: null,
  serverSnapshot: null,
  isShowSelectorOpen: true,
  isDirty: true,
};

let initialState: ShowState = defaultState;
try {
  const settings = localStorage.getItem(SHOW_STORAGE_KEY);
  if (settings) {
    initialState = { ...defaultState, ...JSON.parse(settings) };
  }
} catch (e) {
  console.log('Failed to load show state from localStorage, using defaults', e);
}

export const showSlice = createSlice({
  name: 'show',
  initialState,
  reducers: {
    setCurrentShow: (state, action: PayloadAction<Show | null>) => {
      state.currentShow = action.payload;
      state.serverSnapshot = action.payload ? JSON.parse(JSON.stringify(action.payload)) : null;
      state.isDirty = false;

      localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
    },
    updateShowOrder: (state, action: PayloadAction<ShowItem[]>) => {
      if (state.currentShow) {
        state.currentShow.order = action.payload;
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
    setShowSelectorOpen: (state, action: PayloadAction<boolean>) => {
      state.isShowSelectorOpen = action.payload;
      localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
    },
    closeShowSelector: (state) => {
      state.isShowSelectorOpen = false;
      localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
    },
    addShowItem: (state, action: PayloadAction<ShowItem>) => {
      if (state.currentShow) {
        state.currentShow.order.push(action.payload);
        state.isDirty = true;
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
    insertShowItem: (state, action: PayloadAction<{ index: number; item: ShowItem }>) => {
      if (state.currentShow) {
        state.currentShow.order.splice(action.payload.index, 0, action.payload.item);
        state.isDirty = true;
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
    removeShowItem: (state, action: PayloadAction<number>) => {
      if (state.currentShow) {
        state.currentShow.order.splice(action.payload, 1);
        state.isDirty = true;
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
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
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
    updateShowItem: (state, action: PayloadAction<{ index: number; item: Partial<ShowItem> }>) => {
      if (state.currentShow && state.currentShow.order[action.payload.index]) {
        state.currentShow.order[action.payload.index] = {
          ...state.currentShow.order[action.payload.index],
          ...action.payload.item,
        };
        state.isDirty = true;
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
    setDirty: (state, action: PayloadAction<boolean>) => {
      state.isDirty = action.payload;
      // When explicitly marking as clean (e.g. after save), sync the server snapshot
      if (!action.payload && state.currentShow) {
        state.serverSnapshot = JSON.parse(JSON.stringify(state.currentShow));
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
    setShowStyleId: (state, action: PayloadAction<number | undefined>) => {
      if (state.currentShow) {
        state.currentShow.styleId = action.payload;
        state.isDirty = true;
        localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(state));
      }
    },
  },
});

export const useGetShow = () => useAppSelector((state) => state.show);
export default showSlice.reducer;

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
