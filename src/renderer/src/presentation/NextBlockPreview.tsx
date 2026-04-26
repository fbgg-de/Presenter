import { PresentationLine } from '@/presentation/types';
import { CSSProperties } from 'react';
import { LanguageStyleEntry } from '@/api/styles.api';
import { filterLinesByLanguage, resolveLineLangCss } from '@/presentation/index';

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
