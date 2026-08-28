import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Translate as TranslateIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSongsAllQuery, useLazyGetSongQuery, useUpdateSongMutation, type SongEntity } from '@/api/songs.api';
import { useAccountLanguages } from '@/hooks/useAccountLanguages';
import { useGetSettings } from '@/store/settingsSlice';
import { languageName } from '@/song/languageNames';
import { CONFIDENT_THRESHOLD, bestGuess, collectTextByLanguage, detectSongLanguages, hasUntaggedLines, tagUntaggedLines } from '@/song';

/** One song that still has untagged lines, with what the detector made of them. */
type Candidate = {
  song: SongEntity;
  /** Best guess for the untagged text, or undefined when there was nothing to go on. */
  guess?: string;
  confidence: number;
  /** What will actually be written — the guess until someone changes it. */
  chosen: string;
  /** Tags the song already carries, which stay exactly as they are. */
  existing: string[];
  untaggedSample: string;
};

/** How many songs to fetch at once. Enough to be quick, few enough not to swamp the API. */
const BATCH = 6;

/**
 * Gives every lyric line an explicit language tag across the whole library.
 *
 * Lines used to mark the default language by carrying no tag, which left the language of a
 * song's main lines unrecorded — fine while a library is all one language, useless once it is
 * not. This reads each song's untagged text, works out what language it is in, and writes the
 * tag. Nothing is guessed silently: the table below shows every song and its detected language
 * before anything is written, and songs the detector was unsure about are listed first.
 *
 * A song that already tags every line is skipped entirely, so this is safe to run again later
 * when new songs have come in.
 */
