import { PresentationLine } from '@/presentation/types';
import { LanguageStyleEntry } from '@/api/styles.api';
import { CSSProperties } from 'react';
import { filterLinesByLanguage, resolveLineLangCss } from '@/presentation/index';

/**
 * Renders a block in normal mode (all visible lines).
 */
export const NormalMode = ({
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
