/**
 * Compact Spotify player docked at the bottom of the Set List dialog.
 *
 * Built on Spotify's iFrame API (the official embed), so no login or credentials are involved:
 * logged-out listeners hear 30-second previews, a browser logged in to Spotify plays full tracks.
 *
 * The embed itself runs in spotify-player.html, framed here: Spotify's API needs `eval`, and that
 * page is the only one whose CSP allows it. This component tells it which track to play; switching
 * covers reuses the same embed instead of reloading it. Mounted only once a cover is clicked.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, IconButton, Paper, Stack, Tooltip } from '@mui/material';
import { Close as CloseIcon, OpenInNew as OpenIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { spotifyTrackUrl } from '@/api/spotify.api';
import type { SetListSpotifyTrack } from '@/api/setLists.api';
import {
  SPOTIFY_PLAYER_HEIGHT,
  SPOTIFY_PLAYER_MESSAGE_SOURCE,
  isSpotifyPlayerMessage,
  spotifyPlayerTargetOrigin,
  type SpotifyPlayerCommand,
} from '@/utils/spotifyPlayerProtocol';

/** `/` on the web, `./` in the desktop bundle — next to the page that frames it either way. */
const PLAYER_PAGE_URL = `${import.meta.env.BASE_URL}spotify-player.html`;

interface SetListSpotifyPlayerProps {
  track: SetListSpotifyTrack;
  onClose: () => void;
}

export const SetListSpotifyPlayer = ({ track, onClose }: SetListSpotifyPlayerProps) => {
  const { LL } = useI18nContext();
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** The page listens once its script ran, which the iframe's load event guarantees. */
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const uri = `spotify:track:${track.trackId}`;

  useEffect(() => {
    if (!frameLoaded) return;
    const command: SpotifyPlayerCommand = { source: SPOTIFY_PLAYER_MESSAGE_SOURCE, type: 'load', uri };
    frameRef.current?.contentWindow?.postMessage(command, spotifyPlayerTargetOrigin());
  }, [frameLoaded, uri]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !isSpotifyPlayerMessage(event.data)) return;
      if (event.data.type === 'error') setFailed(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <Paper variant="outlined" sx={{ flexShrink: 0, p: 0.75, pt: 0.25 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
        <Tooltip title={LL.SET_LISTS.SPOTIFY_PLAYER_CLOSE()}>
          <IconButton size="small" onClick={onClose} aria-label={LL.SET_LISTS.SPOTIFY_PLAYER_CLOSE()}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={LL.SET_LISTS.SPOTIFY_OPEN()}>
          <IconButton size="small" component="a" href={spotifyTrackUrl(track.trackId)} target="_blank" rel="noopener noreferrer">
            <OpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {failed ? (
        <Alert severity="warning">{LL.SET_LISTS.SPOTIFY_PLAYER_ERROR()}</Alert>
      ) : (
        <iframe
          ref={frameRef}
          src={PLAYER_PAGE_URL}
          title={LL.SET_LISTS.SPOTIFY_TITLE()}
          onLoad={() => setFrameLoaded(true)}
          // Delegated on to Spotify's own iframe inside the page.
          allow="autoplay; encrypted-media; clipboard-write"
          style={{ display: 'block', width: '100%', height: SPOTIFY_PLAYER_HEIGHT, border: 0, borderRadius: 12, colorScheme: 'normal' }}
        />
      )}
    </Paper>
  );
};
