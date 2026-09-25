/**
 * Video durations, read from the file's metadata and remembered per URL.
 *
 * A version's clock needs its length before it starts: loops, pauses and the end of the file
 * are all measured against it. Versions made by dropping a file do not know it yet.
 */
const known = new Map<string, number>();
const pending = new Map<string, Promise<number>>();

export const knownDuration = (url: string): number | undefined => known.get(url);

/** The duration in seconds, or 0 when the file cannot be read within `timeoutMs`. */
export function probeDuration(url: string, timeoutMs = 8000): Promise<number> {
  const cached = known.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = pending.get(url);
  if (running) return running;
  const promise = new Promise<number>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(0);
      return;
    }
    const video = document.createElement('video');
    let done = false;
    const finish = (value: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      pending.delete(url);
      // Failures are not remembered: the media server may just be starting.
      if (value > 0) known.set(url, value);
      resolve(value);
    };
    const timer = setTimeout(() => finish(0), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) / 1000 : 0);
    video.onerror = () => finish(0);
    video.src = url;
  });
  pending.set(url, promise);
  return promise;
}
