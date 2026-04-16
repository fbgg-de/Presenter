import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { ISong } from '@/song';
import { Song } from '@/song';
import type { Show } from '@/api/shows.api';

// Lazy import to avoid circular dependency — songsApi injects into presenterApi
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
  songOrders: Record<number, string>; // per-song active order name
}

const loadSongs = (): Record<number, ISong> => {
  try {
    const raw = JSON.parse(localStorage.getItem('songs') ?? '{}');
    const songs: Record<number, ISong> = {};
    for (const [key, song] of Object.entries(raw)) {
      songs[parseInt(key)] = new Song(song as ISong);
    }
    return songs;
  } catch {
    return {};
  }
};

const loadSongsOrder = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem('order') ?? '[]');
  } catch {
    return [];
  }
};

const loadSongOrders = (): Record<number, string> => {
  try {
    return JSON.parse(localStorage.getItem('songOrders') ?? '{}');
  } catch {
    return {};
  }
};

const persistSongs = (songs: Record<number, ISong>, order: number[]) => {
  try {
    localStorage.setItem('songs', JSON.stringify(songs));
    localStorage.setItem('order', JSON.stringify(order));
  } catch {}
};

const persistSongOrders = (songOrders: Record<number, string>) => {
  try {
    localStorage.setItem('songOrders', JSON.stringify(songOrders));
  } catch {}
};

const initialState: SongsState = {
  songs: loadSongs(),
  songsOrder: loadSongsOrder(),
  songOrders: loadSongOrders(),
};

/**
 * Async thunk that fetches all songs referenced in a show via RTK Query,
 * adds them to the Redux store, and sets the song order + per-song order names.
 */
export const loadShowSongs = createAsyncThunk(
  'songs/loadShowSongs',
  async (show: Show, { dispatch }) => {
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
        const result = await dispatch(
          songsApi.endpoints.getSong.initiate({ songNumber }, { forceRefetch: false }),
        );
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
  },
);

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
