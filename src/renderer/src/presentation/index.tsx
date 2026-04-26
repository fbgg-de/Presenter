import { createRoot } from 'react-dom/client';
import { Presentation, type PresentationProps } from '@/presentation/Presentation';
import type { PresentationContent } from '@/presentation/types';
import { EMPTY_CONTENT } from '@/presentation/types';

import { getSetting } from '@/store/settingsSlice';

/**
 * Read the video fade duration from localStorage (set by the main renderer's settings).
 * Returns 0 if not set (instant cut).
 */
function getVideoFadeDuration(): number {
  const v = getSetting('videoFadeDuration');
  const n = v !== undefined && v !== null ? parseInt(String(v), 10) : 0;
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Read the hide-transition duration from localStorage (set by the main renderer's
 * settings). Used to make the auto-hide of style background videos (when a
 * media-item video becomes active) fade smoothly instead of cutting abruptly.
 * Defaults to 400ms which is gentler than an instant cut.
 */
function getHideTransitionDuration(): number {
  const v = getSetting('hideTransitionDuration');
  const n = v !== undefined && v !== null ? parseInt(String(v), 10) : NaN;
  return isNaN(n) || n < 0 ? 400 : n;
}

/**
 * Smoothly ramp a video element's volume from `from` to `to` over `durationMs`.
 * Calls `onDone` when finished.
 */
function fadeVolume(video: HTMLVideoElement, from: number, to: number, durationMs: number, onDone?: () => void): void {
  if (durationMs <= 0) {
    video.volume = Math.max(0, Math.min(1, to));
    onDone?.();
    return;
  }
  const steps = Math.max(1, Math.round(durationMs / 16)); // ~60fps
  const stepDuration = durationMs / steps;
  const delta = (to - from) / steps;
  let step = 0;
  const tick = () => {
    step++;
    video.volume = Math.max(0, Math.min(1, from + delta * step));
    if (step < steps) {
      setTimeout(tick, stepDuration);
    } else {
      video.volume = Math.max(0, Math.min(1, to));
      onDone?.();
    }
  };
  setTimeout(tick, stepDuration);
}

// Parse URL query params for window configuration
const params = new URLSearchParams(window.location.search);
const urlMode = params.get('mode') as 'normal' | 'stream' | null;
const urlName = params.get('name');
const urlLines = params.get('lines');
const urlLanguages = params.get('languages');
const urlTransparent = params.get('transparent');

// Apply transparent background for OBS Browser Source
const el = document.getElementById('presentation-root')!;
if (urlTransparent === '1') {
  document.body.style.background = 'transparent';
  el.style.background = 'transparent';
}

// Create the root once
const root = createRoot(el);

// Track the last known content for re-render after identify
let lastProps: PresentationProps = { content: EMPTY_CONTENT };

/**
 * Apply URL-based overrides to content.
 */
const applyUrlOverrides = (content: PresentationContent): PresentationContent => {
  const result = { ...content };
  if (urlMode) result.displayMode = urlMode;
  if (urlName) result.windowName = urlName;
  if (urlLines) result.streamLines = parseInt(urlLines, 10);
  if (urlLanguages) result.languages = urlLanguages.split(',');
  return result;
};

// Export a function to update the presentation.
// We coalesce updates to the next animation frame so multiple presentation
// windows that receive the same broadcast tick render on the same vsync
// boundary — eliminating the visible offset between windows during fast nav.
let pendingProps: PresentationProps | null = null;
let rafScheduled = false;
const commit = () => {
  rafScheduled = false;
  if (!pendingProps) return;
  const props = pendingProps;
  pendingProps = null;
  lastProps = props;
  root.render(<Presentation {...props} />);
};

// ── Heavy-asset preloading ────────────────────────────────────────────────────
//
// When the operator switches to a new item that has a different background
// image / background video / media-item video, browsers will momentarily show a
// flash of black before the new asset is decoded and painted. To prevent this,
// we **stage** the new content: when an incoming update has different heavy
// assets than the current view, we preload them in the background and only
// commit the new content once they are ready (or after a max grace period).
// This means the operator continues to see the OLD slide cleanly while the new
// slide's resources warm up, and the swap is then effectively instant.
//
// The grace period bounds the wait so we never appear stuck if a network
// resource is slow or unavailable.
const PRELOAD_MAX_WAIT_MS = 1000;
let preloadTimer: ReturnType<typeof setTimeout> | null = null;
let lastCommittedHeavyKey = '';

/** Build a key over the assets that need to be preloaded. */
function heavyAssetKey(c: PresentationContent): string {
  const styleBgImg = c.style?.backgroundImage ?? '';
  const styleBgVideo = c.style?.backgroundVideo ?? '';
  const itemPath = c.contentType === 'media' && (c.mediaSubType === 'image' || c.mediaSubType === 'video') ? (c.mediaPath ?? '') : '';
  return `${styleBgImg}|${styleBgVideo}|${itemPath}`;
}

/** Promise-based preload of an image. Resolves whether or not it succeeds. */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new globalThis.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** Promise-based preload of a video — resolves once enough is buffered to play. */
function preloadVideo(url: string): Promise<void> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // Detach from DOM if it was attached; we never appended it so this is a no-op.
      resolve();
    };
    v.oncanplay = finish;
    v.onerror = finish;
    v.src = url;
  });
}

