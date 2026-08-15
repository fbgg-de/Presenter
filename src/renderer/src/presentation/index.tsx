import { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Presentation, type PresentationProps } from '@/presentation/Presentation';
import type { PresentationContent, PresentationLine } from '@/presentation/types';
import { EMPTY_CONTENT } from '@/presentation/types';
import { getSetting } from '@/store/settingsSlice';
import { playWithFade, pauseWithFade, stopWithFade } from '@/presentation/videoUtils';
import { LanguageStyleEntry } from '@/api/styles.api';

export * from '@/presentation/BibleVerseContent';
export * from '@/presentation/CopyrightOverlay';
export * from '@/presentation/IdentifyOverlay';
export * from '@/presentation/MediaContent';
export * from '@/presentation/NextBlockPreview';
export * from '@/presentation/NormalMode';
export * from '@/presentation/StreamMode';

/**
 * Read the video fade duration from localStorage (set by the main renderer's settings).
 * Returns 0 if not set (instant cut).
 */
const getVideoFadeDuration = (): number => {
  const v = getSetting('videoFadeDuration');
  const n = v !== undefined && v !== null ? parseInt(String(v), 10) : 0;
  return isNaN(n) || n < 0 ? 0 : n;
};

/**
 * Read the hide-transition duration from localStorage (set by the main renderer's
 * settings). Used to make the auto-hide of style background videos (when a
 * media-item video becomes active) fade smoothly instead of cutting abruptly.
 * Defaults to 400ms which is gentler than an instant cut.
 */
const getHideTransitionDuration = (): number => {
  const v = getSetting('hideTransitionDuration');
  const n = v !== undefined && v !== null ? parseInt(String(v), 10) : NaN;
  return isNaN(n) || n < 0 ? 400 : n;
};

/**
 * Build a CSS override object from a LanguageStyleEntry (only enabled properties).
 */
export const langEntryToCss = (entry: LanguageStyleEntry): CSSProperties => {
  const css: CSSProperties = {};
  if (entry.fontColorEnabled && entry.fontColor) css.color = entry.fontColor;
  if (entry.fontSizeEnabled && entry.fontSize) css.fontSize = entry.fontSize;
  if (entry.fontStyleEnabled) {
    if (entry.fontBold) css.fontWeight = 'bold';
    if (entry.fontItalic) css.fontStyle = 'italic';
    if (entry.fontUnderline) css.textDecoration = 'underline';
  }
  if (entry.letterSpacingEnabled && entry.letterSpacing) css.letterSpacing = entry.letterSpacing;
  if (entry.opacityEnabled && entry.opacity !== undefined) css.opacity = entry.opacity;
  if (entry.textShadowEnabled && entry.textShadow) {
    css.textShadow = `${entry.textShadow} ${entry.textShadowColor || 'rgba(0,0,0,0.5)'}`;
  }
  if (entry.textStrokeEnabled && entry.textStroke) {
    (css as Record<string, unknown>)['-webkit-text-stroke'] = entry.textStroke;
  }
  return css;
};

/**
 * Resolve per-language CSS for a given line's language tag.
 * Returns default entry overrides plus language-specific overrides.
 */
export const resolveLineLangCss = (language: string | undefined, langStyles: LanguageStyleEntry[] | undefined): CSSProperties => {
  if (!langStyles?.length) return {};
  const defaultEntry = langStyles.find((e) => e.language === '');
  const langEntry = language ? langStyles.find((e) => e.language === language.toLowerCase()) : undefined;
  const css: CSSProperties = defaultEntry ? langEntryToCss(defaultEntry) : {};
  if (langEntry) Object.assign(css, langEntryToCss(langEntry));
  return css;
};

/**
 * Generate a content identity key for detecting **meaningful** content changes
 * (item-level only, not block switches, and NOT cosmetic display-only edits).
 *
 * Display-only props such as `mediaObjectFit`, `mediaObjectPosition`,
 * `mediaZoom`, `mediaBlur`, `mediaAutoplay` and `mediaLoop` are deliberately
 * EXCLUDED — they are pure CSS / DOM-attribute updates and should be applied
 * in place. Including them would force the cross-fade machinery to capture a
 * "previous" snapshot and remount the `<video>` element on every slider tick,
 * causing the video to restart and a visible background flicker.
 */
export const contentIdentityKey = (c: PresentationContent): string =>
  `${c.contentType}|${c.mediaPath ?? ''}|${c.bibleRef ?? ''}|${c.mediaColor ?? ''}|${c.style?.backgroundImage ?? ''}|${c.style?.backgroundVideo ?? ''}|${c.style?.backgroundColor ?? ''}`;

