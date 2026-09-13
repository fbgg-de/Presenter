import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

/** A catalogue track as returned by /rest/SpotifyTracks. */
export type SpotifyTrack = {
  id: string;
  name: string;
  /** All performing artists, comma-separated. */
  artists: string;
  album: string | null;
  imageUrl: string | null;
  durationMs: number;
  url: string | null;
};

/**
 * `q` is a free-text search. `title` + `artist` asks for suggestions for a library song: the
 * backend tries title and first author together, then the title alone (authors are songwriters,
 * who often did not record the version people know).
 */
export type SpotifyTrackSearchArgs = { q: string } | { title: string; artist?: string };

const spotifyApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    searchSpotifyTracks: build.query<ApiSuccess<{ tracks: SpotifyTrack[] }>, SpotifyTrackSearchArgs>({
      query: (params) => ({ url: 'rest/SpotifyTracks', params }),
      // The catalogue barely changes; reopening the picker for the same song should not refetch.
      keepUnusedDataFor: 300,
    }),
  }),
  overrideExisting: false,
});

export const { useSearchSpotifyTracksQuery } = spotifyApi;

/** Web link to a track — derived from the id, so it never has to be stored. */
export const spotifyTrackUrl = (trackId: string) => `https://open.spotify.com/track/${trackId}`;

export { spotifyApi };
