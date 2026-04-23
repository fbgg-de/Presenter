import { createRoot } from 'react-dom/client';
import { Presentation, type PresentationProps } from '@/presentation/Presentation';
import type { PresentationContent } from '@/presentation/types';
import { EMPTY_CONTENT } from '@/presentation/types';

/**
 * Read the video fade duration from localStorage (set by the main renderer's settings).
 * Returns 0 if not set (instant cut).
 */
function getVideoFadeDuration(): number {
  try {
    const v = localStorage.getItem('presenter_video_fade_duration');
    const n = v !== null ? parseInt(v, 10) : 0;
    return isNaN(n) || n < 0 ? 0 : n;
  } catch {
    return 0;
  }
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
    const next = Math.max(0, Math.min(1, from + delta * step));
    video.volume = next;
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

export const updatePresentation = (props: PresentationProps) => {
  // Apply URL overrides if content is present
  if (props.content && props.content !== EMPTY_CONTENT) {
    props = { ...props, content: applyUrlOverrides(props.content) };
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
        const videos = document.querySelectorAll('video');
        const action = (cmd as { action?: string }).action;
        // Prefer the fadeDuration passed via IPC; fall back to localStorage for backwards compat.
        const cmdFadeDuration = (cmd as { fadeDuration?: number }).fadeDuration;
        const fadeDuration = typeof cmdFadeDuration === 'number' ? cmdFadeDuration : getVideoFadeDuration();
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