/**
 * Filter lines by allowed languages and optionally reorder within each semantic group.
 *
 * A "semantic group" is one primary line (no language tag) plus all translation lines
 * immediately following it. When `languages` is provided:
 *   - Lines whose language is not in the list are removed.
 *   - Within each group the line order follows the `languages` array order.
 *   - If the first entry of `languages` is a recognized language tag (not ''), the
 *     translation for that language comes first, then the others.
 *
 * When no filter is provided all lines pass through unchanged.
 */
export const filterLinesByLanguage = (lines: PresentationLine[], languages?: string[]): PresentationLine[] => {
  if (!languages || languages.length === 0) return lines;

  // Split into semantic groups: [{primary?, translations[]}]
  type Group = { primary?: PresentationLine; translations: PresentationLine[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    if (!line.language) {
      // New primary line starts a new group
      if (current) groups.push(current);
      current = { primary: line, translations: [] };
    } else {
      // Translation — attach to current group or start an orphan group
      if (!current) current = { translations: [] };
      const langUp = line.language.toUpperCase();
      if (languages.includes(langUp)) {
        current.translations.push(line);
      }
      // else: language not in filter list — skip
    }
  }
  if (current) groups.push(current);

  // Re-emit each group with lines in `languages` order within the group
  const result: PresentationLine[] = [];
  for (const group of groups) {
    // Build a map: lang -> line for quick lookup
    const byLang = new Map<string, PresentationLine>();
    if (group.primary) byLang.set('', group.primary);
    for (const t of group.translations) {
      if (t.language) byLang.set(t.language.toUpperCase(), t);
    }

    // Emit in the order specified by `languages`.
    // '' (empty string / no-language tag) represents the primary/default line.
    // If `languages` doesn't include '' we still emit the primary line first (it's the anchor).
    const emitted = new Set<string>();
    for (const lang of languages) {
      const key = lang.toUpperCase();
      const line = key === '' ? group.primary : byLang.get(key);
      if (line) {
        result.push(line);
        emitted.add(key);
      }
    }
    // Emit primary line if it wasn't covered by the languages list
    if (group.primary && !emitted.has('')) result.push(group.primary);
  }

  return result;
};

// Parse URL query params for window configuration
const params = new URLSearchParams(window.location.search);
const urlMode = params.get('mode') as 'normal' | 'stream' | null;
const urlName = params.get('name');
const urlLines = params.get('lines');
const urlLanguages = params.get('languages');
const urlTransparent = params.get('transparent');
/** Bridge registry id, set when this page was opened by the operator as a popup. */
const urlWindowId = params.get('wid');

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
const heavyAssetKey = (c: PresentationContent) => {
  const styleBgImg = c.style?.backgroundImage ?? '';
  const styleBgVideo = c.style?.backgroundVideo ?? '';
  const itemPath = c.contentType === 'media' && (c.mediaSubType === 'image' || c.mediaSubType === 'video') ? (c.mediaPath ?? '') : '';
  return `${styleBgImg}|${styleBgVideo}|${itemPath}`;
};

/** Promise-based preload of an image. Resolves whether or not it succeeds. */
const preloadImage: (url: string) => Promise<void> = (url) => {
  return new Promise((resolve) => {
    const img = new globalThis.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
};

/** Promise-based preload of a video — resolves once enough is buffered to play. */
const preloadVideo: (url: string) => Promise<void> = (url) => {
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
};

/** Preload all heavy assets referenced by `content`. Resolves when all done. */
const preloadHeavyAssets = async (content: PresentationContent): Promise<void> => {
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

  await Promise.all(tasks);
  return undefined;
};

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

// The listener above is attached — anything the opener sent before this point never
// arrived. Tell it so, the same way the Electron path calls `signalReady()` below.
//
// The opener cannot work this out on its own: a `load` listener it registers on the
// popup belongs to the about:blank global the popup starts on and is discarded when we
// navigate here, so its initial push was silently dropped and this window stayed black
// until the operator changed the block. Announcing also covers a manual reload of this
// page, which the opener has no other way of noticing.
//
// A page loaded directly (an OBS browser source) has no opener and simply skips this.
if (!window.presentationApi && window.opener) {
  try {
    (window.opener as Window).postMessage({ type: 'PRESENTATION_READY', id: urlWindowId }, '*');
  } catch {
    // opener already gone, or not same-origin — nothing to announce to
  }
}

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
              playWithFade(v, fadeDuration);
              break;
            case 'pause':
              pauseWithFade(v, fadeDuration);
              break;
            case 'toggle':
              if (v.paused) {
                playWithFade(v, fadeDuration);
              } else {
                pauseWithFade(v, fadeDuration);
              }
              break;
            case 'stop':
              stopWithFade(v, fadeDuration);
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

  // Listeners are attached — anything main sent before this point never arrived.
  // This tells main to replay the last content, closing the startup race where a
  // restored window otherwise stayed black until the operator navigated.
  window.presentationApi.signalReady?.();
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
