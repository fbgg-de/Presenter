import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { PresentationContent, PresentationLine } from './types';
import { styleToContainerCss, styleToTextCss, mergeStyles, DEFAULT_STYLE, type ResolvedStyle } from '@/utils/styleUtils';
import type { LanguageStyleEntry } from '@/api/styles.api';

/**
 * Build a CSS override object from a LanguageStyleEntry (only enabled properties).
 */
function langEntryToCss(entry: LanguageStyleEntry): CSSProperties {
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
}

/**
 * Resolve per-language CSS for a given line's language tag.
 * Returns default entry overrides plus language-specific overrides.
 */
function resolveLineLangCss(language: string | undefined, langStyles: LanguageStyleEntry[] | undefined): CSSProperties {
  if (!langStyles?.length) return {};
  const defaultEntry = langStyles.find((e) => e.language === '');
  const langEntry = language ? langStyles.find((e) => e.language === language.toLowerCase()) : undefined;
  const css: CSSProperties = defaultEntry ? langEntryToCss(defaultEntry) : {};
  if (langEntry) Object.assign(css, langEntryToCss(langEntry));
  return css;
}

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
const filterLinesByLanguage = (lines: PresentationLine[], languages?: string[]): PresentationLine[] => {
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

/**
 * Renders a block in normal mode (all visible lines).
 */
const NormalMode = ({
  block,
  textStyle,
  languages,
  langStyles,
}: {
  block: PresentationLine[];
  textStyle: CSSProperties;
  languages?: string[];
  langStyles?: LanguageStyleEntry[];
}) => {
  const filtered = filterLinesByLanguage(block, languages);

  return (
    <div className="presentation-block" style={{ width: '100%' }}>
      {filtered.map((line, i) => (
        <div
          key={i}
          className="presentation-line"
          data-lang={line.language || undefined}
          style={{
            ...textStyle,
            ...resolveLineLangCss(line.language, langStyles),
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
 * Renders content in stream mode — renders all lines in a flat scrollable list.
 * The active line is scrolled into view with smooth behavior.
 * Active lines are highlighted; others are dimmed.
 */
const StreamMode = ({
  blocks,
  activeBlockIndex,
  activeLineIndex,
  textStyle,
  languages,
  streamLines = 2,
  langStyles,
}: {
  blocks: PresentationLine[][];
  activeBlockIndex: number;
  activeLineIndex: number;
  textStyle: CSSProperties;
  languages?: string[];
  streamLines?: number;
  langStyles?: LanguageStyleEntry[];
}) => {
  // Build full flat list (filter + reorder per language preference)
  const allLines: PresentationLine[] = [];
  blocks.forEach((block) => {
    allLines.push(...filterLinesByLanguage(block, languages));
  });

  // Compute flat index: convert primary-line activeLineIndex to flat position
  let flatIndex = 0;
  for (let b = 0; b < activeBlockIndex && b < blocks.length; b++) {
    flatIndex += filterLinesByLanguage(blocks[b], languages).length;
  }
  if (activeBlockIndex < blocks.length) {
    const currentFiltered = filterLinesByLanguage(blocks[activeBlockIndex], languages);
    // Count primary lines to find flat position of activeLineIndex-th primary
    let primCount = 0;
    for (let i = 0; i < currentFiltered.length; i++) {
      if (!currentFiltered[i].language) {
        if (primCount === activeLineIndex) {
          flatIndex += i;
          break;
        }
        primCount++;
      }
    }
  }

  // Determine how many display lines each "semantic line" occupies (= language count)
  const visibleLanguages = new Set(allLines.map((l) => l.language ?? ''));
  const langCount = Math.max(1, visibleLanguages.size);
  const effectiveLines = streamLines * langCount;

  // Ref for the active line element — used for scrollIntoView
  const activeLineRef = useRef<HTMLDivElement>(null);
  const prevBlockIndexRef = useRef(activeBlockIndex);
  const prevFlatIndexRef = useRef(flatIndex);

  useEffect(() => {
    const blockChanged = prevBlockIndexRef.current !== activeBlockIndex;
    // Auto-advance: block increased by exactly 1 AND flatIndex moved forward → it was a nextLine crossing
    const wasAutoAdvance = blockChanged && activeBlockIndex === prevBlockIndexRef.current + 1 && flatIndex > prevFlatIndexRef.current;
    prevBlockIndexRef.current = activeBlockIndex;
    prevFlatIndexRef.current = flatIndex;
    // Smooth: line changes within block, or auto-advance. Instant: explicit block jump.
    activeLineRef.current?.scrollIntoView({ behavior: !blockChanged || wasAutoAdvance ? 'smooth' : 'instant', block: 'start' });
  }, [flatIndex, activeBlockIndex]);

  return (
    <div className="presentation-stream" style={{ width: '100%', overflow: 'hidden', position: 'relative' }}>
      {allLines.map((line, absIdx) => {
        const isActive = absIdx >= flatIndex && absIdx < flatIndex + effectiveLines;
        return (
          <div
            key={absIdx}
            ref={isActive && absIdx === flatIndex ? activeLineRef : undefined}
            className={`presentation-line ${isActive ? 'presentation-line-active' : 'presentation-line-preview'}`}
            data-lang={line.language || undefined}
            style={{
              ...textStyle,
              ...resolveLineLangCss(line.language, langStyles),
              ...(!isActive ? { opacity: 0.5 } : {}),
              ...(line.bold ? { fontWeight: 'bold' } : {}),
            }}
          >
            {line.text}
          </div>
        );
      })}
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
 * Next-block preview shown at the bottom of the presentation.
 * Shows the first primary line plus any translation lines that follow it.
 */
const NextBlockPreview = ({
  lines,
  color,
  opacity,
  textStyle,
  languages,
  langStyles,
}: {
  lines: PresentationLine[];
  color?: string;
  opacity?: number;
  textStyle: CSSProperties;
  languages?: string[];
  langStyles?: LanguageStyleEntry[];
}) => {
  const filtered = filterLinesByLanguage(lines, languages);
  if (filtered.length === 0) return null;

  return (
    <div
      className="presentation-next-preview"
      style={{
        width: '100%',
        opacity: opacity ?? 0.6,
      }}
    >
      {filtered.map((line, i) => (
        <div
          key={i}
          className="presentation-line"
          data-lang={line.language || undefined}
          style={{
            ...textStyle,
            ...resolveLineLangCss(line.language, langStyles),
            color: color || '#AAAAAA',
            ...(line.language ? { fontStyle: 'italic' } : {}),
          }}
        >
          {line.text}
        </div>
      ))}
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
const CopyrightOverlay = ({ content, resolvedStyle }: { content: PresentationContent; resolvedStyle?: ResolvedStyle }) => {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lastShownRef = useRef(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (content.showCopyright && !lastShownRef.current) {
      lastShownRef.current = true;
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      setMounted(true);
      // Two rAF frames to let mount complete before triggering CSS opacity transition
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      const duration = content.copyrightDisplayDuration ?? 3000;
      if (duration > 0) {
        const fadeTimer = setTimeout(() => {
          setVisible(false);
          unmountTimerRef.current = setTimeout(() => setMounted(false), 600);
        }, duration);
        return () => clearTimeout(fadeTimer);
      }
    } else if (!content.showCopyright && lastShownRef.current) {
      lastShownRef.current = false;
      setVisible(false);
      unmountTimerRef.current = setTimeout(() => setMounted(false), 600);
    }
    return undefined;
  }, [content.showCopyright, content.copyrightDisplayDuration]);

  if (!mounted) return null;

  // Build title line — show song number if enabled
  const showSongNumber = resolvedStyle?.copyrightShowSongNumber;
  let titleLine: string | undefined;
  if (content.title) {
    titleLine = showSongNumber && content.songNumber != null ? `(#${content.songNumber}) ${content.title}` : content.title;
  }

  const bodyLines: string[] = [];
  if (content.authors) bodyLines.push(content.authors);
  if (content.copyright) bodyLines.push(`© ${content.copyright}`);
  if (!titleLine && bodyLines.length === 0) return null;

  const baseFontSize = resolvedStyle?.copyrightFontSize ?? '2vh';
  const baseColor = resolvedStyle?.copyrightFontColor ?? '#FFFFFF';
  const baseFontFamily = resolvedStyle?.copyrightFontFamily
    ? `"${resolvedStyle.copyrightFontFamily}", Arial, sans-serif`
    : 'Arial, sans-serif';

  const copyrightStyle: CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: resolvedStyle?.copyrightPadding ?? '2vh 4vw',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
    color: baseColor,
    fontFamily: baseFontFamily,
    fontSize: baseFontSize,
    fontWeight: resolvedStyle?.copyrightFontBold ? 'bold' : undefined,
    fontStyle: resolvedStyle?.copyrightFontItalic ? 'italic' : undefined,
    textDecoration: resolvedStyle?.copyrightFontUnderline ? 'underline' : undefined,
    textAlign: resolvedStyle?.copyrightTextAlign ?? 'center',
    opacity: (resolvedStyle?.copyrightOpacity ?? 1) * (visible ? 1 : 0),
    zIndex: 100,
    transition: 'opacity 0.5s ease-in-out',
    pointerEvents: visible ? undefined : 'none',
  };

  // Title-specific overrides
  const titleStyle: CSSProperties = {
    fontSize: resolvedStyle?.copyrightTitleFontSize ?? baseFontSize,
    fontWeight: resolvedStyle?.copyrightTitleFontBold ? 'bold' : undefined,
    fontStyle: resolvedStyle?.copyrightTitleFontItalic ? 'italic' : undefined,
    textDecoration: resolvedStyle?.copyrightTitleFontUnderline ? 'underline' : undefined,
    marginBottom: titleLine && bodyLines.length > 0 ? (resolvedStyle?.copyrightTitleSpacing ?? '0') : undefined,
  };

  return (
    <div style={copyrightStyle}>
      {titleLine && <div style={titleStyle}>{titleLine}</div>}
      {bodyLines.map((line, i) => (
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
  const prevBgZoom =
    prevResolved.backgroundZoom && prevResolved.backgroundZoom !== 100 ? `scale(${prevResolved.backgroundZoom / 100})` : undefined;
  const prevVideoSize = prevResolved.backgroundVideoSize ?? prevResolved.backgroundSize;
  const prevVideoPosition = prevResolved.backgroundVideoPosition ?? prevResolved.backgroundPosition;
  const prevVideoZoom = prevResolved.backgroundVideoZoom ?? prevResolved.backgroundZoom;
  const prevVideoZoomTransform = prevVideoZoom && prevVideoZoom !== 100 ? `scale(${prevVideoZoom / 100})` : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        opacity,
        transition: `opacity ${transitionDuration}ms ease-in-out`,
        backgroundColor: prevContainerCss.backgroundColor || '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
      }}
    >
      {prevHasBgImage && (
        <img
          src={prevResolved.backgroundImage}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: videoObjectFit(prevResolved.backgroundSize),
            objectPosition: prevResolved.backgroundPosition || 'center',
            zIndex: 0,
            ...(prevBgZoom ? { transform: prevBgZoom, transformOrigin: prevResolved.backgroundPosition || 'center' } : {}),
          }}
        />
      )}
      {prevHasBgVideo && (
        <video
          src={prevResolved.backgroundVideo}
          autoPlay
          loop
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: videoObjectFit(prevVideoSize),
            objectPosition: prevVideoPosition || 'center',
            zIndex: 0,
            ...(prevVideoZoomTransform ? { transform: prevVideoZoomTransform, transformOrigin: prevVideoPosition || 'center' } : {}),
          }}
        />
      )}
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
              return <NormalMode block={prevBlock.lines} textStyle={prevTextCss} languages={prevContent.languages} />;
            })()
          )}
          {/* Include next-block preview in fade-out layer */}
          {prevContent.nextBlockPreviewLines && prevContent.nextBlockPreviewLines.length > 0 && (
            <NextBlockPreview
              lines={prevContent.nextBlockPreviewLines}
              color={prevContent.nextLinePreviewColor || prevResolved.nextLinePreviewColor}
              textStyle={prevTextCss}
              languages={prevContent.languages}
              langStyles={prevResolved.languageStyles}
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
  const bgZoomTransform =
    resolvedStyle.backgroundZoom && resolvedStyle.backgroundZoom !== 100 ? `scale(${resolvedStyle.backgroundZoom / 100})` : undefined;

  // Video uses its own size/position/zoom if set, falling back to the image ones.
  const videoSize = resolvedStyle.backgroundVideoSize ?? resolvedStyle.backgroundSize;
  const videoPosition = resolvedStyle.backgroundVideoPosition ?? resolvedStyle.backgroundPosition;
  const videoZoom = resolvedStyle.backgroundVideoZoom ?? resolvedStyle.backgroundZoom;
  const bgVideoZoomTransform = videoZoom && videoZoom !== 100 ? `scale(${videoZoom / 100})` : undefined;

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
  const isTextHidden = resolvedStyle.hideText || content.hideText || !!content.showCopyright;

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
              streamLines={content.streamLines}
              langStyles={resolvedStyle.languageStyles}
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
            langStyles={resolvedStyle.languageStyles}
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
        <FadeOutLayer key={fadeKey} prevContent={prevContent} transitionDuration={transitionDuration} videoObjectFit={videoObjectFit} />
      )}

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
            ...(resolvedStyle.backgroundBlur ? { filter: `blur(${resolvedStyle.backgroundBlur}px)` } : {}),
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
          muted={!resolvedStyle.backgroundVideoVolume || resolvedStyle.backgroundVideoVolume <= 0}
          playsInline
          ref={(el) => {
            if (!el) return;
            const targetVol =
              resolvedStyle.backgroundVideoVolume !== undefined ? Math.max(0, Math.min(1, resolvedStyle.backgroundVideoVolume)) : 1;
            const easeIn = resolvedStyle.backgroundVideoEaseIn ?? 0;
            if (easeIn > 0 && targetVol > 0) {
              el.volume = 0;
              const steps = Math.ceil(easeIn * 30);
              let step = 0;
              const interval = setInterval(
                () => {
                  step++;
                  el.volume = Math.min(targetVol, (step / steps) * targetVol);
                  if (step >= steps) clearInterval(interval);
                },
                (easeIn * 1000) / steps,
              );
            } else {
              el.volume = targetVol;
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: videoObjectFit(videoSize),
            objectPosition: videoPosition || 'center',
            zIndex: 0,
            ...(bgVideoZoomTransform ? { transform: bgVideoZoomTransform, transformOrigin: videoPosition || 'center' } : {}),
            ...(resolvedStyle.backgroundVideoBlur ? { filter: `blur(${resolvedStyle.backgroundVideoBlur}px)` } : {}),
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
          justifyContent:
            resolvedStyle.verticalAlign === 'top' ? 'flex-start' : resolvedStyle.verticalAlign === 'bottom' ? 'flex-end' : 'center',
          flexDirection: 'column',
          height: '100%',
          padding: contentPadding || 0,
          boxSizing: 'border-box',
          opacity: isTextHidden ? 0 : 1,
          transition: 'opacity 0.4s ease-in-out',
          pointerEvents: isTextHidden ? 'none' : undefined,
        }}
      >
        {renderContent()}
        {/* Next-block preview — hidden in stream mode */}
        {content.displayMode !== 'stream' && content.nextBlockPreviewLines && content.nextBlockPreviewLines.length > 0 && (
          <NextBlockPreview
            lines={content.nextBlockPreviewLines}
            color={
              content.nextLinePreviewColor ||
              resolvedStyle.nextLinePreviewColor ||
              resolvedStyle.languageStyles?.find((e) => e.language === '')?.nextLinePreviewColor
            }
            opacity={
              resolvedStyle.nextLinePreviewOpacity ?? resolvedStyle.languageStyles?.find((e) => e.language === '')?.nextLinePreviewOpacity
            }
            textStyle={textCss}
            languages={content.languages}
            langStyles={resolvedStyle.languageStyles}
          />
        )}
      </div>

      {/* Copyright overlay — always rendered so it can animate in/out */}
      {(content.showCopyright || content.title || content.authors || content.copyright) && (
        <CopyrightOverlay content={content} resolvedStyle={resolvedStyle} />
      )}

      {/* Custom CSS injection */}
      {resolvedStyle.css && <style>{resolvedStyle.css}</style>}

      {/* Window identification overlay */}
      {content.showIdentify && (
        <IdentifyOverlay windowName={content.windowName} windowNumber={content.windowNumber} styleName={content.identifyStyleName} />
      )}
    </div>
  );
};
