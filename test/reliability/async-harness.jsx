/** Isolated real React/Redux components for failure/race tests. Not a production entry point. */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import TypesafeI18n from '@/i18n/i18n-react';
import { loadLocale } from '@/i18n/i18n-util.sync';
import { store } from '@/store';
import { presenterApi } from '@/api/base.api';
import { songsApi } from '@/api/songs.api';
import { showsApi } from '@/api/shows.api';
import { useSongUpdatePoller } from '@/hooks/useSongUpdatePoller';
import { useShowUpdatePoller } from '@/hooks/useShowUpdatePoller';
import { useReadiness, ReadinessChip } from '@/components/operator/ReadinessChip';
import { SongEditor } from '@/components/song/SongEditor';
import { Song } from '@/song';
import { setCurrentShow, closeShowSelector } from '@/store/showSlice';
import { addSongToStore, loadShowSongs } from '@/store/songsSlice';
import { probeMediaUrl, invalidateMediaProbe } from '@/utils/mediaUrl';

loadLocale('en');
const api = {
  store,
  presenterApi,
  songsApi,
  showsApi,
  probeMediaUrl,
  invalidateMediaProbe,
  selectShow: (show) => {
    store.dispatch(setCurrentShow(show));
    store.dispatch(closeShowSelector());
  },
  addSong: (song) => store.dispatch(addSongToStore(new Song(song))),
  loadSongs: (show) => store.dispatch(loadShowSongs(show)),
};
window.harness = api;
function Pollers({ auto }) {
  const show = useShowUpdatePoller({ autoReload: auto });
  const song = useSongUpdatePoller({ autoReload: auto });
  useEffect(() => {
    api.show = show;
    api.song = song;
  });
  return <div>Pollers mounted</div>;
}
function Readiness({ generation }) {
  const checks = useReadiness(generation);
  useEffect(() => {
    api.checks = checks;
  });
  return <ReadinessChip />;
}
function App() {
  const [config, setConfig] = useState({ mode: 'idle' });
  useEffect(() => {
    api.render = setConfig;
    api.ready = true;
  }, []);
  return (
    <Provider store={store}>
      <TypesafeI18n locale="en">
        <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
          <CssBaseline />
          {config.mode === 'pollers' && <Pollers auto={config.auto} />}
          {config.mode === 'readiness' && <Readiness generation={config.generation ?? 0} />}
          {config.mode === 'editor' && (
            <SongEditor open={config.open} song={config.song} setOpen={(open) => setConfig((previous) => ({ ...previous, open }))} />
          )}
        </ThemeProvider>
      </TypesafeI18n>
    </Provider>
  );
}
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
