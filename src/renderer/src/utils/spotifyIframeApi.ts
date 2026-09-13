/**
 * Loader for Spotify's iFrame API — the official embed player with a small control surface
 * (switch track, play, pause). No login or credentials: logged-out listeners hear previews.
 *
 * The script announces itself through a global callback rather than a module export, so it is
 * injected once and its API object cached behind a promise.
 *
 * Only for spotify-player.html. The API needs `eval` and scripts from embed-cdn.spotifycdn.com (the
 * loader on open.spotify.com only fetches the real code from there), which the app's own pages
 * forbid — and a blocked script fails silently: the ready callback just never comes.
 */

/** How long to wait for the ready callback before giving up (blocked CDN, offline). */
const READY_TIMEOUT_MS = 15000;

export type SpotifyEmbedController = {
  loadUri: (uri: string) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  destroy: () => void;
  addListener: (event: 'ready' | 'playback_update', callback: (event: unknown) => void) => void;
};

export type SpotifyIframeApi = {
  /** Replaces `element` with the embed iframe. */
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: number | string; height?: number | string },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
  }
}

const SCRIPT_URL = 'https://open.spotify.com/embed/iframe-api/v1';

let apiPromise: Promise<SpotifyIframeApi> | null = null;

export const loadSpotifyIframeApi = (): Promise<SpotifyIframeApi> => {
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        // Allow a later attempt (e.g. once the network is back) instead of caching the failure.
        window.clearTimeout(timeout);
        apiPromise = null;
        script.remove();
        reject(new Error('Spotify iFrame API could not be loaded'));
      };
      const timeout = window.setTimeout(fail, READY_TIMEOUT_MS);
      window.onSpotifyIframeApiReady = (api) => {
        window.clearTimeout(timeout);
        resolve(api);
      };
      script.src = SCRIPT_URL;
      script.async = true;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
};
