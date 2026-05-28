import { configureStore } from '@reduxjs/toolkit';
import { presenterApi } from '@/api/base.api';
import showReducer from './showSlice';
import settingsReducer from './settingsSlice';
import musicianReducer from './musicianSlice';
import windowReducer from './windowSlice';
import presentationReducer from './presentationSlice';
import songsReducer from './songsSlice';

export type { MusicianState } from './musicianSlice';
export type { PresentationState } from './presentationSlice';
export type { SettingsState } from './settingsSlice';
export type { ShowState } from './showSlice';
export type { SongsState } from './songsSlice';
export type { WindowState } from './windowSlice';

export { useAppDispatch, useAppSelector } from './hooks';

export const store = configureStore({
  reducer: {
    [presenterApi.reducerPath]: presenterApi.reducer,
    show: showReducer,
    settings: settingsReducer,
    musician: musicianReducer,
    window: windowReducer,
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
