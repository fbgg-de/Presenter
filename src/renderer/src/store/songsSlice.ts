import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { ISong } from '@/song';
import { Song } from '@/song';
import type { Show } from '@/api/shows.api';
import { useAppSelector } from './hooks';

// Lazy import to avoid circular dependency
let _songsApi: typeof import('@/api/songs.api').songsApi | null = null;
const getSongsApi = async () => {
  if (!_songsApi) {
    const mod = await import('@/api/songs.api');
    _songsApi = mod.songsApi;
  }
  return _songsApi;
};

export interface SongsState {
  songs: Record<number, ISong>;
  songsOrder: number[];
  songOrders: Record<number, string>;
}

// ── Storage key ──────────────────────────────────────────────────────────────
const CACHE_KEY = 'presenter_cache';

interface CacheData {
  songs?: Record<number, unknown>;
  order?: number[];
  songOrders?: Record<number, string>;
  styles?: object[];
}

function loadCache(): CacheData {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v) return JSON.parse(v) as CacheData;
    // Migration: read old individual keys
    const migrated: CacheData = {};
    const oldSongs = localStorage.getItem('songs');
    if (oldSongs) migrated.songs = JSON.parse(oldSongs);
    const oldOrder = localStorage.getItem('order');
    if (oldOrder) migrated.order = JSON.parse(oldOrder);
    const oldSongOrders = localStorage.getItem('songOrders');
    if (oldSongOrders) migrated.songOrders = JSON.parse(oldSongOrders);
    const oldStyles = localStorage.getItem('presenter_cached_styles');
    if (oldStyles) migrated.styles = JSON.parse(oldStyles);
    if (Object.keys(migrated).length > 0) {
      // Persist migrated data to new key and clean up old keys
      localStorage.setItem(CACHE_KEY, JSON.stringify(migrated));
      localStorage.removeItem('songs');
      localStorage.removeItem('order');
      localStorage.removeItem('songOrders');
      localStorage.removeItem('presenter_cached_styles');
    }
    return migrated;
  } catch {
    return {};
  }
}

