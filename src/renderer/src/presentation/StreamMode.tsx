import { useRef, useEffect, CSSProperties } from 'react';
import { PresentationLine } from '@/presentation/types';
import { LanguageStyleEntry } from '@/api/styles.api';
import { filterLinesByLanguage, resolveLineLangCss } from '@/presentation/index';

/**
 * Renders content in stream mode — renders all lines in a flat scrollable list.
 * The active line is scrolled into view with smooth behavior.
 * Active lines are highlighted; others are dimmed.
 */
export const StreamMode = ({
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
    // Multi-block jump: manually jumped over more than 1 block (e.g. clicking a specific block in control)
    const multiBlockJump = blockChanged && Math.abs(activeBlockIndex - prevBlockIndexRef.current) > 1;
    prevBlockIndexRef.current = activeBlockIndex;
    prevFlatIndexRef.current = flatIndex;
    // Smooth: line changes within block, auto-advance or single-step backwards.
    // Instant: only if jumping multiple blocks at once.
    activeLineRef.current?.scrollIntoView({
      behavior: !blockChanged || wasAutoAdvance || !multiBlockJump ? 'smooth' : 'instant',
      block: 'start',
    });
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
