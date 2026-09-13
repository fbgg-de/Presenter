/**
 * Spotify player page — runs inside an iframe of the Set List dialog.
 *
 * Spotify's iFrame API needs `eval`, which the app's own pages forbid. This page is the only one
 * whose CSP allows it, and it holds nothing but the embed: the dialog (SetListSpotifyPlayer) tells
 * it which track to play and hears back when the player failed to load. See spotifyPlayerProtocol.
 */
import { loadSpotifyIframeApi, type SpotifyEmbedController } from './utils/spotifyIframeApi';
import {
  SPOTIFY_PLAYER_HEIGHT,
  SPOTIFY_PLAYER_MESSAGE_SOURCE,
  SPOTIFY_TRACK_URI,
  isSpotifyPlayerMessage,
  spotifyPlayerTargetOrigin,
  type SpotifyPlayerCommand,
  type SpotifyPlayerEvent,
} from './utils/spotifyPlayerProtocol';

const host = document.getElementById('player') as HTMLElement;

let controller: SpotifyEmbedController | null = null;
let starting = false;
/** What the embed holds, so a repeated message for the same track never restarts it. */
let loadedUri: string | null = null;
/** The latest requested track — wins over the one the embed was started with. */
let requestedUri: string | null = null;

const post = (type: SpotifyPlayerEvent['type']) => {
  const message: SpotifyPlayerEvent = { source: SPOTIFY_PLAYER_MESSAGE_SOURCE, type };
  window.parent.postMessage(message, spotifyPlayerTargetOrigin());
};

const start = (uri: string) => {
  starting = true;
  // createController replaces the element it is handed.
  const target = document.createElement('div');
  host.replaceChildren(target);

  loadSpotifyIframeApi()
    .then((api) => {
      api.createController(target, { uri, width: '100%', height: SPOTIFY_PLAYER_HEIGHT }, (created) => {
        controller = created;
        starting = false;
        loadedUri = uri;
        // Picking a cover means "play this": start as soon as the embed can. Browsers that refuse
        // to autoplay leave it to the embed's own play button.
        created.addListener('ready', () => created.play());
        post('ready');
        if (requestedUri && requestedUri !== loadedUri) show(requestedUri);
      });
    })
    .catch(() => {
      starting = false;
      post('error');
    });
};

const show = (uri: string) => {
  requestedUri = uri;
  if (!controller) {
    if (!starting) start(uri);
    return;
  }
  if (uri === loadedUri) return;
  loadedUri = uri;
  controller.loadUri(uri);
  controller.play();
};

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || !isSpotifyPlayerMessage(event.data)) return;
  const command = event.data as SpotifyPlayerCommand;
  if (command.type === 'load' && SPOTIFY_TRACK_URI.test(command.uri)) show(command.uri);
});
