import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Show, ShowGroup, ShowItem } from '@/api/shows.api';
import { DEFAULT_GROUP_ID, normalizeShowGroups } from '@/utils/showGroups';
import { useAppSelector } from './hooks';
import { persistState } from './persist';

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
    // Shows persisted before the groups feature (or coming from a backend without
    // groups support) have no `groups`. Normalize here — setCurrentShow is NOT
    // dispatched on reload, so without this the grouped list renders no items.
    if (initialState.currentShow) {
      const { order, groups } = normalizeShowGroups(initialState.currentShow.order ?? [], initialState.currentShow.groups);
      initialState.currentShow.order = order;
      initialState.currentShow.groups = groups;
    }
  }
} catch (e) {
  console.log('Failed to load show state from localStorage, using defaults', e);
}

export const showSlice = createSlice({
  name: 'show',
  initialState,
  reducers: {
    setCurrentShow: (state, action: PayloadAction<Show | null>) => {
      let show = action.payload;
      if (show) {
        // Ensure a consistent grouping (Default group, every item assigned, contiguous layout).
        // Copy instead of mutating: the payload may be a frozen object from the RTK Query cache.
        const { order, groups } = normalizeShowGroups(show.order ?? [], show.groups);
        show = { ...show, order, groups };
      }
      state.currentShow = show;
      state.serverSnapshot = show ? JSON.parse(JSON.stringify(show)) : null;
      state.isDirty = false;

      persistState(SHOW_STORAGE_KEY, state);
    },
    /** Replace the show's group metadata (rename/recolor/collapse/add/remove). */
    setShowGroups: (state, action: PayloadAction<ShowGroup[]>) => {
      if (state.currentShow) {
        state.currentShow.groups = action.payload;
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    /** Replace both the flat order and the group metadata atomically (move group / move item / delete group). */
    setOrderAndGroups: (state, action: PayloadAction<{ order: ShowItem[]; groups: ShowGroup[] }>) => {
      if (state.currentShow) {
        state.currentShow.order = action.payload.order;
        state.currentShow.groups = action.payload.groups;
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    updateShowOrder: (state, action: PayloadAction<ShowItem[]>) => {
      if (state.currentShow) {
        state.currentShow.order = action.payload;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    setShowSelectorOpen: (state, action: PayloadAction<boolean>) => {
      state.isShowSelectorOpen = action.payload;
      persistState(SHOW_STORAGE_KEY, state);
    },
    closeShowSelector: (state) => {
      state.isShowSelectorOpen = false;
      persistState(SHOW_STORAGE_KEY, state);
    },
    addShowItem: (state, action: PayloadAction<ShowItem>) => {
      if (state.currentShow) {
        const order = state.currentShow.order;
        const groups = state.currentShow.groups;
        const item = { ...action.payload };
        // Append to the last group's block (keeps groups contiguous) unless a group is given.
        if (!item.groupId) {
          item.groupId = order.length > 0 ? order[order.length - 1].groupId : (groups?.[groups.length - 1]?.id ?? DEFAULT_GROUP_ID);
        }
        order.push(item);
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    insertShowItem: (state, action: PayloadAction<{ index: number; item: ShowItem }>) => {
      if (state.currentShow) {
        const { index } = action.payload;
        const order = state.currentShow.order;
        const item = { ...action.payload.item };
        // Inherit the group of the preceding (or following) neighbor so it stays contiguous.
        if (!item.groupId) {
          item.groupId = (order[index - 1] ?? order[index])?.groupId ?? DEFAULT_GROUP_ID;
        }
        order.splice(index, 0, item);
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    removeShowItem: (state, action: PayloadAction<number>) => {
      if (state.currentShow) {
        state.currentShow.order.splice(action.payload, 1);
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
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
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    updateShowItem: (state, action: PayloadAction<{ index: number; item: Partial<ShowItem> }>) => {
      if (state.currentShow && state.currentShow.order[action.payload.index]) {
        state.currentShow.order[action.payload.index] = {
          ...state.currentShow.order[action.payload.index],
          ...action.payload.item,
        };
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    setDirty: (state, action: PayloadAction<boolean>) => {
      state.isDirty = action.payload;
      // When explicitly marking as clean (e.g. after save), sync the server snapshot
      if (!action.payload && state.currentShow) {
        state.serverSnapshot = JSON.parse(JSON.stringify(state.currentShow));
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
    setShowStyleId: (state, action: PayloadAction<number | undefined>) => {
      if (state.currentShow) {
        state.currentShow.styleId = action.payload;
        state.isDirty = true;
        persistState(SHOW_STORAGE_KEY, state);
      }
    },
  },
});

export const useGetShow = () => useAppSelector((state) => state.show);
export default showSlice.reducer;

export const {
  setCurrentShow,
  setShowGroups,
  setOrderAndGroups,
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