function saveCache(patch: Partial<CacheData>): void {
  try {
    const current = loadCache();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {}
}

const loadSongs = (): Record<number, ISong> => {
  try {
    const raw = loadCache().songs ?? {};
    const songs: Record<number, ISong> = {};
    for (const [key, song] of Object.entries(raw)) {
      songs[parseInt(key)] = new Song(song as ISong);
    }
    return songs;
  } catch {
    return {};
  }
};

const loadSongsOrder = (): number[] => loadCache().order ?? [];
const loadSongOrders = (): Record<number, string> => loadCache().songOrders ?? {};

const persistSongs = (songs: Record<number, ISong>, order: number[]) => {
  saveCache({ songs: songs as Record<number, unknown>, order });
};

const persistSongOrders = (songOrders: Record<number, string>) => {
  saveCache({ songOrders });
};

const initialState: SongsState = {
  songs: loadSongs(),
  songsOrder: loadSongsOrder(),
  songOrders: loadSongOrders(),
};

// ── Helpers exported for settingsSlice (cachedStyles) ────────────────────────
export const loadCachedStyles = (): object[] => loadCache().styles ?? [];
export const saveCachedStyles = (styles: object[]): void => saveCache({ styles });

/**
 * Async thunk that fetches all songs referenced in a show via RTK Query,
 * adds them to the Redux store, and sets the song order + per-song order names.
 */
export const loadShowSongs = createAsyncThunk('songs/loadShowSongs', async (show: Show, { dispatch }) => {
  if (!show.order || show.order.length === 0) {
    dispatch(setSongsOrder([]));
    dispatch(setSongOrders({}));
    return;
  }

  const songNumbers: number[] = [];
  const orderMap: Record<number, string> = {};

  for (const item of show.order) {
    if (item.type === 'song' && item.songNumber != null) {
      songNumbers.push(item.songNumber);
      if (item.order) {
        orderMap[item.songNumber] = item.order;
      }
    }
  }

  const songsApi = await getSongsApi();
  const uniqueNumbers = [...new Set(songNumbers)];
  const fetchPromises = uniqueNumbers.map(async (songNumber) => {
    try {
      const result = await dispatch(songsApi.endpoints.getSong.initiate({ songNumber }, { forceRefetch: false }));
      const data = 'data' in result ? (result as { data?: ISong }).data : undefined;
      if (data && data.songNumber) {
        dispatch(addSongToStore(new Song(data)));
      }
    } catch (err) {
      console.error(`Failed to fetch song #${songNumber}:`, err);
    }
  });

  await Promise.all(fetchPromises);

  dispatch(setSongsOrder(songNumbers));
  dispatch(setSongOrders(orderMap));
});

export const songsSlice = createSlice({
  name: 'songs',
  initialState,
  reducers: {
    setSongs: (state, action: PayloadAction<Record<number, ISong>>) => {
      state.songs = action.payload;
      persistSongs(state.songs, state.songsOrder);
    },
    addSongToStore: (state, action: PayloadAction<ISong>) => {
      const song = action.payload;
      state.songs[song.songNumber] = song;
      persistSongs(state.songs, state.songsOrder);
    },
    updateSongInStore: (state, action: PayloadAction<ISong>) => {
      const song = action.payload;
      state.songs[song.songNumber] = song;
      persistSongs(state.songs, state.songsOrder);
    },
    removeSongFromStore: (state, action: PayloadAction<number>) => {
      delete state.songs[action.payload];
      persistSongs(state.songs, state.songsOrder);
    },
    setSongsOrder: (state, action: PayloadAction<number[]>) => {
      state.songsOrder = action.payload;
      persistSongs(state.songs, state.songsOrder);
    },
    addToSongsOrder: (state, action: PayloadAction<number | number[]>) => {
      const nums = Array.isArray(action.payload) ? action.payload : [action.payload];
      state.songsOrder = [...state.songsOrder, ...nums];
      persistSongs(state.songs, state.songsOrder);
    },
    removeFromSongsOrder: (state, action: PayloadAction<number>) => {
      // Remove by index
      state.songsOrder.splice(action.payload, 1);
      persistSongs(state.songs, state.songsOrder);
    },
    reorderSongs: (state, action: PayloadAction<{ source: number; destination: number }>) => {
      const { source, destination } = action.payload;
      const items = [...state.songsOrder];
      const [removed] = items.splice(source, 1);
      items.splice(destination, 0, removed);
      state.songsOrder = items;
      persistSongs(state.songs, state.songsOrder);
    },
    setSongOrders: (state, action: PayloadAction<Record<number, string>>) => {
      state.songOrders = action.payload;
      persistSongOrders(state.songOrders);
    },
    setCurrentSongOrder: (state, action: PayloadAction<{ songNumber: number; orderName: string }>) => {
      state.songOrders[action.payload.songNumber] = action.payload.orderName;
      persistSongOrders(state.songOrders);
    },
    clearShowData: (state) => {
      state.songsOrder = [];
      state.songOrders = {};
      persistSongs(state.songs, state.songsOrder);
      persistSongOrders(state.songOrders);
    },
  },
});

// Selectors
export const selectSong = (state: { songs: SongsState }, songNumber: number): ISong | undefined => state.songs.songs[songNumber];

export const selectCurrentSongOrder = (state: { songs: SongsState }, songNumber: number): string => {
  const song = state.songs.songs[songNumber];
  if (!song) return 'Default';

  const storedOrder = state.songs.songOrders[songNumber];
  if (storedOrder && song.order[storedOrder]) return storedOrder;

  const available = Object.keys(song.order);
  return available.length > 0 ? available[0] : 'Default';
};

export const useGetSongs = () => useAppSelector((state) => state.songs);

export const {
  setSongs,
  addSongToStore,
  updateSongInStore,
  removeSongFromStore,
  setSongsOrder,
  addToSongsOrder,
  removeFromSongsOrder,
  reorderSongs,
  setSongOrders,
  setCurrentSongOrder,
  clearShowData,
} = songsSlice.actions;

export default songsSlice.reducer;