/** Preload all heavy assets referenced by `content`. Resolves when all done. */
function preloadHeavyAssets(content: PresentationContent): Promise<void> {
  const tasks: Promise<void>[] = [];
  const styleBgImg = content.style?.backgroundImage;
  const styleBgVideo = content.style?.backgroundVideo;
  if (styleBgImg) tasks.push(preloadImage(styleBgImg));
  if (styleBgVideo) tasks.push(preloadVideo(styleBgVideo));
  if (content.contentType === 'media' && content.mediaPath) {
    if (content.mediaSubType === 'image') tasks.push(preloadImage(content.mediaPath));
    else if (content.mediaSubType === 'video') tasks.push(preloadVideo(content.mediaPath));
  }
  if (tasks.length === 0) return Promise.resolve();
  return Promise.all(tasks).then(() => undefined);
}

export const updatePresentation = (props: PresentationProps) => {
  // Apply URL overrides if content is present
  if (props.content && props.content !== EMPTY_CONTENT) {
    props = { ...props, content: applyUrlOverrides(props.content) };
  }

  // Cosmetic / non-asset changes (block navigation, line nav, position/zoom/blur,
  // etc.) commit immediately. Only when a NEW heavy asset (different background
  // image/video, different media-item path) appears do we wait for it to preload
  // before swapping. The grace period bounds how long we hold the old slide.
  const incomingHeavyKey = props.content && props.content !== EMPTY_CONTENT ? heavyAssetKey(props.content) : '';
  const heavyAssetsChanged = incomingHeavyKey !== '' && incomingHeavyKey !== lastCommittedHeavyKey;

  if (heavyAssetsChanged) {
    // Cancel any in-flight preload — the latest update wins.
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }

    // Pre-warm the body class for media-item active state so style background
    // videos can already start fading out while the new asset preloads.
    if (props.content) {
      const isMediaVideo = props.content.contentType === 'media' && props.content.mediaSubType === 'video';
      if (isMediaVideo) {
        const dur = getHideTransitionDuration();
        document.body.style.setProperty('--hide-bg-video-duration', `${dur}ms`);
      }
      document.body.classList.toggle('media-item-active', props.content.contentType === 'media' && props.content.mediaSubType === 'video');
    }

    let committed = false;
    const finalize = () => {
      if (committed) return;
      committed = true;
      preloadTimer = null;
      lastCommittedHeavyKey = incomingHeavyKey;
      pendingProps = props;
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(commit);
      }
    };

    // Hard cap: never wait longer than the grace period.
    preloadTimer = setTimeout(finalize, PRELOAD_MAX_WAIT_MS);
    // Resolve as soon as preload finishes, whichever comes first.
    if (props.content) void preloadHeavyAssets(props.content).then(finalize);
    return;
  }

  // Same heavy assets → commit immediately (no flicker possible).
  if (props.content && props.content !== EMPTY_CONTENT) {
    const isMediaVideo = props.content.contentType === 'media' && props.content.mediaSubType === 'video';
    if (isMediaVideo) {
      const dur = getHideTransitionDuration();
      document.body.style.setProperty('--hide-bg-video-duration', `${dur}ms`);
    }
    document.body.classList.toggle('media-item-active', isMediaVideo);
  }
  pendingProps = props;
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(commit);
  }
};

// ── Listen for messages from the main window ──

