import { useMemo, useState } from 'react';
import { Box, Button, Chip, ListItemText, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { ISO_639_1_CODES, isValidLanguageCode, languageName } from '@/song/languageNames';

export type LanguagePickerProps = {
  /** Codes already in the list — never offered again. */
  selected: string[];
  /**
   * Codes worth one tap: the account's own languages. They are the answer nearly every time,
   * so they sit on the surface and the rest of ISO 639-1 waits behind the button.
   */
  suggested?: string[];
  onAdd: (code: string) => void;
  disabled?: boolean;
};

/**
 * Adds a language to a list.
 *
 * This replaces an autocomplete, which asked for typing to reach an answer that is almost
 * always one of two or three codes, and left the chosen name sitting in the field afterwards.
 * A picker has no text state to leave behind: the common codes are chips, everything else is
 * behind one button, and both close the moment they are used.
 */
export const LanguagePicker = ({ selected, suggested = [], onAdd, disabled }: LanguagePickerProps) => {
  const { LL } = useI18nContext();
  const { uiLanguage } = useGetSettings();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');

  const chips = useMemo(() => suggested.filter((code) => !selected.includes(code)), [suggested, selected]);

  const label = (code: string) => {
    const name = languageName(code, uiLanguage);
    return name === code ? code : `${code} — ${name}`;
  };

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = ISO_639_1_CODES.filter((code) => !selected.includes(code));
    if (!needle) return pool;

    return pool.filter((code) => code.toLowerCase().startsWith(needle) || languageName(code, uiLanguage).toLowerCase().includes(needle));
  }, [query, selected, uiLanguage]);

  // The tag format takes two to five letters, so a regional or house code that ISO 639-1 has
  // never heard of is still legal, and typing it is the only way to reach it. Offered only once
  // the list has nothing left: while real matches are showing, "FREN" typed halfway through
  // "French" is a mistake waiting to be clicked, not an option.
  const custom = useMemo(() => {
    if (matches.length > 0) return null;

    const typed = query.trim().toUpperCase();

    return isValidLanguageCode(typed) && !selected.includes(typed) ? typed : null;
  }, [matches, query, selected]);

  const close = () => {
    setAnchor(null);
    setQuery('');
  };

  const pick = (code: string) => {
    onAdd(code);
    close();
  };

  return (
    <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
      {chips.map((code) => (
        <Tooltip key={code} title={LL.SONG_EDITOR.ADD_LANGUAGE_HINT({ name: languageName(code, uiLanguage) })}>
          <Chip
            size="small"
            variant="outlined"
            icon={<AddIcon sx={{ fontSize: 14 }} />}
            label={code}
            onClick={() => onAdd(code)}
            disabled={disabled}
            sx={{ fontFamily: 'monospace' }}
          />
        </Tooltip>
      ))}

      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon />}
        disabled={disabled}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ textTransform: 'none' }}
      >
        {chips.length > 0 ? LL.SONG_EDITOR.ADD_OTHER_LANGUAGE() : LL.SONG_EDITOR.ADD_LANGUAGE()}
      </Button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        // The search field takes the focus, so the list must not grab it back on open.
        autoFocus={false}
        slotProps={{ paper: { sx: { maxHeight: 360, width: 280 } } }}
      >
        <Box sx={{ px: 1, pb: 0.5, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={query}
            placeholder={LL.SONG_EDITOR.SEARCH_LANGUAGE()}
            onChange={(event) => setQuery(event.target.value)}
            // A menu moves focus to whatever item starts with the letter you typed. That is the
            // wrong instinct while typing into a search box inside it.
            onKeyDown={(event) => event.stopPropagation()}
          />
        </Box>

        {custom && (
          <MenuItem onClick={() => pick(custom)}>
            <ListItemText
              primary={LL.SONG_EDITOR.ADD_CUSTOM_LANGUAGE({ code: custom })}
              slotProps={{ primary: { sx: { fontFamily: 'monospace' } } }}
            />
          </MenuItem>
        )}

        {matches.map((code) => (
          <MenuItem key={code} onClick={() => pick(code)} sx={{ fontSize: '0.85rem' }}>
            {label(code)}
          </MenuItem>
        ))}

        {matches.length === 0 && !custom && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 1 }}>
            {LL.SONG_EDITOR.NO_LANGUAGE_MATCH()}
          </Typography>
        )}
      </Menu>
    </Stack>
  );
};
