import { useState, useEffect } from 'react';
import { Box, TextField, Stack, Typography, Paper, Popover, IconButton } from '@mui/material';
import { HexColorPicker } from 'react-colorful';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeHex } from '@/utils';

const COLOR_PRESETS = [
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Cyan', value: '#00FFFF' },
  { name: 'Magenta', value: '#FF00FF' },
  { name: 'Dark Gray', value: '#333333' },
  { name: 'Light Gray', value: '#CCCCCC' },
  { name: 'Navy', value: '#001F3F' },
  { name: 'Teal', value: '#39CCCC' },
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

/**
 * Full color picker using `react-colorful` (HSV picker) plus hex input and presets.
 * Suitable for embedding in panels and dialogs.
 */
export const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  const { LL } = useI18nContext();
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexChange = (hex: string) => {
    setHexInput(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex.toUpperCase());
    }
  };

  return (
    <Stack spacing={2}>
      {/* Color preview */}
      <Box
        sx={{
          width: '100%',
          height: 60,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          backgroundColor: value,
        }}
      />

      {/* react-colorful HSV picker */}
      <Box sx={{ '& .react-colorful': { width: '100%', height: 180 } }}>
        <HexColorPicker color={normalizeHex(value)} onChange={(c) => onChange(c.toUpperCase())} />
      </Box>

      {/* Hex input */}
      <TextField
        label={LL.MEDIA.HEX_INPUT()}
        value={hexInput}
        onChange={(e) => handleHexChange(e.target.value)}
        size="small"
        fullWidth
        placeholder="#000000"
      />

      {/* Preset swatches */}
      <Typography variant="caption" color="text.secondary">
        {LL.MEDIA.COLOR_PRESETS()}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {COLOR_PRESETS.map((preset) => (
          <Paper
            key={preset.value}
            onClick={() => onChange(preset.value)}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 0.5,
              backgroundColor: preset.value,
              cursor: 'pointer',
              border: 2,
              borderColor: value.toUpperCase() === preset.value ? 'primary.main' : 'divider',
              '&:hover': { borderColor: 'primary.light' },
            }}
            title={preset.name}
          />
        ))}
      </Box>
    </Stack>
  );
};

interface ColorSwatchButtonProps {
  value: string;
  onChange: (color: string) => void;
  /** Optional clear handler — when provided, shows a small × button. */
  onClear?: () => void;
  ariaLabel?: string;
  size?: number;
}

/**
 * Compact swatch button that opens a popover with the full ColorPicker.
 * Use this inside dense forms (like the Style Editor).
 */
export const ColorSwatchButton = ({ value, onChange, onClear, ariaLabel, size = 32 }: ColorSwatchButtonProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box
        component="button"
        type="button"
        aria-label={ariaLabel}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          width: size,
          height: size,
          minWidth: size,
          borderRadius: 1,
          border: '2px solid',
          borderColor: 'divider',
          backgroundColor: value || '#000000',
          cursor: 'pointer',
          padding: 0,
          '&:hover': { borderColor: 'primary.main' },
        }}
      />
      {onClear && (
        <IconButton size="small" onClick={onClear} title="Clear">
          ×
        </IconButton>
      )}
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 2, width: 260 }}>
          <ColorPicker value={value} onChange={onChange} />
        </Box>
      </Popover>
    </Stack>
  );
};
