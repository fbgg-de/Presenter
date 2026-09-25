import { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Presentation, type PresentationProps } from '@/presentation/Presentation';
import type { PresentationContent } from '@/presentation/types';
import { EMPTY_CONTENT } from '@/presentation/types';
import { EMPTY_STAGE_PAYLOAD, type StageOverlayPayload } from '@/stage/types';
import { showDevBanner } from '@/devBanner';
import { LanguageStyleEntry } from '@/api/styles.api';
import { MAIN_LANGUAGE_SLOT, entryForSlot, slotForLanguage } from '@/utils/languageSlots';

export * from '@/presentation/BibleVerseContent';
export * from '@/presentation/CopyrightOverlay';
export * from '@/presentation/IdentifyOverlay';
export * from '@/presentation/MediaContent';
export * from '@/presentation/NextBlockPreview';
export * from '@/presentation/NormalMode';
export * from '@/presentation/StageOverlay';
export * from '@/presentation/StreamMode';

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
 * CSS for one line, from the slot its language occupies in the song.
 *
 * The main slot is the baseline every line inherits — a translation is still the same song in
 * the same design — and the line's own slot layers on top of it. A language the song does not
 * list has no slot and gets the baseline alone.
 */
export const resolveLineLangCss = (
  language: string | undefined,
  langStyles: LanguageStyleEntry[] | undefined,
  songLanguages: string[] | undefined,
): CSSProperties => {
  if (!langStyles?.length) return {};

  const mainEntry = entryForSlot(langStyles, MAIN_LANGUAGE_SLOT);
  const slot = slotForLanguage(language, songLanguages);
  const slotEntry = slot === MAIN_LANGUAGE_SLOT ? undefined : entryForSlot(langStyles, slot);

  const css: CSSProperties = mainEntry ? langEntryToCss(mainEntry) : {};
  if (slotEntry) Object.assign(css, langEntryToCss(slotEntry));

  return css;
};

/**
 * Generate a content identity key for detecting **meaningful** content changes
 * (item-level only, not block switches, and NOT cosmetic display-only edits).
 *
 * Media entries are not part of it: they arrive as their own layers (`content.media`), each
 * keyed by its playback session.
 */
export const contentIdentityKey = (c: PresentationContent): string => `${c.contentType}|${c.bibleRef ?? ''}|${c.mediaColor ?? ''}`;

export { filterLinesByLanguage } from './lineFilter';

// The query string: a snapshot of this window's screen group taken when it was opened, so the
// first paint is right. What the window shows from then on is decided per window by the operator
// (see `applyUrlDefaults`). `languages` is deliberately not read back — an empty list means
// "every language", which is a decision, not a gap to fill from a stale snapshot.
const params = new URLSearchParams(window.location.search);
const urlMode = params.get('mode') as 'normal' | 'stream' | null;
const urlName = params.get('name');
const urlLines = params.get('lines');
const urlTransparent = params.get('transparent');
/** Bridge registry id, set when this page was opened by the operator as a popup. */
const urlWindowId = params.get('wid');
/**
 * An operator preview (an iframe in the operator view, or its pop-out window) rather than an
 * output: silent, without the dev banner, and never announced as a presentation window.
 */
const isPreview = params.get('preview') === '1';

if (isPreview) {
  // A preview must never be heard: every video it draws, now or later, stays muted.
  const mute = (node: Node) => {
    if (node instanceof HTMLMediaElement) node.muted = true;
    if (node instanceof Element) node.querySelectorAll('video, audio').forEach((media) => ((media as HTMLMediaElement).muted = true));
  };
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(mute))).observe(document.body, {
    childList: true,
    subtree: true,
  });
  // Something that unmutes a video later (a volume ramp) is undone on the spot.
  document.addEventListener('volumechange', (event) => mute(event.target as Node), true);
  document.body.style.cursor = 'default';
}

// Apply transparent background for OBS Browser Source
const el = document.getElementById('presentation-root')!;
if (urlTransparent === '1') {
  document.body.style.background = 'transparent';
  el.style.background = 'transparent';
}

// Create the root once
const root = createRoot(el);

