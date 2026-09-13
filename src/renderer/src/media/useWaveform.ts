import { useEffect, useState } from 'react';
export type WaveformData = {
  peaks: number[];
  duration: number;
  progress: number;
  state: 'loading' | 'ready' | 'unavailable';
  reason?: 'noAudio' | 'codec' | 'read';
};
const cache = new Map<string, WaveformData>();
const empty: WaveformData = { peaks: [], duration: 0, progress: 0, state: 'unavailable' };

/** Decode only the audio track, off the UI thread, with bounded memory and cancellation. */
export function useWaveform(url?: string) {
  const [data, setData] = useState<WaveformData>(empty);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!url) {
      setData(empty);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setData(cached);
      return;
    }
    setData({ ...empty, state: 'loading' });
    let worker: Worker;
    try {
      worker = new Worker(new URL('./waveform.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Script/CSP/browser failures belong in the waveform field, not React's root boundary.
      setData({ ...empty, reason: 'read' });
      return;
    }
    worker.onmessage = ({ data: next }: MessageEvent<WaveformData>) => {
      setData(next);
      if (next.state === 'ready') {
        cache.set(url, next);
        if (cache.size > 8) cache.delete(cache.keys().next().value!);
      }
      if (next.state !== 'loading') worker.terminate();
    };
    const failed = () => {
      worker.terminate();
      setData({ ...empty, reason: 'read' });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      failed();
    };
    worker.onmessageerror = failed;
    try {
      worker.postMessage(url);
    } catch {
      failed();
    }
    return () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
  }, [url, retry]);
  return {
    ...data,
    retry: () => {
      if (url) cache.delete(url);
      setRetry((v) => v + 1);
    },
  };
}
