import { Slider, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { FormatBold as BoldIcon, FormatItalic as ItalicIcon, FormatUnderlined as UnderlineIcon } from '@mui/icons-material';
import type { useI18nContext } from '@/i18n/i18n-react';
import type { LanguageStyleEntry } from '@/api/styles.api';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import { CssUnitInput } from '@/components/style/CssUnitInput';
import { StylePropRow } from '@/components/style/StyleFormPrimitives';
import type { InheritedSource } from '@/components/style/styleFormContext';

/** Per-language typography settings editor with per-property enable toggles. */
export const LanguageStyleEditor = ({
  entry,
  onChange,
  inheritedFor,
  LL,
}: {
  entry: LanguageStyleEntry;
  onChange: (patch: Partial<LanguageStyleEntry>) => void;
  /**
   * Where a field's value comes from when this slot does not set it — the main slot, then the
   * app default. Supplied by the caller, which is the only place that can see the sibling slots.
   */
  inheritedFor?: (field: keyof LanguageStyleEntry) => InheritedSource[];
  LL: ReturnType<typeof useI18nContext>['LL'];
}) => {
  const shadowParts = (entry.textShadow || '2px 2px 4px').split(/\s+/);
  const sx = shadowParts[0] || '2px';
  const sy = shadowParts[1] || '2px';
  const sb = shadowParts[2] || '4px';
  const strokeMatch = (entry.textStroke || '1px black').match(/^(-?\d*\.?\d+\s*(?:px|pt|em|rem|vh|vw|vmin|vmax|%))\s+(.+)$/i);
  const sw = strokeMatch ? strokeMatch[1] : '1px';
  const sc = strokeMatch ? strokeMatch[2] : 'black';

  /**
   * Write a value AND switch its property on.
   *
   * The main style rows already do this (`updateProp(key, { enabled: true, value })`), but
   * the language rows only wrote the value — so picking a colour or size here changed
   * nothing on screen, because `langEntryToCss` skips any property whose `*Enabled` flag
   * is not set. The row's toggle still turns it back off.
   */
  const setEnabled = (patch: Partial<LanguageStyleEntry>, enableKey: keyof LanguageStyleEntry) => onChange({ ...patch, [enableKey]: true });

  return (
    <Stack spacing={1}>
      <StylePropRow
        label={LL.STYLE.FONT_COLOR()}
        inherited={inheritedFor?.('fontColor')}
        enabled={entry.fontColorEnabled ?? false}
        onToggle={(e) => onChange({ fontColorEnabled: e })}
      >
        <ColorSwatchButton value={entry.fontColor || '#FFFFFF'} onChange={(c) => setEnabled({ fontColor: c }, 'fontColorEnabled')} />
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.FONT_SIZE()}
        inherited={inheritedFor?.('fontSize')}
        enabled={entry.fontSizeEnabled ?? false}
        onToggle={(e) => onChange({ fontSizeEnabled: e })}
      >
        <CssUnitInput value={entry.fontSize || '4vh'} onChange={(v) => setEnabled({ fontSize: v }, 'fontSizeEnabled')} />
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.FONT_BOLD_ITALIC()}
        inherited={inheritedFor?.('fontBold')}
        enabled={entry.fontStyleEnabled ?? false}
        onToggle={(e) => onChange({ fontStyleEnabled: e })}
      >
        <ToggleButtonGroup size="small">
          <ToggleButton
            value="bold"
            selected={entry.fontBold || false}
            onClick={() => setEnabled({ fontBold: !entry.fontBold }, 'fontStyleEnabled')}
          >
            <BoldIcon />
          </ToggleButton>
          <ToggleButton
            value="italic"
            selected={entry.fontItalic || false}
            onClick={() => setEnabled({ fontItalic: !entry.fontItalic }, 'fontStyleEnabled')}
          >
            <ItalicIcon />
          </ToggleButton>
          <ToggleButton
            value="underline"
            selected={entry.fontUnderline || false}
            onClick={() => setEnabled({ fontUnderline: !entry.fontUnderline }, 'fontStyleEnabled')}
          >
            <UnderlineIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.LETTER_SPACING()}
        inherited={inheritedFor?.('letterSpacing')}
        enabled={entry.letterSpacingEnabled ?? false}
        onToggle={(e) => onChange({ letterSpacingEnabled: e })}
      >
        <CssUnitInput value={entry.letterSpacing || '0px'} onChange={(v) => setEnabled({ letterSpacing: v }, 'letterSpacingEnabled')} />
      </StylePropRow>
      <StylePropRow
        block
        label={LL.STYLE.TEXT_SHADOW()}
        inherited={inheritedFor?.('textShadow')}
        enabled={entry.textShadowEnabled ?? false}
        onToggle={(e) => onChange({ textShadowEnabled: e })}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'flex-start',
          }}
        >
          <CssUnitInput
            value={sx}
            onChange={(v) => setEnabled({ textShadow: `${v} ${sy} ${sb}` }, 'textShadowEnabled')}
            label={LL.STYLE.SHADOW_X()}
          />
          <CssUnitInput
            value={sy}
            onChange={(v) => setEnabled({ textShadow: `${sx} ${v} ${sb}` }, 'textShadowEnabled')}
            label={LL.STYLE.SHADOW_Y()}
          />
          <CssUnitInput
            value={sb}
            onChange={(v) => setEnabled({ textShadow: `${sx} ${sy} ${v}` }, 'textShadowEnabled')}
            label={LL.STYLE.SHADOW_BLUR()}
          />
          <Stack
            sx={{
              alignItems: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                mb: 0.25,
              }}
            >
              {LL.STYLE.SHADOW_COLOR()}
            </Typography>
            <ColorSwatchButton
              value={entry.textShadowColor || '#000000'}
              onChange={(c) => setEnabled({ textShadowColor: c }, 'textShadowEnabled')}
            />
          </Stack>
        </Stack>
      </StylePropRow>
      <StylePropRow
        block
        label={LL.STYLE.TEXT_STROKE()}
        inherited={inheritedFor?.('textStroke')}
        enabled={entry.textStrokeEnabled ?? false}
        onToggle={(e) => onChange({ textStrokeEnabled: e })}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'flex-start',
          }}
        >
          <CssUnitInput
            value={sw}
            onChange={(v) => setEnabled({ textStroke: `${v} ${sc}` }, 'textStrokeEnabled')}
            label={LL.STYLE.STROKE_WIDTH()}
          />
          <Stack
            sx={{
              alignItems: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                mb: 0.25,
              }}
            >
              {LL.STYLE.STROKE_COLOR()}
            </Typography>
            <ColorSwatchButton value={sc} onChange={(c) => setEnabled({ textStroke: `${sw} ${c}` }, 'textStrokeEnabled')} />
          </Stack>
        </Stack>
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.OPACITY()}
        inherited={inheritedFor?.('opacity')}
        enabled={entry.opacityEnabled ?? false}
        onToggle={(e) => onChange({ opacityEnabled: e })}
      >
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={entry.opacity ?? 1}
          onChange={(_, v) => setEnabled({ opacity: v as number }, 'opacityEnabled')}
          valueLabelDisplay="auto"
          sx={{ width: 200 }}
        />
      </StylePropRow>
      <StylePropRow
        block
        label={LL.STYLE.NEXT_LINE_PREVIEW()}
        enabled={entry.nextLinePreviewEnabled ?? false}
        onToggle={(e) => onChange({ nextLinePreviewEnabled: e })}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
          }}
        >
          <Switch
            size="small"
            checked={entry.nextLinePreview || false}
            onChange={(e2) => setEnabled({ nextLinePreview: e2.target.checked }, 'nextLinePreviewEnabled')}
          />
          <ColorSwatchButton
            value={entry.nextLinePreviewColor || '#AAAAAA'}
            onChange={(c) => setEnabled({ nextLinePreviewColor: c }, 'nextLinePreviewEnabled')}
          />
          <Stack
            spacing={0}
            sx={{
              alignItems: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
              }}
            >
              {LL.STYLE.NEXT_LINE_OPACITY()}
            </Typography>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={entry.nextLinePreviewOpacity ?? 0.6}
              onChange={(_, v) => setEnabled({ nextLinePreviewOpacity: v as number }, 'nextLinePreviewEnabled')}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
              sx={{ width: 80 }}
            />
          </Stack>
        </Stack>
      </StylePropRow>
    </Stack>
  );
};
