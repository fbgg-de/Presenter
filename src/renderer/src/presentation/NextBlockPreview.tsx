import { CSSProperties } from 'react';
import { PresentationLine } from '@/presentation/types';
import { LanguageStyleEntry } from '@/api/styles.api';
import { filterLinesByLanguage, resolveLineLangCss } from '@/presentation/index';
import { slotForLanguage } from '@/utils/languageSlots';

/**
 * Next-block preview shown at the bottom of the presentation.
 * Shows the first primary line plus any translation lines that follow it.
 */
export const NextBlockPreview = ({
  lines,
  color,
  opacity,
  textStyle,
  languages,
  songLanguages,
  langStyles,
  paragraphPadding,
}: {
  lines: PresentationLine[];
  color?: string;
  opacity?: number;
  textStyle: CSSProperties;
  languages?: string[];
  songLanguages?: string[];
  langStyles?: LanguageStyleEntry[];
  /** CSS padding shorthand around the preview paragraph (spacing towards the active block) */
  paragraphPadding?: string;
}) => {
  const filtered = filterLinesByLanguage(lines, languages, songLanguages?.[0]);
  if (filtered.length === 0) return null;

  return (
    <div
      className="presentation-next-preview"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        opacity: opacity ?? 0.6,
        ...(paragraphPadding ? { padding: paragraphPadding } : {}),
      }}
    >
      {filtered.map((line, i) => (
        <div
          key={i}
          className="presentation-line"
          data-lang={line.language || undefined}
          data-slot={slotForLanguage(line.language, songLanguages)}
          style={{
            ...textStyle,
            ...resolveLineLangCss(line.language, langStyles, songLanguages),
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
