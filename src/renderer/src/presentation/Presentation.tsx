import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { PresentationContent, PresentationLine } from './types';
import { styleToContainerCss, styleToTextCss, mergeStyles, DEFAULT_STYLE, type ResolvedStyle } from '@/utils/styleUtils';

/**
 * Legacy props interface — kept for backward compatibility.
 * New code should use PresentationContent.
 */
export interface PresentationProps {
  block?: string[];
  title?: string;
  content?: PresentationContent;
}

/** Generate a content identity key for detecting meaningful changes (item level only, not block switches). */
function contentIdentityKey(c: PresentationContent): string {
  return `${c.contentType}|${c.mediaPath ?? ''}|${c.bibleRef ?? ''}|${c.mediaColor ?? ''}|${c.style?.backgroundImage ?? ''}|${c.style?.backgroundVideo ?? ''}|${c.style?.backgroundColor ?? ''}`;
}

/**
 * Filter lines by allowed languages.
 * If no language filter is set, all lines pass through.
 */
const filterLinesByLanguage = (lines: PresentationLine[], languages?: string[]): PresentationLine[] => {
  if (!languages || languages.length === 0) return lines;

  return lines.filter((line) => {
    // Lines without a language tag are always shown
    if (!line.language) return true;
    return languages.includes(line.language.toUpperCase());
  });
};

/**
 * Renders a block in normal mode (all visible lines).
 */
