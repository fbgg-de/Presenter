import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { useAccountLanguages } from '@/hooks/useAccountLanguages';
import { languageName } from '@/song/languageNames';
import {
  CONFIDENT_THRESHOLD,
  bestGuess,
  collectTextByLanguage,
  detectSongLanguages,
  hasUntaggedLines,
  tagUntaggedLines,
  type TBlocks,
} from '@/song';

export type ImportLanguageResult = { blocks: TBlocks; languages: string[] };

/** Resolves the language of an imported song, asking only when the guess is not good enough. */
export type ResolveImportLanguage = (blocks: TBlocks, title: string) => Promise<ImportLanguageResult | null>;

type Pending = {
  blocks: TBlocks;
  title: string;
  existing: string[];
  guess?: string;
  confidence: number;
  resolve: (result: ImportLanguageResult | null) => void;
};

/**
 * Gives an imported song's lyrics their language tags.
 *
 * Imported files rarely say what language they are in — a SongBeamer export just lists lines —
 * so the language is worked out from the text itself. A clear answer is applied without
 * interrupting the import; only a genuinely ambiguous one opens the dialog, and it opens with
 * the best guess already selected so confirming is one click.
 *
 * Returns the resolver together with the dialog to render. The dialog has to live in the
 * caller's tree, which is why this is not simply folded into the import functions.
 */
export const useImportLanguage = (): { resolveImportLanguage: ResolveImportLanguage; importLanguageDialog: ReactNode } => {
  const { LL } = useI18nContext();
  const { uiLanguage } = useGetSettings();
  const { available, defaultLanguage } = useAccountLanguages();

  const [pending, setPending] = useState<Pending | null>(null);
  const [choice, setChoice] = useState('');

  // The resolver is handed to import functions that are themselves memoised, so the current
  // pool has to be readable without making the callback identity change on every render.
  const poolRef = useRef({ available, defaultLanguage });
  poolRef.current = { available, defaultLanguage };

  const resolveImportLanguage = useCallback<ResolveImportLanguage>((blocks, title) => {
    const { available: pool, defaultLanguage: fallback } = poolRef.current;

    // Nothing untagged means the import already states its languages — leave it alone.
    if (!hasUntaggedLines(blocks)) {
      return Promise.resolve({ blocks, languages: detectSongLanguages(blocks) });
    }

    const existing = detectSongLanguages(blocks);
    // Untagged lines cannot be in a language the file already tags separately.
    const candidates = pool.filter((code) => !existing.includes(code));
    const guess = bestGuess(collectTextByLanguage(blocks)[''] ?? '', candidates.length > 0 ? candidates : pool);

    const finish = (language: string): ImportLanguageResult => ({
      blocks: tagUntaggedLines(blocks, language),
      languages: [language, ...existing.filter((code) => code !== language)],
    });

    if (guess && guess.confidence >= CONFIDENT_THRESHOLD) return Promise.resolve(finish(guess.language));

    return new Promise<ImportLanguageResult | null>((resolve) => {
      setChoice(guess?.language ?? fallback);
      setPending({
        blocks,
        title,
        existing,
        guess: guess?.language,
        confidence: guess?.confidence ?? 0,
        resolve: (result) => resolve(result),
      });
    }).finally(() => setPending(null));
  }, []);

  const confirm = () => {
    if (!pending) return;
    pending.resolve({
      blocks: tagUntaggedLines(pending.blocks, choice),
      languages: [choice, ...pending.existing.filter((code) => code !== choice)],
    });
  };

  const options = available.includes(choice) || !choice ? available : [choice, ...available];

  const importLanguageDialog = (
    <Dialog open={pending !== null} onClose={() => pending?.resolve(null)} maxWidth="xs" fullWidth>
      <DialogTitle>{LL.IMPORT_LANGUAGE.TITLE()}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          <DialogContentText>{LL.IMPORT_LANGUAGE.MESSAGE({ title: pending?.title ?? '' })}</DialogContentText>
          {pending?.guess ? (
            <Typography variant="caption" color="text.secondary">
              {LL.IMPORT_LANGUAGE.BEST_GUESS({
                language: languageName(pending.guess, uiLanguage),
                percent: Math.round(pending.confidence * 100),
              })}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {LL.IMPORT_LANGUAGE.NO_GUESS()}
            </Typography>
          )}
          <Select size="small" value={choice} onChange={(event) => setChoice(event.target.value)}>
            {options.map((code) => (
              <MenuItem key={code} value={code}>
                {code} — {languageName(code, uiLanguage)}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => pending?.resolve(null)}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={confirm} disabled={!choice}>
          {LL.COMMON.CONFIRM()}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { resolveImportLanguage, importLanguageDialog };
};
