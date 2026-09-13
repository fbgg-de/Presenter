import { useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { CueSource } from './CueMedia';
import { defaultFrame, type CuePacket, type MediaSource } from './types';
import { sendCueCommand, useCuePacket } from './runtime';
import { useMediaLabels } from './labels';

/** Hosted beside presentation sync, independent of editor panels and output windows. */
export function MainCueAudio() {
  const packet = useCuePacket();
  const source = packet?.cue.sources.find((s) => s.id === packet.cue.audioSourceId && s.type === 'video');
  if (!packet || !source || packet.cue.audioEnabled === false) return null;
  return <AudioPlayer key={packet.transport.session + '/' + source.id + '/' + source.path} packet={packet} source={source} />;
}
function AudioPlayer({ packet, source }: { packet: CuePacket; source: MediaSource }) {
  const [status, setStatus] = useState('ready');
  const l = useMediaLabels();
  return (
    <>
      <Box
        data-testid="main-cue-audio"
        sx={{ position: 'fixed', width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}
      >
        <CueSource source={source} packet={packet} frame={defaultFrame()} audible audioOnly onStatus={setStatus} />
      </Box>
      {(status === 'error' || status === 'playback') && (
        <Alert
          severity="warning"
          sx={{ position: 'fixed', bottom: 60, right: 16, zIndex: 1500 }}
          action={<Button onClick={() => sendCueCommand({ type: 'play' })}>{l('retry')}</Button>}
        >
          {l(status === 'playback' ? 'mainAudioBlocked' : 'error')}
        </Alert>
      )}
    </>
  );
}
