/**
 * Font Picker — searchable font dropdown with system font detection
 * and font fallback cascade editor (§14.6).
 */
import { useState, useEffect, HTMLAttributes } from 'react';
import { Autocomplete, Stack, TextField, Typography } from '@mui/material';
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
  const labelText = label || LL.FONT.PICKER_LABEL();

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
            helperText={fontMissing ? LL.FONT.NOT_FOUND({ font: value }) : undefined}
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