// Method 1: postMessage (browser mode)
window.addEventListener('message', (event) => {
  if (!event?.data) return;
  if (event.data.type === 'UPDATE_PRESENTATION') {
    updatePresentation(event.data.props);
  } else if (event.data.type === 'HIDE_IDENTIFY') {
    // Re-render last content without the identify overlay
    const restored = {
      ...lastProps,
      content: lastProps.content ? { ...lastProps.content, showIdentify: false } : EMPTY_CONTENT,
    };
    updatePresentation(restored);
  }
});

// Method 2: Electron IPC (presentation preload — used when loaded as a BrowserWindow)
if (window.presentationApi) {
  window.presentationApi.onContentUpdate((data: unknown) => {
    const msg = data as { type: string; props: PresentationProps };
    if (msg.type === 'UPDATE_PRESENTATION') {
      updatePresentation(msg.props);
    }
  });

  window.presentationApi.onCommand((data: unknown) => {
    const cmd = data as { type: string; windowName?: string; number?: number; styleName?: string };
    switch (cmd.type) {
      case 'FADE_TO_BLACK':
        updatePresentation({
          ...lastProps,
          content: lastProps.content ? { ...lastProps.content, isBlack: true } : { ...EMPTY_CONTENT, isBlack: true },
        });
        break;
      case 'FADE_FROM_BLACK':
        updatePresentation({
          ...lastProps,
          content: lastProps.content ? { ...lastProps.content, isBlack: false } : EMPTY_CONTENT,
        });
        break;
      case 'IDENTIFY':
        updatePresentation({
          ...lastProps,
          content: lastProps.content
            ? {
                ...lastProps.content,
                showIdentify: true,
                windowName: cmd.windowName || 'Presentation',
                windowNumber: cmd.number,
                identifyStyleName: cmd.styleName,
              }
            : {
                ...EMPTY_CONTENT,
                showIdentify: true,
                windowName: cmd.windowName || 'Presentation',
                windowNumber: cmd.number,
                identifyStyleName: cmd.styleName,
              },
        });
        break;
      case 'HIDE_IDENTIFY': {
        const restored = {
          ...lastProps,
          content: lastProps.content ? { ...lastProps.content, showIdentify: false } : EMPTY_CONTENT,
        };
        updatePresentation(restored);
        break;
      }
      case 'VIDEO_COMMAND': {
        const target = (cmd as { target?: string }).target;
        // 'media-item' targets only the item video, not style background videos.
        const selector = target === 'media-item' ? 'video[data-role="media-item"]' : 'video';
        const videos = document.querySelectorAll<HTMLVideoElement>(selector);
        const action = (cmd as { action?: string }).action;
        // Prefer the fadeDuration passed via IPC; fall back to localStorage for backwards compat.
        // For media-item targets we intentionally skip fadeDuration — they are always muted
        // and must never have their muted/volume state touched.
        const cmdFadeDuration = (cmd as { fadeDuration?: number }).fadeDuration;
        const fadeDuration = target === 'media-item' ? 0 : typeof cmdFadeDuration === 'number' ? cmdFadeDuration : getVideoFadeDuration();
        videos.forEach((v) => {
          switch (action) {
            case 'play':
              if (fadeDuration > 0) {
                const targetVol = v.volume > 0 ? v.volume : 1;
                v.muted = false;
                v.volume = 0;
                v.play().catch(() => {});
                fadeVolume(v, 0, targetVol, fadeDuration);
              } else {
                v.play().catch(() => {});
              }
              break;
            case 'pause':
              if (fadeDuration > 0) {
                const startVol = v.volume > 0 ? v.volume : v.muted ? 0 : 1;
                if (startVol > 0) {
                  v.volume = startVol;
                  v.muted = false;
                  fadeVolume(v, startVol, 0, fadeDuration, () => {
                    v.pause();
                    v.volume = startVol;
                  });
                } else {
                  v.pause();
                }
              } else {
                v.pause();
              }
              break;
            case 'toggle':
              if (v.paused) {
                if (fadeDuration > 0) {
                  const targetVol = v.volume > 0 ? v.volume : 1;
                  v.muted = false;
                  v.volume = 0;
                  v.play().catch(() => {});
                  fadeVolume(v, 0, targetVol, fadeDuration);
                } else {
                  v.play().catch(() => {});
                }
              } else {
                if (fadeDuration > 0) {
                  const startVol = v.volume > 0 ? v.volume : v.muted ? 0 : 1;
                  if (startVol > 0) {
                    v.volume = startVol;
                    v.muted = false;
                    fadeVolume(v, startVol, 0, fadeDuration, () => {
                      v.pause();
                      v.volume = startVol;
                    });
                  } else {
                    v.pause();
                  }
                } else {
                  v.pause();
                }
              }
              break;
            case 'stop':
              if (fadeDuration > 0) {
                const startVol = v.volume > 0 ? v.volume : v.muted ? 0 : 1;
                if (startVol > 0) {
                  v.volume = startVol;
                  v.muted = false;
                  fadeVolume(v, startVol, 0, fadeDuration, () => {
                    v.pause();
                    v.currentTime = 0;
                    v.volume = startVol;
                  });
                } else {
                  v.pause();
                  v.currentTime = 0;
                }
              } else {
                v.pause();
                v.currentTime = 0;
              }
              break;
            case 'mute':
              v.muted = true;
              break;
            case 'unmute':
              v.muted = false;
              break;
            case 'toggle_mute':
              v.muted = !v.muted;
              break;
            case 'set_volume':
              v.volume = Math.max(0, Math.min(1, (cmd as { value?: number }).value ?? 1));
              break;
            case 'loop':
              v.loop = true;
              break;
            case 'unloop':
              v.loop = false;
              break;
            case 'toggle_loop':
              v.loop = !v.loop;
              break;
            case 'seek':
              v.currentTime = (cmd as { value?: number }).value ?? 0;
              break;
            case 'seek_relative':
              v.currentTime = Math.max(0, v.currentTime + ((cmd as { value?: number }).value ?? 0));
              break;
          }
        });
        break;
      }
      case 'SET_VIDEO_VISIBLE': {
        // Toggle a body class that hides background videos via CSS. The
        // controller can either set an explicit value or toggle the current
        // state. The class is read by Presentation.tsx via a global stylesheet
        // so React doesn't need to re-render to reflect the change.
        // `mode` ('cut'|'fade') and `durationMs` come from settings; we apply
        // them via a data-attribute + CSS variable so the stylesheet can pick
        // the right transition. Default to instant cut for backwards compat.
        const c = cmd as { value?: boolean; mode?: 'cut' | 'fade'; durationMs?: number };
        const body = document.body;
        const mode = c.mode === 'fade' ? 'fade' : 'cut';
        const durationMs = typeof c.durationMs === 'number' && c.durationMs >= 0 ? c.durationMs : 0;
        body.dataset.hideTransition = mode;
        body.style.setProperty('--hide-bg-video-duration', `${mode === 'fade' ? durationMs : 0}ms`);
        if (c.value === true) body.classList.remove('hide-bg-video');
        else if (c.value === false) body.classList.add('hide-bg-video');
        else body.classList.toggle('hide-bg-video');
        break;
      }
    }
  });
}

