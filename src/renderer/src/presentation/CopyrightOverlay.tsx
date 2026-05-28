import { CSSProperties, useEffect, useRef, useState } from 'react';
import { PresentationContent } from '@/presentation/types';
import { ResolvedStyle } from '@/utils/styleUtils';

/**
 * Copyright overlay — shown at the bottom when copyright block is selected.
 * Auto-hides after a configurable duration.
 */
export const CopyrightOverlay = ({ content, resolvedStyle }: { content: PresentationContent; resolvedStyle?: ResolvedStyle }) => {
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
      const duration = Math.max(1000, content.copyrightDisplayDuration ?? 3000);
      const fadeTimer = setTimeout(() => {
        setVisible(false);
        unmountTimerRef.current = setTimeout(() => setMounted(false), 600);
      }, duration);

      return () => clearTimeout(fadeTimer);
    } else if (!content.showCopyright && lastShownRef.current) {
      lastShownRef.current = false;
      setVisible(false);
      unmountTimerRef.current = setTimeout(() => setMounted(false), 600);
    }

    return undefined;
  }, [content.showCopyright, content.copyrightDisplayDuration]);

  if (!mounted || !content.title) {
    return null;
  }

  // Build title line — show song number if enabled
  const showSongNumber = resolvedStyle?.copyrightShowSongNumber;
  const titleLine = showSongNumber && content.songNumber != null ? `(#${content.songNumber}) ${content.title}` : content.title;

  const bodyLines: string[] = [];
  if (content.authors) {
    bodyLines.push(content.authors);
  }
  if (content.copyright) {
    bodyLines.push(content.copyright);
  }
  if (content.showLicenseNumber && content.license) {
    bodyLines.push(content.license);
  }

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
    pointerEvents: 'none',
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