export const SongLanguageReview = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { LL } = useI18nContext();
  const { uiLanguage } = useGetSettings();
  const { available, defaultLanguage } = useAccountLanguages();

  const { data: allSongs } = useGetSongsAllQuery();
  const [fetchSong] = useLazyGetSongQuery();
  const [updateSong] = useUpdateSongMutation();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'ready' | 'applying' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!allSongs) return;

    setPhase('scanning');
    setError(null);
    setProgress({ done: 0, total: allSongs.length });

    const found: Candidate[] = [];
    let alreadyTagged = 0;

    for (let i = 0; i < allSongs.length; i += BATCH) {
      const slice = allSongs.slice(i, i + BATCH);
      const fetched = await Promise.all(
        slice.map(async (item) => {
          try {
            return await fetchSong({ songNumber: item.songNumber }).unwrap();
          } catch {
            // One unreadable song should not abandon the whole scan.
            return undefined;
          }
        }),
      );

      for (const song of fetched) {
        if (!song) continue;

        if (!hasUntaggedLines(song.blocks)) {
          alreadyTagged++;
          continue;
        }

        const untagged = collectTextByLanguage(song.blocks)[''] ?? '';
        const existing = detectSongLanguages(song.blocks);
        // The untagged lines cannot be in a language the song already tags separately, so
        // those are excluded from the candidates — which sharpens the choice considerably.
        const pool = available.filter((code) => !existing.includes(code));
        const guess = bestGuess(untagged, pool.length > 0 ? pool : available);

        found.push({
          song,
          guess: guess?.language,
          confidence: guess?.confidence ?? 0,
          chosen: guess?.language ?? defaultLanguage,
          existing,
          untaggedSample: untagged.split('\n').slice(0, 2).join(' / ').slice(0, 90),
        });
      }

      setProgress({ done: Math.min(i + BATCH, allSongs.length), total: allSongs.length });
    }

    // Unsure first — those are the ones actually worth a person's attention.
    found.sort((a, b) => a.confidence - b.confidence);

    setCandidates(found);
    setSkipped(alreadyTagged);
    setSelected(new Set(found.map((c) => c.song.songNumber)));
    setPhase('ready');
  }, [allSongs, available, defaultLanguage, fetchSong]);

  const apply = useCallback(async () => {
    setPhase('applying');
    setError(null);

    const chosen = candidates.filter((c) => selected.has(c.song.songNumber));
    setProgress({ done: 0, total: chosen.length });

    for (const [index, candidate] of chosen.entries()) {
      const { song, chosen: language, existing } = candidate;

      try {
        await updateSong({
          songNumber: song.songNumber,
          title: song.title,
          authors: song.authors,
          copyright: song.copyright,
          initialOrder: song.initialOrder ?? [],
          order: song.order,
          blocks: tagUntaggedLines(song.blocks, language),
          // The newly tagged lines are the song's default, so that language leads the list and
          // whatever the song already tagged follows it.
          languages: [language, ...existing.filter((code) => code !== language)],
        }).unwrap();
      } catch (e) {
        setError(String(e));
        setPhase('ready');
        return;
      }

      setProgress({ done: index + 1, total: chosen.length });
    }

    setPhase('done');
  }, [candidates, selected, updateSong]);

  const unsure = useMemo(() => candidates.filter((c) => c.confidence < CONFIDENT_THRESHOLD).length, [candidates]);

  const setChosen = (songNumber: number, language: string) =>
    setCandidates((current) => current.map((c) => (c.song.songNumber === songNumber ? { ...c, chosen: language } : c)));

  const toggle = (songNumber: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(songNumber)) next.delete(songNumber);
      else next.add(songNumber);
      return next;
    });

  const close = () => {
    if (phase === 'scanning' || phase === 'applying') return;
    setPhase('idle');
    setCandidates([]);
    setSelected(new Set());
    onClose();
  };

  const options = useMemo(() => {
    const extra = candidates.map((c) => c.chosen).filter((code) => code && !available.includes(code));
    return [...available, ...new Set(extra)];
  }, [available, candidates]);

  return (
    <Dialog open={open} onClose={close} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <TranslateIcon />
          {LL.SONG_LANGUAGE_REVIEW.TITLE()}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {phase === 'idle' && (
          <Stack sx={{ gap: 2 }}>
            <Typography variant="body2">{LL.SONG_LANGUAGE_REVIEW.INTRO()}</Typography>
            <Typography variant="caption" color="text.secondary">
              {LL.SONG_LANGUAGE_REVIEW.SCAN_HINT({ count: allSongs?.length ?? 0 })}
            </Typography>
          </Stack>
        )}

        {(phase === 'scanning' || phase === 'applying') && (
          <Stack sx={{ gap: 1 }}>
            <Typography variant="body2">
              {phase === 'scanning' ? LL.SONG_LANGUAGE_REVIEW.SCANNING() : LL.SONG_LANGUAGE_REVIEW.APPLYING()}
            </Typography>
            <LinearProgress variant="determinate" value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            <Typography variant="caption" color="text.secondary">
              {progress.done} / {progress.total}
            </Typography>
          </Stack>
        )}

        {phase === 'done' && <Alert severity="success">{LL.SONG_LANGUAGE_REVIEW.DONE({ count: progress.total })}</Alert>}

        {phase === 'ready' && (
          <Stack sx={{ gap: 2 }}>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip size="small" color="primary" label={LL.SONG_LANGUAGE_REVIEW.FOUND({ count: candidates.length })} />
              {unsure > 0 && <Chip size="small" color="warning" label={LL.SONG_LANGUAGE_REVIEW.UNSURE({ count: unsure })} />}
              {skipped > 0 && <Chip size="small" variant="outlined" label={LL.SONG_LANGUAGE_REVIEW.SKIPPED({ count: skipped })} />}
            </Stack>

            {candidates.length === 0 ? (
              <Alert severity="success">{LL.SONG_LANGUAGE_REVIEW.NOTHING_TO_DO()}</Alert>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>{LL.COMMON.TITLE()}</TableCell>
                      <TableCell>{LL.SONG_LANGUAGE_REVIEW.UNTAGGED_TEXT()}</TableCell>
                      <TableCell>{LL.SONG_LANGUAGE_REVIEW.ALREADY_TAGGED()}</TableCell>
                      <TableCell>{LL.SONG_LANGUAGE_REVIEW.DETECTED()}</TableCell>
                      <TableCell>{LL.SONG_LANGUAGE_REVIEW.ASSIGN()}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {candidates.map((candidate) => {
                      const sure = candidate.confidence >= CONFIDENT_THRESHOLD;

                      return (
                        <TableRow key={candidate.song.songNumber} hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={selected.has(candidate.song.songNumber)}
                              onChange={() => toggle(candidate.song.songNumber)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>
                              {candidate.song.title}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              {candidate.untaggedSample}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" sx={{ gap: 0.5 }}>
                              {candidate.existing.map((code) => (
                                <Chip key={code} size="small" variant="outlined" label={code} sx={{ fontFamily: 'monospace' }} />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {candidate.guess ? (
                              <Tooltip title={LL.SONG_LANGUAGE_REVIEW.CONFIDENCE({ percent: Math.round(candidate.confidence * 100) })}>
                                <Chip
                                  size="small"
                                  color={sure ? 'success' : 'warning'}
                                  variant={sure ? 'filled' : 'outlined'}
                                  label={`${candidate.guess} · ${Math.round(candidate.confidence * 100)}%`}
                                  sx={{ fontFamily: 'monospace' }}
                                />
                              </Tooltip>
                            ) : (
                              <Chip size="small" color="warning" variant="outlined" label={LL.SONG_LANGUAGE_REVIEW.NO_GUESS()} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              size="small"
                              value={candidate.chosen}
                              onChange={(event) => setChosen(candidate.song.songNumber, event.target.value)}
                              sx={{ minWidth: 150 }}
                            >
                              {options.map((code) => (
                                <MenuItem key={code} value={code}>
                                  {code} — {languageName(code, uiLanguage)}
                                </MenuItem>
                              ))}
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={close} disabled={phase === 'scanning' || phase === 'applying'}>
          {phase === 'done' ? LL.COMMON.CLOSE() : LL.COMMON.CANCEL()}
        </Button>
        {phase === 'idle' && (
          <Button variant="contained" onClick={scan} disabled={!allSongs?.length}>
            {LL.SONG_LANGUAGE_REVIEW.SCAN()}
          </Button>
        )}
        {phase === 'ready' && candidates.length > 0 && (
          <Button variant="contained" onClick={apply} disabled={selected.size === 0}>
            {LL.SONG_LANGUAGE_REVIEW.APPLY({ count: selected.size })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
