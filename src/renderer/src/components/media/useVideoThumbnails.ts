import { useEffect, useRef, useState } from 'react';

export interface VideoInfo {
  thumbnail?: string;
  /** Seconds. */
  duration?: number;
  width?: number;
  height?: number;
}

const cache = new Map<string, VideoInfo>();
/**
 * One decoder for the entire visible library; completed thumbnails survive reopening.
 * The metadata read on the way (duration, resolution) is kept even when grabbing a frame fails.
 */
export function useVideoThumbnails(urls: string[], enabled: boolean) {
  const key = JSON.stringify(urls);
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
