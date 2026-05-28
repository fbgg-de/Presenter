import { CSSProperties } from 'react';
import { PresentationContent } from '@/presentation/types';

/**
 * Bible verse display — renders reference as header and verse text as body.
 */
export const BibleVerseContent = ({ content, textStyle }: { content: PresentationContent; textStyle: CSSProperties }) => {
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
