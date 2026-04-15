/**
 * Font Picker — searchable font dropdown with system font detection
 * and font fallback cascade editor (§14.6).
 */
import { useState, useEffect, useCallback, HTMLAttributes } from 'react';
import { Autocomplete, Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Add as AddIcon, Warning as WarningIcon } from '@mui/icons-material';
import { WEB_SAFE_FONTS } from '@/utils/styleUtils';
import { useI18nContext } from '@/i18n/i18n-react';

/**
 * Detect available system fonts using document.fonts API + probing.
 * Returns a list of font names available on the current system.
 */
const detectSystemFonts = (): string[] => {
  const testFonts = [
    // Web safe + common system fonts
    ...WEB_SAFE_FONTS,
    // Windows
    'Segoe UI',
    'Segoe UI Symbol',
    'Consolas',
    'Lucida Sans Unicode',
    'Franklin Gothic Medium',
    'Bahnschrift',
    'Candara',
    'Corbel',
    'Sitka Text',
    'Yu Gothic',
    // macOS
    'SF Pro',
    'SF Pro Display',
    'SF Pro Text',
    'SF Mono',
    'Menlo',
    'Monaco',
    'Avenir',
    'Avenir Next',
    'Baskerville',
    'Cochin',
    'Copperplate',
    'Didot',
    'Futura',
    'Gill Sans',
    'Helvetica Neue',
    'Hoefler Text',
    'Marker Felt',
    'Optima',
    'Palatino',
    'Phosphate',
    'Rockwell',
    'Savoye LET',
    'SignPainter',
    // Linux
    'Ubuntu',
    'Cantarell',
    'Droid Sans',
    'Droid Serif',
    'Noto Sans',
    'Noto Serif',
    'Liberation Sans',
    'Liberation Serif',
    'Liberation Mono',
    'DejaVu Sans',
    'DejaVu Serif',
    // Popular Google Fonts
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Oswald',
    'Raleway',
    'Poppins',
    'Nunito',
    'Merriweather',
    'Playfair Display',
    'Source Sans Pro',
    'PT Sans',
    'Noto Sans',
    'Roboto Condensed',
    'Ubuntu',
    'Fira Sans',
    'Inter',
    'Quicksand',
    'Work Sans',
    'Rubik',
    'Karla',
    'Cabin',
    'Barlow',
    'Mulish',
    'Josefin Sans',
    'Arimo',
    'Libre Baskerville',
    'Bitter',
    'Crimson Text',
    'EB Garamond',
  ];

  // Deduplicate
  const unique = [...new Set(testFonts)];

  // Check availability using canvas-based font detection
  if (typeof document === 'undefined') return WEB_SAFE_FONTS;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return WEB_SAFE_FONTS;

  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';
  const baseline = 'monospace';

  ctx.font = `${testSize} ${baseline}`;
  const baselineWidth = ctx.measureText(testString).width;

  const available: string[] = [];
  for (const font of unique) {
    ctx.font = `${testSize} "${font}", ${baseline}`;
    const width = ctx.measureText(testString).width;
    if (width !== baselineWidth) {
      available.push(font);
    }
  }

  // Always include generic families
  return [...new Set([...available, 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])];
};

/** Check if a specific font is available */
const isFontAvailable = (fontName: string): boolean => {
  if (typeof document === 'undefined') return true;
  const generics = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
  if (generics.includes(fontName.toLowerCase())) return true;

  try {
    return document.fonts.check(`16px "${fontName}"`);
  } catch {
    return true; // Assume available if API not supported
  }
};

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
  label?: string;
  size?: 'small' | 'medium';
}

