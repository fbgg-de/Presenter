import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { PresentationContent } from './types';
import type { StageOverlayPayload } from '@/stage/types';
import {
  styleToContainerCss,
  styleToTextCss,
  mergeStyles,
  DEFAULT_STYLE,
  resolveNextLinePreview,
  type ResolvedStyle,
} from '@/utils/styleUtils';
import {
  BibleVerseContent,
  contentIdentityKey,
  CopyrightOverlay,
  IdentifyOverlay,
  MediaContent,
  NextBlockPreview,
  NormalMode,
  StreamMode,
} from '@/presentation';
import { StageOverlay } from '@/presentation/StageOverlay';
import { StageScreen } from '@/presentation/StageScreen';
import { stageFrameFromContent } from '@/presentation/stageFrame';
import { MediaStack } from '@/media/CueMedia';

/**
 * Legacy props interface — kept for backward compatibility.
 * New code should use PresentationContent.
 */
export interface PresentationProps {
  title?: string;
  content?: PresentationContent;
  /**
   * Stage-monitor overlay. Passed alongside the content rather than inside it: the two
   * arrive on separate channels and must not reset one another.
   */
  stage?: StageOverlayPayload;
}

/** Mount at opacity 1, then fade to 0 on the next frame. */
const useFadeOut = () => {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpacity(0));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  return opacity;
};

/**
 * Cross-fade layer for the previous *content* (text or a colour entry). Media entries are not part
 * of it: they fade in their own layers.
 */
const FadeOutLayer = ({ prevContent, transitionDuration }: { prevContent: PresentationContent; transitionDuration: number }) => {
  const opacity = useFadeOut();

  const prevResolved: ResolvedStyle = mergeStyles(DEFAULT_STYLE, prevContent.style || {});
  const prevContainerCss = styleToContainerCss(prevResolved);
  const prevTextCss = styleToTextCss(prevResolved);
  const { padding: prevPadding } = prevContainerCss as CSSProperties & { padding?: string };
  const prevIsTextHidden = prevResolved.hideText || prevContent.hideText;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        opacity,
        transition: `opacity ${transitionDuration}ms ease-in-out`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
      }}
    >
      {!prevIsTextHidden && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            padding: prevPadding || 0,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {prevContent.contentType === 'media' ? (
            <MediaContent content={prevContent} />
          ) : prevContent.contentType === 'bible_verse' ? (
            <BibleVerseContent content={prevContent} textStyle={prevTextCss} />
          ) : (
            (() => {
              const prevBlock = prevContent.blocks[prevContent.activeBlockIndex];
              if (!prevBlock) return null;
              return (
                <NormalMode
                  block={prevBlock.lines}
                  textStyle={prevTextCss}
                  languages={prevContent.languages}
                  songLanguages={prevContent.songLanguages}
                  paragraphPadding={prevResolved.paragraphPadding}
                />
              );
            })()
          )}
          {/* Include next-block preview in fade-out layer */}
          {prevContent.nextBlockPreviewLines &&
            prevContent.nextBlockPreviewLines.length > 0 &&
            (() => {
              const preview = resolveNextLinePreview(prevResolved, true);
              return (
                preview.enabled && (
                  <NextBlockPreview
                    lines={prevContent.nextBlockPreviewLines}
                    color={prevContent.nextLinePreviewColor || preview.color}
                    opacity={preview.opacity}
                    layout={preview}
                    edgePadding={prevPadding}
                    textStyle={prevTextCss}
                    languages={prevContent.languages}
                    songLanguages={prevContent.songLanguages}
                    langStyles={prevResolved.languageStyles}
                    paragraphPadding={prevResolved.paragraphPadding}
                  />
                )
              );
            })()}
        </div>
      )}
    </div>
  );
};

/**
 * Main Presentation component.
 * Handles normal mode, stream mode, media, bible verses, and black screen.
 */
