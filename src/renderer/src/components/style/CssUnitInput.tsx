import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  ClickAwayListener,
  InputAdornment,
  MenuItem,
  Paper,
  Popper,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Straighten as StraightenIcon } from '@mui/icons-material';

const CSS_UNITS = ['px', 'pt', 'em', 'rem', 'vh', 'vw', 'vmin', 'vmax', '%'] as const;
type CssUnit = (typeof CSS_UNITS)[number];

/** Parse a CSS value like "4vh" into { num: 4, unit: 'vh' }. */
function parseCssValue(value: string): { num: number; unit: CssUnit } {
  const match = value.match(/^(-?\d*\.?\d+)\s*(px|pt|em|rem|vh|vw|vmin|vmax|%)$/i);
  if (match) return { num: parseFloat(match[1]), unit: match[2].toLowerCase() as CssUnit };
  const num = parseFloat(value);
  if (!isNaN(num)) return { num, unit: 'px' };
  return { num: 0, unit: 'px' };
}

/** Default slider range per unit. */
function getDefaultRange(unit: CssUnit): { min: number; max: number; step: number } {
  switch (unit) {
    case 'px':
      return { min: 0, max: 200, step: 1 };
    case 'pt':
      return { min: 0, max: 144, step: 1 };
    case 'em':
      return { min: 0, max: 10, step: 0.1 };
    case 'rem':
      return { min: 0, max: 10, step: 0.1 };
    case 'vh':
    case 'vw':
    case 'vmin':
    case 'vmax':
      return { min: 0, max: 100, step: 0.5 };
    case '%':
      return { min: 0, max: 100, step: 1 };
    default:
      return { min: 0, max: 200, step: 1 };
  }
}

interface CssUnitInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Restrict available units. Default: all. */
  units?: CssUnit[];
  /** Width of the whole component */
  width?: number;
  placeholder?: string;
  /** Optional label shown above the input */
  label?: string;
  /** Custom range overrides per unit, e.g. { vmin: { min: 0, max: 50 } } */
  unitRanges?: Partial<Record<CssUnit, { min?: number; max?: number; step?: number }>>;
}

/**
 * Compact CSS size input: [number field + tune icon endadornment] [unit selector]
 * Clicking the tune icon opens a vertical slider Popper (no background).
 */
export const CssUnitInput = ({
  value,
  onChange,
  units = [...CSS_UNITS],
  width = 150,
  placeholder,
  label,
  unitRanges,
}: CssUnitInputProps) => {
  const parsed = parseCssValue(value);
  const [num, setNum] = useState(parsed.num);
  const [unit, setUnit] = useState<CssUnit>(parsed.unit);
  const [sliderOpen, setSliderOpen] = useState(false);
  const tuneRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    const p = parseCssValue(value);
    setNum(p.num);
    setUnit(p.unit);
  }, [value]);

  const emit = useCallback(
    (n: number, u: CssUnit) => {
      const formatted = Number.isInteger(n) ? `${n}${u}` : `${parseFloat(n.toFixed(2))}${u}`;
      onChange(formatted);
    },
    [onChange],
  );

  const handleNumChange = (n: number) => {
    setNum(n);
    emit(n, unit);
  };
  const handleUnitChange = (u: CssUnit) => {
    setUnit(u);
    emit(num, u);
  };

  const defaults = getDefaultRange(unit);
  const overrides = unitRanges?.[unit] ?? {};
  const range = { min: overrides.min ?? defaults.min, max: overrides.max ?? defaults.max, step: overrides.step ?? defaults.step };

  return (
    <Stack alignItems="center" spacing={0} sx={{ width, display: 'inline-flex' }}>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25, display: 'block', textAlign: 'center' }}>
          {label}
        </Typography>
      )}
      <Stack direction="row" spacing={0} sx={{ width: '100%' }}>
        <TextField
          ref={inputRef}
          size="small"
          type="number"
          value={num}
          onChange={(e) => handleNumChange(parseFloat(e.target.value) || 0)}
          placeholder={placeholder}
          slotProps={{
            htmlInput: { step: range.step },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Box
                    ref={tuneRef}
                    component="span"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSliderOpen((v) => !v);
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      color: 'text.secondary',
                      visibility: sliderOpen ? 'hidden' : 'visible',
                      '&:hover': { color: 'primary.main' },
                    }}
                  >
                    <StraightenIcon sx={{ fontSize: 16 }} />
                  </Box>
                </InputAdornment>
              ),
            },
          }}
          sx={{
            flex: 1,
            minWidth: 80,
            '& .MuiOutlinedInput-root': { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
            '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
            '& input[type=number]': { MozAppearance: 'textfield' },
          }}
        />
        <Select
          size="small"
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value as CssUnit)}
          sx={{
            minWidth: 62,
            '& .MuiOutlinedInput-notchedOutline': { borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
          }}
          renderValue={(v) => (
            <Typography variant="caption" fontWeight={600}>
              {v}
            </Typography>
          )}
        >
          {units.map((u) => (
            <MenuItem key={u} value={u} sx={{ fontSize: '0.8rem' }}>
              {u}
            </MenuItem>
          ))}
        </Select>
      </Stack>
      <Popper open={sliderOpen} anchorEl={tuneRef.current} placement="top-end" style={{ zIndex: 1400 }}>
        <ClickAwayListener onClickAway={() => setSliderOpen(false)}>
          <Paper elevation={0} sx={{ bgcolor: 'transparent', p: 0 }}>
            <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: -1, my: -1 }}>
              <Slider
                orientation="vertical"
                size="small"
                min={range.min}
                max={range.max}
                step={range.step}
                value={num}
                onChange={(_, v) => handleNumChange(v as number)}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}${unit}`}
                sx={{ height: '100%' }}
              />
            </Box>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Stack>
  );
};
