import { useEffect, useRef, useState } from 'react';

export interface VideoInfo {
  thumbnail?: string;
  /** Seconds. */
  duration?: number;
  width?: number;
  height?: number;
}

/** Where the media server keeps this file's grabbed frame and facts (see mediaServer's /thumb, /meta). */
export interface VideoCache {
  thumb: string;
  meta: string;
}

/** A frame and facts grabbed in an earlier session, or null when the server has none (or no cache). */
async function readCached(where: VideoCache | undefined): Promise<VideoInfo | null> {
  if (!where) return null;
  try {
    const res = await fetch(where.meta);
    if (!res.ok) return null;
    const facts = (await res.json()) as { duration?: number; width?: number; height?: number; thumb?: number };
    const { thumb, ...rest } = facts;
    return thumb ? { ...rest, thumbnail: where.thumb } : rest;
  } catch {
    return null;
  }
}

/** Keep what was just grabbed for the next session. Fire and forget: the cache is only a cache. */
async function storeCached(where: VideoCache | undefined, info: VideoInfo): Promise<void> {
  if (!where || info.duration === undefined) return;
  try {
    let thumb = 0;
    if (info.thumbnail?.startsWith('data:image/jpeg')) {
      const blob = await (await fetch(info.thumbnail)).blob();
      thumb = (await fetch(where.thumb, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })).ok ? 1 : 0;
    }
    const facts = { duration: info.duration, width: info.width, height: info.height, thumb };
    await fetch(where.meta, { method: 'PUT', body: JSON.stringify(facts), headers: { 'Content-Type': 'application/json' } });
  } catch {
    /* an older media server without the cache */
  }
}

const cache = new Map<string, VideoInfo>();
/**
 * One decoder for the entire visible library; completed thumbnails survive reopening.
 * The metadata read on the way (duration, resolution) is kept even when grabbing a frame fails.
 */
export function useVideoThumbnails(urls: string[], enabled: boolean, cacheFor?: (url: string) => VideoCache | undefined) {
  const key = JSON.stringify(urls);
  const cacheForRef = useRef(cacheFor);
  cacheForRef.current = cacheFor;
  const [videos, setVideos] = useState<Record<string, VideoInfo>>({});
  const current = useRef(new Map<string, VideoInfo>());
  useEffect(() => {
    if (!enabled) return;
    const queue = JSON.parse(key) as string[];
    const wanted = new Set(queue);
    for (const url of current.current.keys()) if (!wanted.has(url)) current.current.delete(url);
    for (const url of queue) if (cache.has(url) && !current.current.has(url)) current.current.set(url, cache.get(url)!);
    let disposed = false;
    let cancel: (() => void) | undefined;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 135;
    const context = canvas.getContext('2d');
    const publish = () =>
      setVideos(
        Object.fromEntries(
          queue.flatMap((url) => {
            const info = current.current.get(url);
            return info ? [[url, info]] : [];
          }),
        ),
      );
    publish();
    void (async () => {
      for (const url of queue) {
        if (disposed) break;
        if (current.current.has(url)) continue;
        // Grabbed in an earlier session: no decoding at all.
        const where = cacheForRef.current?.(url);
        const stored = await readCached(where);
        if (disposed) break;
        if (stored) {
          cache.set(url, stored);
          current.current.set(url, stored);
          publish();
          continue;
        }
        const info = await new Promise<VideoInfo>((resolve) => {
          const found: VideoInfo = {};
          let settled = false;
          const finish = (thumbnail?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.onloadedmetadata = video.onseeked = video.onerror = null;
            video.pause();
            video.removeAttribute('src');
            video.load();
            resolve(thumbnail ? { ...found, thumbnail } : found);
          };
          const timer = setTimeout(() => finish(), 6000);
          cancel = () => finish();
          video.onloadedmetadata = () => {
            if (video.videoWidth) {
              found.width = video.videoWidth;
              found.height = video.videoHeight;
            }
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
              finish();
              return;
            }
            found.duration = video.duration;
            video.currentTime = Math.min(1, video.duration / 4);
          };
          video.onseeked = () => {
            try {
              if (!context || !video.videoWidth) {
                finish();
                return;
              }
              context.fillStyle = '#111';
              context.fillRect(0, 0, canvas.width, canvas.height);
              const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
              const w = video.videoWidth * scale,
                h = video.videoHeight * scale;
              context.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
              finish(canvas.toDataURL('image/jpeg', 0.75));
            } catch {
              finish();
            }
          };
          video.onerror = () => finish();
          video.src = url;
        });
        if (disposed) break;
        void storeCached(where, info);
        cache.set(url, info);
        current.current.set(url, info);
        if (cache.size > 160) cache.delete(cache.keys().next().value!);
        publish();
      }
    })();
    return () => {
      disposed = true;
      cancel?.();
      video.removeAttribute('src');
      video.load();
    };
  }, [key, enabled]);
  return videos;
}
