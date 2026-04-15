import type { AppDispatch } from '@/store';
import type { Show } from '@/api/shows.api';
import { Song } from '@/song';
import { addSongToStore, setSongsOrder, setSongOrders } from '@/store/songsSlice';

/**
 * Fetch all songs referenced in a show from the API, add them to the Redux store,
 * and set the songs order + per-song order names.
 */
export async function fetchShowSongs(show: Show, dispatch: AppDispatch): Promise<void> {
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

  // Fetch unique song numbers from API
  const uniqueNumbers = [...new Set(songNumbers)];
  const fetchPromises = uniqueNumbers.map(async (num) => {
    try {
      const response = await fetch(`/rest/Song/${num}`);
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.songNumber) {
        const song = new Song({
          songNumber: data.songNumber,
          title: data.title,
          authors: data.authors,
          copyright: data.copyright,
          initialOrder: data.initialOrder,
          order: data.order,
          blocks: data.blocks,
          background: data.background,
          css: data.css,
        });
        dispatch(addSongToStore(song));
      }
    } catch (err) {
      console.error(`Failed to fetch song #${num}:`, err);
    }
  });

  await Promise.all(fetchPromises);

  dispatch(setSongsOrder(songNumbers));
  dispatch(setSongOrders(orderMap));
}
