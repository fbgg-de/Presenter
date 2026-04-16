import { useState, useEffect } from 'react';
import { Box, TextField, Stack, Typography, Slider, Paper } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';

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

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  }
  return [0, 0, 0];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  return (
    '#' +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
};

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  const { LL } = useI18nContext();
  const [rgb, setRgb] = useState<[number, number, number]>(hexToRgb(value));
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setRgb(hexToRgb(value));
    setHexInput(value);
  }, [value]);

  const handleRgbChange = (index: number, val: number) => {
    const newRgb: [number, number, number] = [...rgb];
    newRgb[index] = Math.max(0, Math.min(255, val));
    setRgb(newRgb);
    const hex = rgbToHex(newRgb[0], newRgb[1], newRgb[2]);
    setHexInput(hex);
    onChange(hex);
  };

  const handleHexChange = (hex: string) => {
    setHexInput(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setRgb(hexToRgb(hex));
      onChange(hex.toUpperCase());
    }
  };

  return (
    <Stack spacing={2}>
      {/* Color preview */}
      <Box
        sx={{
          width: '100%',
          height: 80,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          backgroundColor: value,
        }}
      />

      {/* Hex input */}
      <TextField
        label={LL.MEDIA.HEX_INPUT()}
        value={hexInput}
        onChange={(e) => handleHexChange(e.target.value)}
        size="small"
        fullWidth
        placeholder="#000000"
      />

      {/* RGB sliders */}
      <Stack spacing={1}>
        {(['R', 'G', 'B'] as const).map((channel, index) => (
          <Stack key={channel} direction="row" alignItems="center" spacing={2}>
            <Typography
              variant="body2"
              sx={{ width: 16, fontWeight: 600, color: channel === 'R' ? 'error.main' : channel === 'G' ? 'success.main' : 'info.main' }}
            >
              {channel}
            </Typography>
            <Slider
              value={rgb[index]}
              onChange={(_e, val) => handleRgbChange(index, val as number)}
              min={0}
              max={255}
              sx={{ flex: 1 }}
              size="small"
            />
            <Typography variant="body2" sx={{ width: 32, textAlign: 'right' }}>
              {rgb[index]}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {/* Preset swatches */}
      <Typography variant="caption" color="text.secondary">
        {LL.MEDIA.COLOR_PRESETS()}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {COLOR_PRESETS.map((preset) => (
          <Paper
            key={preset.value}
            onClick={() => {
              onChange(preset.value);
            }}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 0.5,
              backgroundColor: preset.value,
              cursor: 'pointer',
              border: 2,
              borderColor: value === preset.value ? 'primary.main' : 'divider',
              '&:hover': { borderColor: 'primary.light' },
            }}
            title={preset.name}
          />
        ))}
      </Box>
    </Stack>
  );
};
