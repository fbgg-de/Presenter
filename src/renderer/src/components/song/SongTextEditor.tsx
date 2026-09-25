import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Box, Button, Chip, Collapse, InputBase, Paper, Stack, Typography } from '@mui/material';
import { CheckCircleOutlined as OkIcon, ErrorOutlined as ProblemIcon, HelpOutlined as HelpIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { useIsMobile } from '@/hooks/useIsMobile';
import { languageName } from '@/song/languageNames';
import { SONG_BLOCK_SEPARATOR, songTextToBlocks, type SongTextProblem } from '@/song';
import { SectionLabel } from '@/components/operator/SectionLabel';

export type SongTextEditorProps = {
  text: string;
  /** Ordered song languages; the first is written untagged. */
  languages: string[];
  /** Name for lyrics written before the first heading, and the base for inserted headings. */
  defaultBlockName: string;
  onChange: (text: string) => void;
  /** Leaving the field applies the text (when it has no problems). */
  onCommit: (text: string) => void;
};

/** A snippet of the syntax, set like the textarea so the how-to reads as the same language. */
const Code = ({ children }: { children: ReactNode }) => (
  <Box
    component="code"
    sx={{
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      px: 0.75,
      py: 0.25,
      borderRadius: 0.75,
      bgcolor: 'action.hover',
      whiteSpace: 'nowrap',
      justifySelf: 'start',
    }}
  >
    {children}
  </Box>
);

/**
 * The whole song in one textarea, with the syntax explained beside it.
 *
 * The text is a draft owned by the song editor; it is applied when the field loses focus, and only
 * when the live check finds no problems — so a half-typed heading never renames or removes a block.
 */
export const SongTextEditor = ({ text, languages, defaultBlockName, onChange, onCommit }: SongTextEditorProps) => {
  const { LL } = useI18nContext();
  const { uiLanguage } = useGetSettings('uiLanguage');
  const isMobile = useIsMobile();
  const [helpOpen, setHelpOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const result = useMemo(() => songTextToBlocks(text, languages, defaultBlockName), [text, languages, defaultBlockName]);
  const translations = languages.slice(1);

  const problemText = (problem: SongTextProblem): string => {
    switch (problem.kind) {
      case 'duplicate':
        return LL.SONG_EDITOR.TEXT_PROBLEM_DUPLICATE({ line: problem.line, name: problem.name });
      case 'empty_name':
        return LL.SONG_EDITOR.TEXT_PROBLEM_EMPTY_NAME({ line: problem.line });
      case 'unknown_language':
        return LL.SONG_EDITOR.TEXT_PROBLEM_LANGUAGE({ line: problem.line, code: problem.code });
    }
  };

  /** Replace a range and put the caret (or a selection) where the insert wants it. */
  const replace = (from: number, to: number, snippet: string, select: [number, number]) => {
    const element = ref.current;
    onChange(text.slice(0, from) + snippet + text.slice(to));
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(from + select[0], from + select[1]);
    });
  };

  const caret = () => ref.current?.selectionStart ?? text.length;
  const lineStartAt = (at: number) => text.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const lineEndAt = (at: number) => {
    const end = text.indexOf('\n', at);
    return end === -1 ? text.length : end;
  };

  /** A new heading below the caret's line, with its name selected for typing over. */
  const insertHeading = () => {
    const taken = new Set(result.blocks.map((block) => block.name));
    let name = defaultBlockName;
    for (let i = 2; taken.has(name); i++) name = `${defaultBlockName} ${i}`;

    const at = caret();
    const start = lineStartAt(at);
    const end = lineEndAt(at);
    const lineIsEmpty = text.slice(start, end).trim() === '';
    if (lineIsEmpty) {
      replace(start, end, `# ${name}\n`, [2, 2 + name.length]);
    } else {
      const prefix = `\n\n# `;
      replace(end, end, `${prefix}${name}\n`, [prefix.length, prefix.length + name.length]);
    }
  };

  const insertSeparator = () => {
    const end = lineEndAt(caret());
    const snippet = `\n${SONG_BLOCK_SEPARATOR}\n`;
    replace(end, end, snippet, [snippet.length, snippet.length]);
  };

  /** A translation belongs under the caret's line, so it opens a line below it. */
  const insertTranslation = (code: string) => {
    const end = lineEndAt(caret());
    const snippet = `\n[${code.toLowerCase()}] `;
    replace(end, end, snippet, [snippet.length, snippet.length]);
  };

  /** Buttons keep the textarea focused, so inserting never triggers the apply-on-blur. */
  const keepFocus = { onMouseDown: (e: MouseEvent) => e.preventDefault() };

  const help = (
    <Stack sx={{ gap: 1.5 }}>
      <SectionLabel>{LL.SONG_EDITOR.TEXT_HELP_TITLE()}</SectionLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 1, alignItems: 'baseline' }}>
        <Code># {defaultBlockName}</Code>
        <Typography variant="body2">{LL.SONG_EDITOR.TEXT_HELP_BLOCK()}</Typography>
        <Code>{SONG_BLOCK_SEPARATOR}</Code>
        <Typography variant="body2">{LL.SONG_EDITOR.TEXT_HELP_PAGE()}</Typography>
        <Code>[{(translations[0] ?? 'en').toLowerCase()}] …</Code>
        <Typography variant="body2">
          {translations.length > 0
            ? LL.SONG_EDITOR.TEXT_HELP_TRANSLATION({ language: languageName(translations[0], uiLanguage) })
            : LL.SONG_EDITOR.TEXT_HELP_NO_TRANSLATION()}
        </Typography>
        <Code>{LL.SONG_EDITOR.TEXT_HELP_EMPTY_LINE()}</Code>
        <Typography variant="body2">{LL.SONG_EDITOR.TEXT_HELP_EMPTY()}</Typography>
      </Box>

      <SectionLabel>{LL.SONG_EDITOR.TEXT_NOTES_TITLE()}</SectionLabel>
      <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {[
          LL.SONG_EDITOR.TEXT_NOTE_APPLY(),
          LL.SONG_EDITOR.TEXT_NOTE_RENAME(),
          LL.SONG_EDITOR.TEXT_NOTE_REMOVE(),
          LL.SONG_EDITOR.TEXT_NOTE_ORDER(),
        ].map((note) => (
          <Typography key={note} component="li" variant="caption" sx={{ color: 'text.secondary' }}>
            {note}
          </Typography>
        ))}
      </Box>
    </Stack>
  );

  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2, alignItems: 'stretch' }}>
        <Stack sx={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {LL.SONG_EDITOR.TEXT_INSERT()}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`# ${LL.SONG_EDITOR.TEXT_INSERT_BLOCK()}`}
              onClick={insertHeading}
              {...keepFocus}
              sx={{ fontFamily: 'monospace' }}
            />
            <Chip
              size="small"
              variant="outlined"
              label={SONG_BLOCK_SEPARATOR}
              onClick={insertSeparator}
              {...keepFocus}
              sx={{ fontFamily: 'monospace' }}
            />
            {translations.map((code) => (
              <Chip
                key={code}
                size="small"
                variant="outlined"
                label={`[${code.toLowerCase()}]`}
                onClick={() => insertTranslation(code)}
                {...keepFocus}
                sx={{ fontFamily: 'monospace' }}
              />
            ))}
            {isMobile && (
              <Button
                size="small"
                color="inherit"
                startIcon={<HelpIcon />}
                onClick={() => setHelpOpen((open) => !open)}
                sx={{ ml: 'auto' }}
              >
                {LL.SONG_EDITOR.TEXT_HELP_TITLE()}
              </Button>
            )}
          </Stack>

          <InputBase
            multiline
            minRows={isMobile ? 12 : 22}
            inputRef={ref}
            value={text}
            onChange={({ target }) => onChange(target.value)}
            onBlur={() => onCommit(text)}
            inputProps={{ spellCheck: false, 'aria-label': LL.SONG_EDITOR.TEXT_TAB() }}
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              border: 1,
              borderColor: result.problems.length > 0 ? 'error.main' : 'divider',
              borderRadius: 1,
              p: 1.25,
              alignItems: 'flex-start',
              '&.Mui-focused': { borderColor: result.problems.length > 0 ? 'error.main' : 'primary.main' },
            }}
          />

          {result.problems.length > 0 ? (
            <Stack sx={{ gap: 0.25 }} role="status">
              {result.problems.slice(0, 3).map((problem) => (
                <Stack
                  key={`${problem.kind}-${problem.line}`}
                  direction="row"
                  sx={{ gap: 0.75, alignItems: 'center', color: 'error.main' }}
                >
                  <ProblemIcon sx={{ fontSize: 16 }} />
                  <Typography variant="caption">{problemText(problem)}</Typography>
                </Stack>
              ))}
              <Typography variant="caption" sx={{ color: 'text.secondary', pl: 3 }}>
                {result.problems.length > 3 && `${LL.SONG_EDITOR.TEXT_MORE_PROBLEMS({ count: result.problems.length - 3 })} · `}
                {LL.SONG_EDITOR.TEXT_NOT_APPLIED()}
              </Typography>
            </Stack>
          ) : (
            <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', color: 'success.main' }} role="status">
              <OkIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">
                {[
                  LL.SONG_EDITOR.TEXT_STATUS_BLOCKS({ count: result.blocks.length }),
                  LL.SONG_EDITOR.TEXT_STATUS_SLIDES({ count: result.slides }),
                  ...(languages.length > 0 ? [languages.map((code) => code.toLowerCase()).join(', ')] : []),
                ].join(' · ')}
              </Typography>
            </Stack>
          )}
        </Stack>

        {isMobile ? (
          <Collapse in={helpOpen}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              {help}
            </Paper>
          </Collapse>
        ) : (
          <Paper variant="outlined" sx={{ p: 1.75, width: 320, flexShrink: 0, alignSelf: 'flex-start' }}>
            {help}
          </Paper>
        )}
      </Stack>
    </Stack>
  );
};
