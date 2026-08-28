import { CSSProperties } from 'react';
import { PresentationLine } from '@/presentation/types';
import { LanguageStyleEntry } from '@/api/styles.api';
import { filterLinesByLanguage, resolveLineLangCss } from '@/presentation/index';
import { slotForLanguage } from '@/utils/languageSlots';

/**
 * Renders a block in normal mode (all visible lines).
 */
export const NormalMode = ({
  block,
  textStyle,
  languages,
  songLanguages,
  langStyles,
  paragraphPadding,
}: {
  block: PresentationLine[];
  textStyle: CSSProperties;
  languages?: string[];
  songLanguages?: string[];
  langStyles?: LanguageStyleEntry[];
  /** CSS padding shorthand around the paragraph (spacing towards adjacent paragraphs) */
  paragraphPadding?: string;
}) => {
  const filtered = filterLinesByLanguage(block, languages, songLanguages?.[0]);

  return (
    <div
      className="presentation-block"
      style={{ width: '100%', boxSizing: 'border-box', ...(paragraphPadding ? { padding: paragraphPadding } : {}) }}
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
            ...(line.bold ? { fontWeight: 'bold' } : {}),
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
};
