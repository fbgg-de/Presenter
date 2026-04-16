import { configureStore } from '@reduxjs/toolkit';
import { presenterApi } from '@/api/base.api';
import showReducer from './showSlice';
import themeReducer from './themeSlice';
import settingsReducer from './settingsSlice';
import presentationReducer from './presentationSlice';
import songsReducer from './songsSlice';
import { useDispatch, useSelector } from 'react-redux';

export type { ThemeState } from './themeSlice';
export type { SettingsState } from './settingsSlice';
export type { PresentationState } from './presentationSlice';
export type { SongsState } from './songsSlice';
export type { ShowState } from './showSlice';

export const store = configureStore({
  reducer: {
    [presenterApi.reducerPath]: presenterApi.reducer,
    show: showReducer,
    theme: themeReducer,
    settings: settingsReducer,
    presentation: presentationReducer,
    songs: songsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: ['songs.songs'],
        ignoredActions: ['songs/setSongs', 'songs/addSongToStore', 'songs/updateSongInStore', 'songs/loadShowSongs/fulfilled'],
      },
    }).concat(presenterApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
