import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Chip,
  Autocomplete,
  Box,
  IconButton,
  Divider,
} from '@mui/material';
import { MenuBook as MenuBookIcon, Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetBibleVersesQuery, useGetBibleTranslationsQuery } from '@/api/bible.api';
import { useGetSettings } from '@/store/settingsSlice';

interface BibleVersePickerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (bibleRef: string, bibleTranslation: string, label: string, text: string) => void;
}

export const BibleVersePicker = ({ open, onClose, onAdd }: BibleVersePickerProps) => {
  const { LL } = useI18nContext();

  const { bibleTranslation } = useGetSettings();

  const [reference, setReference] = useState('');
  const [translation, setTranslation] = useState(bibleTranslation);
  const [languageFilter, setLanguageFilter] = useState('');
  const [shouldFetch, setShouldFetch] = useState(false);

  // Fetch translations list
  const {
    data: translations,
    isLoading: translationsLoading,
    error: translationsError,
  } = useGetBibleTranslationsQuery(languageFilter ? { lang: languageFilter } : undefined);

  // Fetch verse only when user clicks search
  const {
    data: verseResult,
    isFetching: verseFetching,
    error: verseError,
  } = useGetBibleVersesQuery({ ref: reference, translation }, { skip: !shouldFetch || !reference.trim() });

  const handleSearch = () => {
    if (reference.trim()) {
      setShouldFetch(true);
    }
  };

  const handleAdd = () => {
    if (verseResult) {
      onAdd(verseResult.reference, verseResult.translation, `${verseResult.reference} (${verseResult.translation})`, verseResult.text);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setReference('');
    setShouldFetch(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <MenuBookIcon color="success" />
          <Typography variant="h6">{LL.BIBLE.VERSE()}</Typography>
          <Box flexGrow={1} />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Quick reference input */}
          <TextField
            label={LL.BIBLE.REFERENCE()}
            placeholder={LL.BIBLE.REFERENCE_PLACEHOLDER()}
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setShouldFetch(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            fullWidth
            autoFocus
          />

          {/* Translation and language filter row */}
          <Stack direction="row" spacing={2}>
            {/* Translation selector */}
            <Autocomplete
              options={translations ?? []}
              getOptionLabel={(option) => `${option.name} (${option.id})`}
              value={translations?.find((t) => t.id === translation) ?? null}
              onChange={(_e, value) => {
                if (value) {
                  setTranslation(value.id);
                  setShouldFetch(false);
                }
              }}
              loading={translationsLoading}
              sx={{ flex: 2 }}
              renderInput={(params) => <TextField {...params} label={LL.BIBLE.TRANSLATION()} size="small" />}
              isOptionEqualToValue={(option, value) => option.id === value.id}
            />

            {/* Language filter */}
            <TextField
              label={LL.BIBLE.FILTER_LANGUAGE()}
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              size="small"
              sx={{ flex: 1 }}
              placeholder="en, de..."
            />

            <Button variant="contained" onClick={handleSearch} disabled={!reference.trim()}>
              {LL.COMMON.SEARCH()}
            </Button>
          </Stack>

          {translationsError && <Alert severity="warning">{LL.BIBLE.NO_TRANSLATIONS()}</Alert>}

          <Divider />

          {/* Preview */}
          <Typography variant="subtitle2" color="text.secondary">
            {LL.BIBLE.PREVIEW()}
          </Typography>

          {verseFetching && (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>{LL.BIBLE.LOADING()}</Typography>
            </Box>
          )}

          {verseError && <Alert severity="error">{LL.BIBLE.FETCH_ERROR()}</Alert>}

          {verseResult && !verseFetching && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                {verseResult.reference}
              </Typography>
              <Chip label={verseResult.translation} size="small" color="primary" sx={{ mb: 2 }} />
              {verseResult.verses.length > 0 ? (
                <Stack spacing={0.5}>
                  {verseResult.verses.map((verse) => (
                    <Typography key={verse.number} variant="body1">
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{ mr: 0.5, fontWeight: 700, verticalAlign: 'super', fontSize: '0.7em' }}
                      >
                        {verse.number}
                      </Typography>
                      {verse.text}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body1">{verseResult.text}</Typography>
              )}
              {verseResult.copyright && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  {verseResult.copyright}
                </Typography>
              )}
            </Paper>
          )}

          {!verseResult && !verseFetching && !verseError && shouldFetch && <Alert severity="info">{LL.BIBLE.NO_RESULTS()}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={handleAdd} variant="contained" color="success" disabled={!verseResult} startIcon={<AddIcon />}>
          {LL.BIBLE.ADD_TO_SHOW()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
