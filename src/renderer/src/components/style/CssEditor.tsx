import { useMemo, useRef, type CSSProperties } from 'react';
import { Box } from '@mui/material';
import { tokeniseCss, type CssTokenType } from '@/utils/cssTokens';

/**
 * A monospaced CSS box with syntax colouring.
 *
 * The colouring is a `<pre>` sitting directly behind a transparent `<textarea>` — the standard
 * way to highlight an editable field without shipping a code-editor component. It only works
 * while both layers lay text out identically, so the font, size, line height, padding, wrapping
 * and border width below are shared between them rather than set twice; changing one and not
 * the other slides the colours out of line with the caret.
 */

/** One stack for both layers, so the two can never disagree about metrics. */
const MONO_FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace";

const SHARED: CSSProperties = {
  margin: 0,
  padding: '12px 14px',
  border: '1px solid transparent',
  fontFamily: MONO_FONT,
  fontSize: '0.8rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  tabSize: 2,
};

/** Theme palette paths, so the colouring follows light and dark like everything else. */
const TOKEN_COLOUR: Record<CssTokenType, string> = {
  comment: 'text.disabled',
  selector: 'primary.main',
  atrule: 'secondary.main',
  property: 'info.main',
  value: 'success.main',
  string: 'warning.main',
  punctuation: 'text.secondary',
};

export const CssEditor = ({
  value,
  onChange,
  placeholder,
  minRows = 12,
  readOnly = false,
}: {
  value: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  minRows?: number;
  readOnly?: boolean;
}) => {
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const tokens = useMemo(() => tokeniseCss(value), [value]);

  return (
    <Box
      sx={{
        position: 'relative',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: readOnly ? 'action.hover' : 'background.default',
        overflow: 'hidden',
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <Box
        component="pre"
        ref={highlightRef}
        aria-hidden
        sx={{ ...SHARED, position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
      >
        {tokens.map((token, index) => (
          <Box component="span" key={index} sx={{ color: TOKEN_COLOUR[token.type] }}>
            {token.text}
          </Box>
        ))}
        {/* A trailing newline keeps the last line scrollable into view when the caret is on it. */}
        {'\n'}
      </Box>

      <Box
        component="textarea"
        rows={minRows}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value)}
        onScroll={(event: React.UIEvent<HTMLTextAreaElement>) => {
          // The layers scroll as one; without this the colouring stays put as the text moves.
          const pre = highlightRef.current;
          if (!pre) return;
          pre.scrollTop = event.currentTarget.scrollTop;
          pre.scrollLeft = event.currentTarget.scrollLeft;
        }}
        sx={{
          ...SHARED,
          position: 'relative',
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          background: 'transparent',
          // The text itself is drawn by the layer underneath; only the caret and selection show.
          color: 'transparent',
          caretColor: (theme) => theme.palette.text.primary,
          outline: 'none',
          '&::placeholder': { color: 'text.disabled' },
          '&::selection': { bgcolor: 'primary.main', color: 'transparent' },
        }}
      />
    </Box>
  );
};