// This window mounts its own root rather than going through mountRoot(), so it raises the
// dev banner itself. Compact: the page is the projection, and a labelled pill over the
// lyrics would be read as part of them. Never in transparent mode — there the window is a
// video source being composited into a stream, and a stripe would be baked into it.
if (urlTransparent !== '1' && !isPreview) {
  void showDevBanner({ compact: true });
}

// Track the last known content for re-render after identify
let lastProps: PresentationProps = { content: EMPTY_CONTENT };

/**
 * Fill in what the query string said, for anything the arriving content does not decide.
 *
 * The query string is a snapshot of the window's screen group taken when it was opened — it is
 * there so the first paint is right. Everything after that is resolved per window by the bridge
 * (`applyScreenGroup`), which knows the *current* group. Letting the query string win instead,
 * as this used to, froze a window's display mode and language list at open time: changing the
 * group afterwards did nothing, and a language list that no longer matched the song left the
 * window blank while every other output still showed the text.
 */
const applyUrlDefaults = (content: PresentationContent): PresentationContent => {
  const result = { ...content };
  if (!result.displayMode && urlMode) result.displayMode = urlMode;
  if (!result.windowName && urlName) result.windowName = urlName;
  if (result.streamLines === undefined && urlLines) result.streamLines = parseInt(urlLines, 10);
  // `languages` is deliberately not filled in: undefined means "every language", which is a
  // decision the group makes, not a gap to patch with a stale list.
  return result;
};

// Export a function to update the presentation.
// We coalesce updates to the next animation frame so multiple presentation
// windows that receive the same broadcast tick render on the same vsync
// boundary — eliminating the visible offset between windows during fast nav.
let pendingProps: PresentationProps | null = null;
let rafScheduled = false;
/**
 * The stage overlay is held separately from the content and merged in at render time.
 * The two arrive on different channels with different lifetimes: a slide change must not
 * reset a running countdown, and a cue change must not re-commit (and re-preload) the
 * slide. Keeping it out of `PresentationProps` on the wire is what makes that true.
 */
let currentStage: StageOverlayPayload = EMPTY_STAGE_PAYLOAD;
const commit = () => {
  rafScheduled = false;
  const props = pendingProps ?? lastProps;
  pendingProps = null;
  lastProps = props;
  root.render(<Presentation {...props} stage={currentStage} />);
};

const scheduleCommit = () => {
  // Transport commands must also reach an obscured browser output, whose animation
  // frames may be suspended. Every media element advances the shared clock itself.
  if (pendingProps?.content?.media?.background || pendingProps?.content?.media?.contents.length) {
    commit();
    return;
  }
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(commit);
};

/**
 * Apply a stage-overlay update.
 *
 * Deliberately skips the heavy-asset staging below: the overlay carries no assets, and
 * making a countdown wait for a background video to decode would be absurd.
 */
export const updateStage = (payload: StageOverlayPayload) => {
  currentStage = payload ?? EMPTY_STAGE_PAYLOAD;
  scheduleCommit();
};

export const updatePresentation = (props: PresentationProps) => {
  if (props.content && props.content !== EMPTY_CONTENT) {
    props = { ...props, content: applyUrlDefaults(props.content) };
  }
  pendingProps = props;
  scheduleCommit();
};

// ── Listen for messages from the main window ──

// Method 1: postMessage (browser mode)
window.addEventListener('message', (event) => {
  if (!event?.data) return;
  if (event.data.type === 'UPDATE_PRESENTATION') {
    updatePresentation(event.data.props);
  } else if (event.data.type === 'UPDATE_STAGE') {
    updateStage(event.data.payload);
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
    // A popped-out preview tells the operator view it can take content; it is not an output.
    (window.opener as Window).postMessage(isPreview ? { type: 'PREVIEW_READY' } : { type: 'PRESENTATION_READY', id: urlWindowId }, '*');
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

  window.presentationApi.onStageUpdate?.((data: unknown) => {
    updateStage(data as StageOverlayPayload);
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
    }
  });

  // Listeners are attached — anything main sent before this point never arrived.
  // This tells main to replay the last content, closing the startup race where a
  // restored window otherwise stayed black until the operator navigated.
  window.presentationApi.signalReady?.();
}

// Initial render (blank)
updatePresentation({ content: EMPTY_CONTENT });
