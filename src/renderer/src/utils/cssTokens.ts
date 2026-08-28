/**
 * A very small CSS tokeniser, enough to colour the custom-CSS box.
 *
 * Deliberately not a parser: it never has to understand the CSS, only to say which run of
 * characters is a selector, a property, a value or a comment. That keeps it dependency-free —
 * a real highlighter would be a larger download than the entire style editor — and it means
 * malformed CSS still colours sensibly instead of failing, which matters in a box someone is
 * halfway through typing into.
 *
 * The one hard rule: concatenating every token's text must reproduce the input exactly. The
 * highlighted layer sits behind a transparent textarea, so a single dropped or added character
 * would slide the colouring out of line with the text the caret is in.
 */

export type CssTokenType = 'comment' | 'selector' | 'property' | 'value' | 'string' | 'punctuation' | 'atrule';

export type CssToken = { text: string; type: CssTokenType };

type Mode = 'selector' | 'property' | 'value';

const typeFor = (mode: Mode, text: string): CssTokenType => {
  if (mode === 'selector') return text.trimStart().startsWith('@') ? 'atrule' : 'selector';
  return mode;
};

export const tokeniseCss = (source: string): CssToken[] => {
  const tokens: CssToken[] = [];
  let buffer = '';
  let mode: Mode = 'selector';

  const flush = () => {
    if (buffer === '') return;
    tokens.push({ text: buffer, type: typeFor(mode, buffer) });
    buffer = '';
  };

  const push = (text: string, type: CssTokenType) => {
    flush();
    tokens.push({ text, type });
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    // Comments win everywhere, including mid-declaration.
    if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const stop = close === -1 ? source.length : close + 2;
      push(source.slice(i, stop), 'comment');
      i = stop - 1;
      continue;
    }

    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== char) {
        if (source[j] === '\\') j++;
        j++;
      }
      const stop = Math.min(j + 1, source.length);
      push(source.slice(i, stop), 'string');
      i = stop - 1;
      continue;
    }

    if (char === '{') {
      push('{', 'punctuation');
      mode = 'property';
      continue;
    }

    if (char === '}') {
      push('}', 'punctuation');
      mode = 'selector';
      continue;
    }

    // A colon only separates a declaration inside a block; in a selector it belongs to
    // something like `:hover` and is left as part of the selector text.
    if (char === ':' && mode === 'property') {
      push(':', 'punctuation');
      mode = 'value';
      continue;
    }

    if (char === ';') {
      push(';', 'punctuation');
      mode = mode === 'selector' ? 'selector' : 'property';
      continue;
    }

    buffer += char;
  }

  flush();

  return tokens;
};
