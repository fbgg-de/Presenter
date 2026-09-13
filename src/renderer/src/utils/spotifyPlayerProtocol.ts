/**
 * Messages between the Set List dialog and spotify-player.html, the isolated page that hosts the
 * Spotify embed (it needs `eval`, which the app's own pages forbid).
 *
 *   dialog → page: { type: 'load', uri: 'spotify:track:…' }
 *   page → dialog: { type: 'ready' } once the embed exists, { type: 'error' } when it cannot load
 *
 * Both sides only trust messages from the exact window they expect (parent / iframe), and every
 * message carries `source` so unrelated postMessage traffic is ignored.
 */

export const SPOTIFY_PLAYER_MESSAGE_SOURCE = 'presenter-spotify-player';

/** Spotify's compact embed: one line of cover, title and controls. */
export const SPOTIFY_PLAYER_HEIGHT = 80;

export const SPOTIFY_TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;

export type SpotifyPlayerCommand = { source: typeof SPOTIFY_PLAYER_MESSAGE_SOURCE; type: 'load'; uri: string };
export type SpotifyPlayerEvent = { source: typeof SPOTIFY_PLAYER_MESSAGE_SOURCE; type: 'ready' | 'error' };

export const isSpotifyPlayerMessage = (data: unknown): data is { source: typeof SPOTIFY_PLAYER_MESSAGE_SOURCE; type: string } =>
  typeof data === 'object' && data !== null && (data as { source?: unknown }).source === SPOTIFY_PLAYER_MESSAGE_SOURCE;

/** The desktop app loads its pages from file://, whose origin is opaque ("null") and cannot be targeted. */
export const spotifyPlayerTargetOrigin = (): string => (window.location.origin === 'null' ? '*' : window.location.origin);
