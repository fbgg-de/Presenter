import { type CSSProperties, useEffect, useState } from 'react';
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
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
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
 * Main Presentation component.
 * Handles normal mode, stream mode, media, bible verses, and black screen.
 */
export const Presentation = (props: PresentationProps) => {
  const { content, block: legacyBlock } = props;

  // Check for transparent mode from URL params (OBS Browser Source)
  const isTransparent = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('transparent') === '1';

  // Black screen fade state
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (content) {
      setVisible(!content.isBlack);
    }
  }, [content?.isBlack]);

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

  // Override background to transparent for OBS mode
  if (isTransparent) {
    containerCss.backgroundColor = 'transparent';
    delete containerCss.backgroundImage;
  }

  // Background video from style
  const hasBackgroundVideo = resolvedStyle.backgroundVideo && !resolvedStyle.hideBackground;

  const containerStyle: CSSProperties = {
    width: '100vw',
    height: '100vh',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    transition: 'opacity 0.3s ease-in-out',
    ...containerCss,
    // Apply black-screen opacity AFTER containerCss so it cannot be overridden by style opacity
    opacity: visible ? (containerCss.opacity ?? 1) : 0,
  };

  const renderContent = () => {
    if (content.hideText) return null;

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
      {/* Background video layer */}
      {hasBackgroundVideo && (
        <video
          src={resolvedStyle.backgroundVideo}
          autoPlay
          loop
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
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
          justifyContent: 'center',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {renderContent()}
        {/* Next-block preview — rendered inline below content */}
        {content.nextBlockPreviewLines && content.nextBlockPreviewLines.length > 0 && (
          <NextBlockPreview
            lines={content.nextBlockPreviewLines}
            color={content.nextLinePreviewColor || resolvedStyle.nextLinePreviewColor}
            textStyle={textCss}
            languages={content.languages}
          />
        )}
      </div>

      {/* Custom CSS injection */}
      {resolvedStyle.css && <style>{resolvedStyle.css}</style>}

      {/* Window identification overlay */}
      {content.showIdentify && (
        <IdentifyOverlay windowName={content.windowName} windowNumber={content.windowNumber} styleName={content.identifyStyleName} />
      )}
    </div>
  );
};
