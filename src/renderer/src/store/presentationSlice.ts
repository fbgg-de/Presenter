import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface PresentationState {
  activeItemIndex: number;
  activeBlockIndex: number;
  activeLineIndex: number;
  isBlack: boolean;
  isIdentifying: boolean;
  frozenWindows: string[]; // window names that are frozen
  keyboardDisabled: boolean;
}

const initialState: PresentationState = {
  activeItemIndex: 0,
  activeBlockIndex: 0,
  activeLineIndex: 0,
  isBlack: false,
  isIdentifying: false,
  frozenWindows: [],
  keyboardDisabled: false,
};

export const presentationSlice = createSlice({
  name: 'presentation',
  initialState,
  reducers: {
    setActiveItemIndex: (state, action: PayloadAction<number>) => {
      state.activeItemIndex = action.payload;
      state.activeBlockIndex = 0;
      state.activeLineIndex = 0;
    },
    setActiveBlockIndex: (state, action: PayloadAction<number>) => {
      state.activeBlockIndex = action.payload;
      state.activeLineIndex = 0;
    },
    setActiveLineIndex: (state, action: PayloadAction<number>) => {
      state.activeLineIndex = action.payload;
    },
    nextItem: (state, action: PayloadAction<{ maxIndex: number }>) => {
      if (state.activeItemIndex < action.payload.maxIndex) {
        state.activeItemIndex += 1;
        state.activeBlockIndex = 0;
        state.activeLineIndex = 0;
      }
    },
    prevItem: (state) => {
      if (state.activeItemIndex > 0) {
        state.activeItemIndex -= 1;
        state.activeBlockIndex = 0;
        state.activeLineIndex = 0;
      }
    },
    nextBlock: (state, action: PayloadAction<{ maxIndex: number }>) => {
      if (state.activeBlockIndex < action.payload.maxIndex) {
        state.activeBlockIndex += 1;
        state.activeLineIndex = 0;
      }
    },
    prevBlock: (state) => {
      if (state.activeBlockIndex > 0) {
        state.activeBlockIndex -= 1;
        state.activeLineIndex = 0;
      }
    },
    nextLine: (state, action: PayloadAction<{ maxLineIndex: number; maxBlockIndex: number }>) => {
      if (state.activeLineIndex < action.payload.maxLineIndex) {
        state.activeLineIndex += 1;
      } else if (state.activeBlockIndex < action.payload.maxBlockIndex) {
        // Auto-advance to next block
        state.activeBlockIndex += 1;
        state.activeLineIndex = 0;
      }
    },
    prevLine: (state, action: PayloadAction<{ prevBlockLastLineIndex: number }>) => {
      if (state.activeLineIndex > 0) {
        state.activeLineIndex -= 1;
      } else if (state.activeBlockIndex > 0) {
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
  },
});

export const {
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
  toggleIdentify,
  setIdentifying,
  freezeWindow,
  unfreezeWindow,
  toggleFreezeWindow,
  setKeyboardDisabled,
} = presentationSlice.actions;

export default presentationSlice.reducer;