// Initial render (blank)
updatePresentation({ content: EMPTY_CONTENT });

// ── Video status reporting ──
// Only run the polling interval while a <video> element actually exists in the DOM.
// Previously this fired every 250 ms even with no video, flooding IPC with messages
// that the main process re-broadcasts to every other BrowserWindow → significant
// background lag in Electron.
if (window.presentationApi?.reportVideoStatus) {
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let lastReportedHasVideo = false;

  const startPolling = () => {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      const videos = document.querySelectorAll('video');
      if (videos.length === 0) {
        if (lastReportedHasVideo) {
          window.presentationApi!.reportVideoStatus!({ hasVideo: false, windowName: urlName || undefined });
          lastReportedHasVideo = false;
        }
        stopPolling();
        return;
      }
      const v = videos[0];
      window.presentationApi!.reportVideoStatus!({
        hasVideo: true,
        paused: v.paused,
        muted: v.muted,
        loop: v.loop,
        volume: v.volume,
        currentTime: v.currentTime,
        duration: v.duration || 0,
        windowName: urlName || undefined,
      });
      lastReportedHasVideo = true;
    }, 500);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  // Watch the DOM for video elements being added/removed and start/stop polling accordingly.
  const observer = new MutationObserver(() => {
    const hasVideo = document.querySelector('video') !== null;
    if (hasVideo) startPolling();
    else if (!hasVideo && lastReportedHasVideo) {
      // Send a final "no video" status so the controller hides its UI
      window.presentationApi!.reportVideoStatus!({ hasVideo: false, windowName: urlName || undefined });
      lastReportedHasVideo = false;
      stopPolling();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
