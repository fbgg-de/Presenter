import { configureStore } from '@reduxjs/toolkit';
import { presenterApi } from '@/api/base.api';
import showReducer from './showSlice';
import themeReducer from './themeSlice';
import settingsReducer from './settingsSlice';
import presentationReducer from './presentationSlice';
import songsReducer from './songsSlice';
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

export type { ThemeState } from './themeSlice';
export type { SettingsState } from './settingsSlice';
export type { PresentationState } from './presentationSlice';
export type { SongsState } from './songsSlice';
export type { ShowState } from './showSlice';

const storeConfig = {
  reducer: {
    [presenterApi.reducerPath]: presenterApi.reducer,
    show: showReducer,
    theme: themeReducer,
    settings: settingsReducer,
    presentation: presentationReducer,
    songs: songsReducer,
  },
  middleware: (getDefaultMiddleware: typeof configureStore.prototype.middleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: ['songs.songs'],
        ignoredActions: ['songs/setSongs', 'songs/addSongToStore', 'songs/updateSongInStore'],
      },
    }).concat(presenterApi.middleware),
};

export const store = configureStore(storeConfig);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