export const Presentation = (props: PresentationProps) => {
  const { content, stage } = props;

  // Check for transparent mode from URL params (OBS Browser Source)
  const isTransparent = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('transparent') === '1';

  // Black screen fade state
  const [visible, setVisible] = useState(true);

  // Cross-fade state: previous content is held during transitions
  const transitionMode = content?.transitionMode ?? 'cut';
  const transitionDuration = content?.transitionDuration ?? 500;
  const [prevContent, setPrevContent] = useState<PresentationContent | null>(null);
  const [fadePhase, setFadePhase] = useState<'idle' | 'fading'>('idle');
  const [fadeKey, setFadeKey] = useState(0);
  const prevKeyRef = useRef('');
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (content) {
      setVisible(!content.isBlack);
    }
  }, [content?.isBlack]);

  // Detect content changes for cross-fade
  const lastContentRef = useRef<PresentationContent | null>(null);
  useEffect(() => {
    if (!content || transitionMode !== 'fade') {
      lastContentRef.current = content || null;
      prevKeyRef.current = content ? contentIdentityKey(content) : '';
      return;
    }
    const newKey = contentIdentityKey(content);
    if (lastContentRef.current) {
      const oldKey = contentIdentityKey(lastContentRef.current);
      if (oldKey !== newKey) {
        setPrevContent(lastContentRef.current);
        setFadePhase('fading');
        setFadeKey((k) => k + 1);
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          setFadePhase('idle');
          setPrevContent(null);
        }, transitionDuration);
      }
    }
    lastContentRef.current = content;
    prevKeyRef.current = newKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content && contentIdentityKey(content), transitionMode, transitionDuration]);

  // A Stage group's window draws the stage screen — the audience theme does not apply there.
  if (content?.stageLayout && !content.showIdentify) {
    return (
      <div
        className="presentation"
        style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#050607' }}
      >
        <StageScreen frame={stageFrameFromContent(content)} settings={content.stageLayout} overlays={stage} isBlack={content.isBlack} />
      </div>
    );
  }

  if (!content || (content.contentType === 'empty' && !content.showIdentify)) {
    return (
      <div
        className="presentation"
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000',
          position: 'relative',
        }}
      >
        {/* A window that only carries a stage layer — a countdown before the service on an
            otherwise blank screen — never gets any content, so it lives entirely here. */}
        <StageOverlay payload={stage} />
      </div>
    );
  }

  // Empty content with identify overlay — render only the overlay
  if (content.contentType === 'empty' && content.showIdentify) {
    return (
      <div
        className="presentation"
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000',
          position: 'relative',
        }}
      >
        <StageOverlay payload={stage} />
        <IdentifyOverlay windowName={content.windowName} windowNumber={content.windowNumber} styleName={content.identifyStyleName} />
      </div>
    );
  }

  // Resolve style
  const resolvedStyle: ResolvedStyle = mergeStyles(DEFAULT_STYLE, content.style || {});
  const containerCss = styleToContainerCss(resolvedStyle);
  const textCss = styleToTextCss(resolvedStyle);

  // Extract padding from containerCss — it will be applied on the inner content div
  // so that vertical alignment (justifyContent) isn't offset by outer padding.
  const { padding: contentPadding, ...containerCssWithoutPadding } = containerCss as CSSProperties & { padding?: string };

  // Override background to transparent for OBS mode
  if (isTransparent) {
    containerCssWithoutPadding.backgroundColor = 'transparent';
    delete containerCssWithoutPadding.backgroundImage;
  }

  const transitionCss = transitionMode === 'fade' ? `${transitionDuration}ms ease-in-out` : '0.3s ease-in-out';

  const containerStyle: CSSProperties = {
    width: '100vw',
    height: '100vh',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: resolvedStyle.verticalAlign === 'top' ? 'flex-start' : resolvedStyle.verticalAlign === 'bottom' ? 'flex-end' : 'center',
    flexDirection: 'column',
    transition: `opacity ${transitionCss}`,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    ...containerCssWithoutPadding,
    // Apply black-screen opacity AFTER containerCss so it cannot be overridden by style opacity
    opacity: visible ? (containerCssWithoutPadding.opacity ?? 1) : 0,
  };

  // Hide text if requested by the style OR by the content flag OR when copyright overlay is active
  const isTextHidden = resolvedStyle.hideText || content.hideText || content.showCopyright;

  const renderContent = () => {
    switch (content.contentType) {
      case 'media':
        return <MediaContent content={content} />;

      case 'bible_verse':
        return <BibleVerseContent content={content} textStyle={textCss} />;

      case 'song':
      default: {
        if (content.displayMode === 'stream') {
          const blockLines = content.blocks.map((b) => b.lines);
          return (
            <StreamMode
              blocks={blockLines}
              activeBlockIndex={content.activeBlockIndex}
              activeLineIndex={content.activeLineIndex}
              textStyle={textCss}
              languages={content.languages}
              songLanguages={content.songLanguages}
              streamLines={content.streamLines}
              langStyles={resolvedStyle.languageStyles}
              paragraphPadding={resolvedStyle.paragraphPadding}
            />
          );
        }

        // Normal mode — show the active block
        const activeBlock = content.blocks[content.activeBlockIndex];
        if (!activeBlock) return null;

        return (
          <NormalMode
            block={activeBlock.lines}
            textStyle={textCss}
            languages={content.languages}
            songLanguages={content.songLanguages}
            langStyles={resolvedStyle.languageStyles}
            paragraphPadding={resolvedStyle.paragraphPadding}
          />
        );
      }
    }
  };

  return (
    <div
      className="presentation"
      style={containerStyle}
      onDoubleClick={() => {
        if (!document.fullscreenEnabled) return;
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }}
    >
      {/* Cross-fade: previous content fading out */}
      {fadePhase === 'fading' && prevContent && (
        <FadeOutLayer key={fadeKey} prevContent={prevContent} transitionDuration={transitionDuration} />
      )}

      {/* Media: a background behind the text, content above the background. Stacked by order, so
          the text layer (zIndex 1) stays on top. A hidden background arrives invisible and fades in its layer. */}
      <MediaStack packets={content.media?.background ? [content.media.background] : []} zIndex={0} />
      <MediaStack packets={content.media?.contents ?? []} zIndex={0} />

      {/* Content layer */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            resolvedStyle.verticalAlign === 'top' ? 'flex-start' : resolvedStyle.verticalAlign === 'bottom' ? 'flex-end' : 'center',
          flexDirection: 'column',
          height: '100%',
          padding: contentPadding || 0,
          boxSizing: 'border-box',
          opacity: isTextHidden ? 0 : 1,
          transition: 'opacity 0.4s ease-in-out',
          pointerEvents: 'none',
        }}
      >
        {renderContent()}
        {/* Next-block preview — hidden in stream mode */}
        {content.displayMode !== 'stream' &&
          content.nextBlockPreviewLines &&
          content.nextBlockPreviewLines.length > 0 &&
          (() => {
            // The lines only arrive when the operator's style shows the preview; this window's own
            // style can still switch it off.
            const preview = resolveNextLinePreview(resolvedStyle, true);
            return (
              preview.enabled && (
                <NextBlockPreview
                  lines={content.nextBlockPreviewLines}
                  color={content.nextLinePreviewColor || preview.color}
                  opacity={preview.opacity}
                  layout={preview}
                  edgePadding={contentPadding}
                  textStyle={textCss}
                  languages={content.languages}
                  songLanguages={content.songLanguages}
                  langStyles={resolvedStyle.languageStyles}
                  paragraphPadding={resolvedStyle.paragraphPadding}
                />
              )
            );
          })()}
      </div>

      {/* Copyright overlay — always rendered so it can animate in/out */}
      {(content.showCopyright || content.title) && <CopyrightOverlay content={content} resolvedStyle={resolvedStyle} />}

      {/* Custom CSS injection */}
      {resolvedStyle.css && <style>{resolvedStyle.css}</style>}

      {/* Stage monitor. Inside the container on purpose, so a blacked-out window goes
          fully dark; hiding the overlay on its own is a separate operator control. */}
      <StageOverlay payload={stage} />

      {/* Window identification overlay */}
      {content.showIdentify && (
        <IdentifyOverlay windowName={content.windowName} windowNumber={content.windowNumber} styleName={content.identifyStyleName} />
      )}
    </div>
  );
};
