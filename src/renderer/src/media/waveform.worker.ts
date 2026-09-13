import { ALL_FORMATS, AudioSampleSink, CustomSource, Input } from 'mediabunny';
import type { WaveformData } from './useWaveform';

self.onmessage = async ({ data: url }: MessageEvent<string>) => {
  const controller = new AbortController();
  let fullFile: Uint8Array | undefined;
  let input: Input | undefined;
  let reason: WaveformData['reason'] = 'read';
  let finished = false;
  const failed = () => {
    if (finished) return;
    finished = true;
    self.postMessage({ peaks: [], duration: 0, state: 'unavailable', progress: 0, reason } satisfies WaveformData);
    controller.abort();
  };
  const request = (init: RequestInit) => fetch(url, { ...init, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
  try {
    input = new Input({
      formats: ALL_FORMATS,
      source: new CustomSource({
        maxCacheSize: 8 * 1024 * 1024,
        prefetchProfile: 'fileSystem',
        handleUnhandledError: failed,
        getSize: async () => {
          // Some media servers/proxies reject HEAD even though video GET requests work.
          // A one-byte probe discovers the size and checks range access in one request.
          const probe = await request({ headers: { Range: 'bytes=0-0' } });
          const range = /^bytes 0-0\/(\d+)$/.exec(probe.headers.get('content-range') ?? '');
          if (probe.status === 206 && range && Number.isSafeInteger(Number(range[1])) && Number(range[1]) > 0) {
            await probe.body?.cancel();
            return Number(range[1]);
          }
          if (probe.status === 200) {
            const size = Number(probe.headers.get('content-length'));
            if (Number.isSafeInteger(size) && size > 0 && size <= 16 * 1024 * 1024) {
              fullFile = new Uint8Array(await probe.arrayBuffer());
              if (fullFile.length !== size) throw new Error('Incomplete file');
              return size;
            }
          }
          await probe.body?.cancel();
          if (!probe.ok) throw new Error(`Media request failed: ${probe.status}`);
          // Older servers may expose Content-Length but not Content-Range to CORS.
          const response = await request({ method: 'HEAD' });
          const size = Number(response.headers.get('content-length'));
          if (!response.ok || !Number.isSafeInteger(size) || size <= 0) throw new Error('File size unavailable');
          return size;
        },
        read: async (start, end) => {
          if (fullFile) return fullFile.slice(start, end);
          const result = new Uint8Array(end - start);
          // Finite ranges prevent a localhost server from sending the rest of a large video
          // while the decoder is only asking for a small audio packet or container index.
          for (let offset = start; offset < end; offset += 256 * 1024) {
            const limit = Math.min(end, offset + 256 * 1024);
            const response = await request({ headers: { Range: `bytes=${offset}-${limit - 1}` } });
            if (response.status !== 206) {
              const size = Number(response.headers.get('content-length'));
              if (!response.ok || size <= 0 || size > 16 * 1024 * 1024) {
                await response.body?.cancel();
                throw new Error('Byte range support required');
              }
              fullFile = new Uint8Array(await response.arrayBuffer());
              return fullFile.slice(start, end);
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length !== limit - offset) throw new Error('Incomplete byte range');
            result.set(bytes, offset - start);
          }
          return result;
        },
        dispose: () => controller.abort(),
      }),
    });
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      reason = 'noAudio';
      throw new Error('No audio track');
    }
    if (!(await track.canDecode())) {
      reason = 'codec';
      throw new Error('Unsupported audio codec');
    }
    const duration = await track.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid duration');
    const peaks = new Array<number>(Math.min(12000, Math.ceil(duration * 1000))).fill(0);
    let lastUpdate = 0;
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        if (finished) return;
        const values = new Float32Array(sample.numberOfFrames);
        for (let channel = 0; channel < sample.numberOfChannels; channel++) {
          sample.copyTo(values, { planeIndex: channel, format: 'f32-planar' });
          for (let i = 0; i < values.length; i++) {
            const t = sample.timestamp + i / sample.sampleRate;
            const bin = Math.min(peaks.length - 1, Math.max(0, Math.floor((t / duration) * peaks.length)));
            peaks[bin] = Math.max(peaks[bin], Math.abs(values[i]));
          }
        }
        if (performance.now() - lastUpdate > 250) {
          self.postMessage({
            peaks,
            duration,
            state: 'loading',
            progress: Math.min(99, Math.round((sample.timestamp / duration) * 100)),
          } satisfies WaveformData);
          lastUpdate = performance.now();
        }
      } finally {
        sample.close();
      }
    }
    if (!finished) {
      finished = true;
      self.postMessage({ peaks, duration, state: 'ready', progress: 100 } satisfies WaveformData);
    }
  } catch {
    failed();
  } finally {
    controller.abort();
    input?.dispose();
  }
};