export const FontPicker = ({ value, onChange, label = 'Font Family', size = 'small' }: FontPickerProps) => {
  const [fonts, setFonts] = useState<string[]>(WEB_SAFE_FONTS);
  const { LL } = useI18nContext();

  useEffect(() => {
    // Try Electron system font enumeration first, then fall back to canvas detection
    const loadFonts = async () => {
      try {
        if (typeof window !== 'undefined' && window.api?.getSystemFonts) {
          const systemFonts = await window.api.getSystemFonts();
          if (systemFonts && systemFonts.length > 0) {
            setFonts([...new Set([...systemFonts, ...WEB_SAFE_FONTS])].sort((a, b) => a.localeCompare(b)));
            return;
          }
        }
      } catch {
        /* fallback to canvas detection */
      }
      const detected = detectSystemFonts();
      setFonts(detected.sort((a, b) => a.localeCompare(b)));
    };
    loadFonts();
  }, []);

  const fontMissing = value && !isFontAvailable(value);
  const labelText = label || LL.FONT_PICKER_LABEL();

  return (
    <Stack spacing={0.5}>
      <Autocomplete
        value={value || ''}
        onChange={(_, newValue) => onChange(newValue || '')}
        inputValue={value || ''}
        onInputChange={(_, newInput) => onChange(newInput)}
        options={fonts}
        freeSolo
        size={size}
        renderInput={(params) => (
          <TextField
            {...params}
            label={labelText}
            error={!!fontMissing}
            helperText={fontMissing ? LL.FONT_NOT_FOUND({ font: value }) : undefined}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...rest } = props as HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={key} {...rest}>
              <Typography sx={{ fontFamily: `"${option}", sans-serif` }}>{option}</Typography>
            </li>
          );
        }}
      />
    </Stack>
  );
};

interface FontFallbackEditorProps {
  fallbacks: string[];
  onChange: (fallbacks: string[]) => void;
}

export const FontFallbackEditor = ({ fallbacks, onChange }: FontFallbackEditorProps) => {
  const [newFont, setNewFont] = useState('');
  const [fonts] = useState(() => detectSystemFonts().sort((a, b) => a.localeCompare(b)));
  const { LL } = useI18nContext();

  const handleAdd = useCallback(() => {
    if (newFont.trim() && !fallbacks.includes(newFont.trim())) {
      onChange([...fallbacks, newFont.trim()]);
      setNewFont('');
    }
  }, [newFont, fallbacks, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(fallbacks.filter((_, i) => i !== index));
    },
    [fallbacks, onChange],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const arr = [...fallbacks];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      onChange(arr);
    },
    [fallbacks, onChange],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= fallbacks.length - 1) return;
      const arr = [...fallbacks];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      onChange(arr);
    },
    [fallbacks, onChange],
  );

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {LL.FONT_FALLBACK_CASCADE()}
      </Typography>

      {fallbacks.map((font, index) => {
        const missing = !isFontAvailable(font);
        return (
          <Stack key={`${font}-${index}`} direction="row" alignItems="center" spacing={0.5}>
            <Stack direction="column" spacing={0}>
              <IconButton size="small" onClick={() => handleMoveUp(index)} disabled={index === 0} sx={{ p: 0, fontSize: '0.7rem' }}>
                {LL.ARROW_UP()}
              </IconButton>
              <IconButton
                size="small"
                onClick={() => handleMoveDown(index)}
                disabled={index >= fallbacks.length - 1}
                sx={{ p: 0, fontSize: '0.7rem' }}
              >
                {LL.ARROW_DOWN()}
              </IconButton>
            </Stack>
            <Chip
              label={font}
              size="small"
              variant={missing ? 'outlined' : 'filled'}
              color={missing ? 'warning' : 'default'}
              icon={missing ? <WarningIcon fontSize="small" /> : undefined}
              onDelete={() => handleRemove(index)}
              sx={{ fontFamily: `"${font}", sans-serif` }}
            />
          </Stack>
        );
      })}

      <Stack direction="row" spacing={0.5}>
        <Autocomplete
          value={newFont}
          onChange={(_, val) => setNewFont(val || '')}
          inputValue={newFont}
          onInputChange={(_, val) => setNewFont(val)}
          options={fonts.filter((f) => !fallbacks.includes(f))}
          freeSolo
          size="small"
          sx={{ flex: 1 }}
          renderInput={(params) => <TextField {...params} placeholder={LL.ADD_FALLBACK_PLACEHOLDER()} size="small" />}
        />
        <Button size="small" onClick={handleAdd} disabled={!newFont.trim()} startIcon={<AddIcon />}>
          {LL.ADD()}
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
        {LL.FONT_FALLBACK_RESULT_PREFIX()} {fallbacks.length > 0 ? fallbacks.map((f) => `"${f}"`).join(', ') + ', ' : ''}
        {LL.SANS_SERIF()}
      </Typography>
    </Stack>
  );
};
