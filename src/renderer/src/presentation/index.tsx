import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Presentation, type PresentationProps } from '@/presentation/Presentation';
import type { PresentationContent } from '@/presentation/types';
import { EMPTY_CONTENT } from '@/presentation/types';

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

// Export a function to update the presentation
export const updatePresentation = (props: PresentationProps) => {
  // Apply URL overrides if content is present
  if (props.content && props.content !== EMPTY_CONTENT) {
    props = { ...props, content: applyUrlOverrides(props.content) };
  }
  lastProps = props;
  root.render(
    <StrictMode>
      <Presentation {...props} />
    </StrictMode>,
  );
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
    }
  });
}

// Initial render (blank)
updatePresentation({ content: EMPTY_CONTENT });