const NormalMode = ({ block, textStyle, languages }: { block: PresentationLine[]; textStyle: CSSProperties; languages?: string[] }) => {
  const filtered = filterLinesByLanguage(block, languages);

  return (
    <div className="presentation-block" style={{ width: '100%' }}>
      {filtered.map((line, i) => (
        <div
          key={i}
          className="presentation-line"
          style={{
            ...textStyle,
            ...(line.bold ? { fontWeight: 'bold' } : {}),
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
};

/**
 * Renders content in stream mode (two-line scrolling display).
 * Shows the active line and optionally the next line.
 */
const StreamMode = ({
  blocks,
  activeBlockIndex,
  activeLineIndex,
  textStyle,
  languages,
  streamLines = 2,
}: {
  blocks: PresentationLine[][];
  activeBlockIndex: number;
  activeLineIndex: number;
  textStyle: CSSProperties;
  languages?: string[];
  streamLines?: number;
}) => {
  // Flatten all blocks into a single line list for stream navigation
  const allLines: PresentationLine[] = [];
  blocks.forEach((block) => {
    const filtered = filterLinesByLanguage(block, languages);
    allLines.push(...filtered);
  });

  // Calculate the current flat line index
  let flatIndex = 0;
  for (let b = 0; b < activeBlockIndex && b < blocks.length; b++) {
    flatIndex += filterLinesByLanguage(blocks[b], languages).length;
  }
  if (activeBlockIndex < blocks.length) {
    const currentBlockFiltered = filterLinesByLanguage(blocks[activeBlockIndex], languages);
    flatIndex += Math.min(activeLineIndex, currentBlockFiltered.length - 1);
  }

  // Get the lines to display
  const displayLines = allLines.slice(Math.max(0, flatIndex), flatIndex + streamLines);

  return (
    <div className="presentation-stream" style={{ width: '100%' }}>
      {displayLines.map((line, i) => (
        <div
          key={`${flatIndex}-${i}`}
          className={`presentation-line ${i === 0 ? 'presentation-line-active' : 'presentation-line-preview'}`}
          style={{
            ...textStyle,
            ...(i > 0 ? { opacity: 0.6 } : {}),
            ...(line.bold ? { fontWeight: 'bold' } : {}),
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
};

/**
 * Renders a media item (image, video, or solid color).
 */
const MediaContent = ({ content }: { content: PresentationContent }) => {
  switch (content.mediaSubType) {
    case 'color':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: content.mediaColor || '#000000',
          }}
        />
      );
    case 'video':
      return content.mediaPath ? (
        <video
          src={content.mediaPath}
          autoPlay
          loop
          controls
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      ) : null;
    case 'image':
    default:
      return content.mediaPath ? (
        <img
          src={content.mediaPath}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : null;
  }
};

/**
 * Next-block preview line shown at the bottom of the presentation.
 */
const NextBlockPreview = ({
  lines,
  color,
  textStyle,
  languages,
}: {
  lines: PresentationLine[];
  color?: string;
  textStyle: CSSProperties;
  languages?: string[];
}) => {
  const filtered = filterLinesByLanguage(lines, languages);
  if (filtered.length === 0) return null;

  return (
    <div
      className="presentation-next-preview"
      style={{
        width: '100%',
        ...textStyle,
        color: color || '#AAAAAA',
      }}
    >
      {filtered[0].text}
    </div>
  );
};

/**
 * Window identification overlay.
 */
const IdentifyOverlay = ({ windowName, windowNumber, styleName }: { windowName?: string; windowNumber?: number; styleName?: string }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 9999,
        flexDirection: 'column',
        gap: '2vh',
      }}
    >
      {windowNumber != null && (
        <div
          style={{
            color: '#FFFFFF',
            fontSize: '16vh',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1,
            opacity: 0.3,
          }}
        >
          {windowNumber}
        </div>
      )}
      <div
        style={{
          color: '#FFFFFF',
          fontSize: '8vh',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          textAlign: 'center',
        }}
      >
        {windowName || 'Presentation'}
      </div>
      {styleName && (
        <div
          style={{
            color: '#AAAAAA',
            fontSize: '3vh',
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
          }}
        >
          Style: {styleName}
        </div>
      )}
    </div>
  );
};

/**
 * Bible verse display — renders reference as header and verse text as body.
 */
const BibleVerseContent = ({ content, textStyle }: { content: PresentationContent; textStyle: CSSProperties }) => {
  const block = content.blocks[content.activeBlockIndex];
  if (!block) return null;

  return (
    <div style={{ width: '100%' }}>
      {content.bibleRef && (
        <div
          style={{
            ...textStyle,
            fontSize: `calc(${textStyle.fontSize || '4vh'} * 1.2)`,
            fontWeight: 'bold',
            marginBottom: '2vh',
          }}
        >
          {content.bibleRef}
        </div>
      )}
      {block.lines.map((line, i) => (
        <div
          key={i}
          className="presentation-line"
          style={{
            ...textStyle,
            ...(line.bold ? { fontWeight: 'bold' } : {}),
          }}
        >
          {line.text}
        </div>
      ))}
      {content.bibleCopyright && (
        <div
          style={{
            ...textStyle,
            fontSize: `calc(${textStyle.fontSize || '4vh'} * 0.5)`,
            opacity: 0.5,
            marginTop: '3vh',
          }}
        >
          {content.bibleCopyright}
        </div>
      )}
    </div>
  );
};

/**
 * Copyright overlay — shown at the bottom when copyright block is selected.
 * Auto-hides after a configurable duration.
 */
const CopyrightOverlay = ({ content }: { content: PresentationContent }) => {
  const [visible, setVisible] = useState(false);
  const [lastShown, setLastShown] = useState(false);

  useEffect(() => {
    if (content.showCopyright && !lastShown) {
      setVisible(true);
      setLastShown(true);
      const duration = content.copyrightDisplayDuration ?? 3000;
      if (duration > 0) {
        const timer = setTimeout(() => setVisible(false), duration);
        return () => clearTimeout(timer);
      }
    } else if (!content.showCopyright) {
      setLastShown(false);
      setVisible(false);
    }
    return undefined;
  }, [content.showCopyright]);

  if (!visible) return null;

  const lines: string[] = [];
  if (content.title) lines.push(content.title);
  if (content.authors) lines.push(content.authors);
  if (content.copyright) lines.push(`© ${content.copyright}`);
  if (lines.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '2vh 4vw',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
        color: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
        fontSize: '2vh',
        textAlign: 'center',
        zIndex: 100,
        transition: 'opacity 0.5s ease-in-out',
        opacity: visible ? 1 : 0,
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
};

/**
 * Cross-fade layer: renders previous content and fades it out.
 * Uses a two-phase approach: mounts with opacity 1, then transitions to 0.
 */
const FadeOutLayer = ({
  prevContent,
  transitionDuration,
  videoObjectFit,
}: {
  prevContent: PresentationContent;
  transitionDuration: number;
  videoObjectFit: (size?: string) => CSSProperties['objectFit'];
}) => {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    // Start fade after mount (next frame)
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpacity(0));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const prevResolved: ResolvedStyle = mergeStyles(DEFAULT_STYLE, prevContent.style || {});
  const prevContainerCss = styleToContainerCss(prevResolved);
  const prevTextCss = styleToTextCss(prevResolved);
  const { padding: prevPadding } = prevContainerCss as CSSProperties & { padding?: string };
  const prevHasBgVideo = prevResolved.backgroundVideo && !prevResolved.hideBackground;
  const prevHasBgImage = prevResolved.backgroundImage && !prevResolved.hideBackground;
  const prevIsTextHidden = prevResolved.hideText || prevContent.hideText;
  const prevBgZoom = prevResolved.backgroundZoom && prevResolved.backgroundZoom !== 100
    ? `scale(${prevResolved.backgroundZoom / 100})` : undefined;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      opacity,
      transition: `opacity ${transitionDuration}ms ease-in-out`,
      backgroundColor: prevContainerCss.backgroundColor || '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      pointerEvents: 'none',
    }}>
      {prevHasBgImage && (
        <img src={prevResolved.backgroundImage} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: videoObjectFit(prevResolved.backgroundSize),
          objectPosition: prevResolved.backgroundPosition || 'center', zIndex: 0,
          ...(prevBgZoom ? { transform: prevBgZoom, transformOrigin: prevResolved.backgroundPosition || 'center' } : {}),
        }} />
      )}
      {prevHasBgVideo && (
        <video src={prevResolved.backgroundVideo} autoPlay loop muted playsInline style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: videoObjectFit(prevResolved.backgroundSize),
          objectPosition: prevResolved.backgroundPosition || 'center', zIndex: 0,
          ...(prevBgZoom ? { transform: prevBgZoom, transformOrigin: prevResolved.backgroundPosition || 'center' } : {}),
        }} />
      )}
      {!prevIsTextHidden && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', padding: prevPadding || 0, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', height: '100%' }}>
          {prevContent.contentType === 'media' ? <MediaContent content={prevContent} /> :
            prevContent.contentType === 'bible_verse' ? <BibleVerseContent content={prevContent} textStyle={prevTextCss} /> :
            (() => {
              const prevBlock = prevContent.blocks[prevContent.activeBlockIndex];
              if (!prevBlock) return null;
              return <NormalMode block={prevBlock.lines} textStyle={prevTextCss} languages={prevContent.languages} />;
            })()}
          {/* Include next-block preview in fade-out layer */}
          {prevContent.nextBlockPreviewLines && prevContent.nextBlockPreviewLines.length > 0 && (
            <NextBlockPreview
              lines={prevContent.nextBlockPreviewLines}
              color={prevContent.nextLinePreviewColor || prevResolved.nextLinePreviewColor}
              textStyle={prevTextCss}
              languages={prevContent.languages}
            />
          )}
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
  const { content, block: legacyBlock } = props;

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

  // Legacy mode — simple block rendering
  if (!content && legacyBlock) {
    return (
      <div
        className="presentation"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          backgroundColor: '#000',
          color: '#fff',
          fontFamily: 'Arial, sans-serif',
          fontSize: '4vh',
          textAlign: 'center',
          padding: '5% 10%',
        }}
      >
        {legacyBlock.map((line, index) => (
          <div key={index} className="presentation-line">
            {line}
          </div>
        ))}
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
        }}
      />
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

  // Background video from style
  const hasBackgroundVideo = resolvedStyle.backgroundVideo && !resolvedStyle.hideBackground;
  const hasBackgroundImage = resolvedStyle.backgroundImage && !resolvedStyle.hideBackground;

  // Map backgroundSize to objectFit for image/video elements
  const videoObjectFit = (size?: string): CSSProperties['objectFit'] => {
    if (size === 'contain' || size === '100% auto' || size === 'auto 100%' || size === 'auto') return 'contain';
    return 'cover';
  };

  // Build zoom transform (100 = 1x, 150 = 1.5x)
  const bgZoomTransform = resolvedStyle.backgroundZoom && resolvedStyle.backgroundZoom !== 100
    ? `scale(${resolvedStyle.backgroundZoom / 100})`
    : undefined;

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

  // Hide text if requested by the style OR by the content flag
  const isTextHidden = resolvedStyle.hideText || content.hideText;

  const renderContent = () => {
    if (isTextHidden) return null;

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
              streamLines={content.streamLines}
            />
          );
        }

        // Normal mode — show the active block
        const activeBlock = content.blocks[content.activeBlockIndex];
        if (!activeBlock) return null;

        return <NormalMode block={activeBlock.lines} textStyle={textCss} languages={content.languages} />;
      }
    }
  };

  return (
    <div className="presentation" style={containerStyle}>
      {/* Cross-fade: previous content fading out */}
      {fadePhase === 'fading' && prevContent && <FadeOutLayer
        key={fadeKey}
        prevContent={prevContent}
        transitionDuration={transitionDuration}
        videoObjectFit={videoObjectFit}
      />}

      {/* Background image layer */}
      {hasBackgroundImage && (
        <img
          src={resolvedStyle.backgroundImage}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: videoObjectFit(resolvedStyle.backgroundSize),
            objectPosition: resolvedStyle.backgroundPosition || 'center',
            zIndex: 0,
            ...(bgZoomTransform ? { transform: bgZoomTransform, transformOrigin: resolvedStyle.backgroundPosition || 'center' } : {}),
          }}
        />
      )}

      {/* Background video layer */}
      {hasBackgroundVideo && (
        <video
          key={contentIdentityKey(content)}
          src={resolvedStyle.backgroundVideo}
          autoPlay={resolvedStyle.backgroundVideoAutoplay !== false}
          loop
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: videoObjectFit(resolvedStyle.backgroundSize),
            objectPosition: resolvedStyle.backgroundPosition || 'center',
            zIndex: 0,
            ...(bgZoomTransform ? { transform: bgZoomTransform, transformOrigin: resolvedStyle.backgroundPosition || 'center' } : {}),
          }}
        />
      )}

      {/* Content layer */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: resolvedStyle.verticalAlign === 'top' ? 'flex-start' : resolvedStyle.verticalAlign === 'bottom' ? 'flex-end' : 'center',
          flexDirection: 'column',
          height: '100%',
          padding: contentPadding || 0,
          boxSizing: 'border-box',
        }}
      >
        {renderContent()}
        {/* Next-block preview — hidden when text is hidden */}
        {!isTextHidden && content.nextBlockPreviewLines && content.nextBlockPreviewLines.length > 0 && (
          <NextBlockPreview
            lines={content.nextBlockPreviewLines}
            color={content.nextLinePreviewColor || resolvedStyle.nextLinePreviewColor}
            textStyle={textCss}
            languages={content.languages}
          />
        )}
      </div>

      {/* Copyright overlay */}
      {content.showCopyright && <CopyrightOverlay content={content} />}

      {/* Custom CSS injection */}
      {resolvedStyle.css && <style>{resolvedStyle.css}</style>}

      {/* Window identification overlay */}
      {content.showIdentify && (
        <IdentifyOverlay windowName={content.windowName} windowNumber={content.windowNumber} styleName={content.identifyStyleName} />
      )}
    </div>
  );
};
