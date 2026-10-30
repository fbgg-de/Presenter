import { CSSProperties } from 'react';
import { PresentationLine } from '@/presentation/types';
import { LanguageStyleEntry } from '@/api/styles.api';
import { filterLinesByLanguage, resolveLineLangCss } from '@/presentation/index';
import { slotForLanguage } from '@/utils/languageSlots';
import { fitFont } from './ShrinkToFit';

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
  // A per-language size shrinks with the rest when the block does not fit (ShrinkToFit).
  const langCss = (language: string | undefined): CSSProperties => {
    const css = resolveLineLangCss(language, langStyles, songLanguages);
    return css.fontSize === undefined ? css : { ...css, fontSize: fitFont(css.fontSize) };
  };

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
            ...langCss(line.language),
            ...(line.bold ? { fontWeight: 'bold' } : {}),
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
};
