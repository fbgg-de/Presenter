import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { RestartAlt as ResetIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { formatBoxShorthand, parseBoxShorthand, type BoxSides } from '@/utils/cssBox';

/** One nesting level of the box: the slide's own padding, or the padding around a paragraph. */
export type BoxLayer = {
  label: string;
  /** CSS shorthand as stored. */
  value: string;
  /** Whether this style sets it, or inherits it. */
  enabled: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  /** Shown behind the value when the style does not set it. */
  placeholder: string;
};

/**
 * One side of one box. Deliberately a plain text field rather than a value-plus-unit pair: a
 * box model is read at a glance, and eight dropdowns would bury the shape it is meant to show.
 * Any CSS length can still be typed, including `vh`, `%` and `px`.
 */
const SideInput = ({
  value,
  placeholder,
  dimmed,
  onCommit,
}: {
  value: string;
  placeholder: string;
  dimmed: boolean;
  onCommit: (next: string) => void;
}) => (
  <TextField
    size="small"
    variant="standard"
    defaultValue={value}
    placeholder={placeholder}
    // Committed on blur and Enter rather than per keystroke, so a half-typed "1v" is never
    // written into the style and echoed back as a broken length.
    onBlur={(event) => onCommit(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
    }}
    slotProps={{
      input: { disableUnderline: true },
      htmlInput: { style: { textAlign: 'center', fontFamily: 'monospace', fontSize: '0.7rem', padding: '2px 0' } },
    }}
    sx={{ width: 54, opacity: dimmed ? 0.55 : 1, '& .MuiInputBase-root': { bgcolor: 'background.default', borderRadius: 0.5 } }}
  />
);

/** A single nesting level, drawn as a labelled frame with one input per side. */
const Layer = ({ layer, tint, children }: { layer: BoxLayer; tint: string; children: React.ReactNode }) => {
  const { LL } = useI18nContext();
  const sides = parseBoxShorthand(layer.enabled ? layer.value : '', '');
  const inherited = parseBoxShorthand(layer.placeholder, '0');

  // Editing any side writes the whole shorthand back, and turns the property on: reaching for a
  // value is the same gesture as deciding to set it.
  const setSide = (side: keyof BoxSides, next: string) => {
    const merged = { ...parseBoxShorthand(layer.enabled ? layer.value : layer.placeholder, '0'), [side]: next || '0' };
    const shorthand = formatBoxShorthand(merged);
    if (shorthand !== layer.value || !layer.enabled) layer.onChange(shorthand);
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: tint, p: 0.75, pt: 0.25, position: 'relative' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', flexGrow: 1, fontSize: '0.65rem', letterSpacing: 0.4 }}>
          {layer.label}
        </Typography>
        {layer.enabled && (
          <Tooltip title={LL.STYLE.RESET_TO_INHERITED()}>
            <IconButton size="small" onClick={layer.onReset} sx={{ p: 0.25, opacity: 0.4, '&:hover': { opacity: 1 } }}>
              <ResetIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          justifyItems: 'center',
          gap: 0.5,
        }}
      >
        <Box />
        <SideInput
          key={`top-${layer.enabled}-${sides.top}`}
          value={sides.top}
          placeholder={inherited.top}
          dimmed={!layer.enabled}
          onCommit={(next) => setSide('top', next)}
        />
        <Box />

        <SideInput
          key={`left-${layer.enabled}-${sides.left}`}
          value={sides.left}
          placeholder={inherited.left}
          dimmed={!layer.enabled}
          onCommit={(next) => setSide('left', next)}
        />
        <Box sx={{ width: '100%' }}>{children}</Box>
        <SideInput
          key={`right-${layer.enabled}-${sides.right}`}
          value={sides.right}
          placeholder={inherited.right}
          dimmed={!layer.enabled}
          onCommit={(next) => setSide('right', next)}
        />

        <Box />
        <SideInput
          key={`bottom-${layer.enabled}-${sides.bottom}`}
          value={sides.bottom}
          placeholder={inherited.bottom}
          dimmed={!layer.enabled}
          onCommit={(next) => setSide('bottom', next)}
        />
        <Box />
      </Box>
    </Box>
  );
};

/**
 * The slide's padding and a paragraph's padding, drawn as nested boxes.
 *
 * They were two separate rows — one offering only a vertical and a horizontal value, the other
 * four unlabelled fields — which gave no sense that one sits inside the other. A browser's box
 * model inspector solves exactly this problem, so this borrows its shape: the outer frame is the
 * slide edge, the inner one is the space around each paragraph, and every side is its own field.
 *
 * A side left blank shows the value it inherits behind it, so an unset box still reads as the
 * spacing that will actually apply.
 */
export const BoxModelEditor = ({ outer, inner, contentLabel }: { outer: BoxLayer; inner: BoxLayer; contentLabel: string }) => (
  <Layer layer={outer} tint="action.hover">
    <Layer layer={inner} tint="background.paper">
      <Box
        sx={{
          border: 1,
          borderStyle: 'dashed',
          borderColor: 'divider',
          borderRadius: 0.5,
          py: 0.75,
          textAlign: 'center',
          minWidth: 0,
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
          {contentLabel}
        </Typography>
      </Box>
    </Layer>
  </Layer>
);
