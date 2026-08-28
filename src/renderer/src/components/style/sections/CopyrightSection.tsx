import { Slider, Stack, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import {
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
  FormatAlignLeft as AlignLeftIcon,
  FormatAlignCenter as AlignCenterIcon,
  FormatAlignRight as AlignRightIcon,
} from '@mui/icons-material';
import { CssUnitInput } from '@/components/style/CssUnitInput';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import { CardGrid, FontFamilyEditor, PropCard, StylePropRow } from '@/components/style/StyleFormPrimitives';
import type { StyleFormCtx } from '@/components/style/styleFormContext';

/** Copyright: the credit block shown after the last verse. */
export const CopyrightSection = ({ ctx }: { ctx: StyleFormCtx }) => {
  const { LL, getProp, updateProp, togglePropEnabled } = ctx;

  return (
    <CardGrid>
      <PropCard>
        {/* 1. Font */}
        <StylePropRow
          block
          label={LL.STYLE.COPYRIGHT_FONT()}
          enabled={getProp<string>('copyrightFontFamily').enabled}
          onToggle={(e) => togglePropEnabled('copyrightFontFamily', e)}

          propKeys={['copyrightFontFamily']}
        >
          <FontFamilyEditor
            primary={getProp<string>('copyrightFontFamily').value || 'Arial'}
            fallbacks={[]}
            onPrimaryChange={(font) => updateProp('copyrightFontFamily', { enabled: true, value: font })}
            onFallbacksChange={() => {}}
          />
        </StylePropRow>
        {/* 2. Padding */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_PADDING()}
          enabled={getProp<string>('copyrightPadding').enabled}
          onToggle={(e) => togglePropEnabled('copyrightPadding', e)}

          propKeys={['copyrightPadding']}
        >
          {(() => {
            const raw = getProp<string>('copyrightPadding').value || '2vh 4vw';
            const parts = raw.split(/\s+/);
            const pV = parts[0] || '2vh';
            const pH = parts[1] || parts[0] || '4vw';
            return (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'flex-start',
                }}
              >
                <CssUnitInput
                  value={pV}
                  onChange={(v) => updateProp('copyrightPadding', { enabled: true, value: `${v} ${pH}` })}
                  label="Vertical"
                />
                <CssUnitInput
                  value={pH}
                  onChange={(v) => updateProp('copyrightPadding', { enabled: true, value: `${pV} ${v}` })}
                  label="Horizontal"
                />
              </Stack>
            );
          })()}
        </StylePropRow>
        {/* 3. Alignment */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_ALIGNMENT()}
          enabled={getProp<string>('copyrightTextAlign').enabled}
          onToggle={(e) => togglePropEnabled('copyrightTextAlign', e)}

          propKeys={['copyrightTextAlign']}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={getProp<string>('copyrightTextAlign').value || 'center'}
            onChange={(_, val) => val && updateProp('copyrightTextAlign', { enabled: true, value: val })}
          >
            <ToggleButton value="left">
              <AlignLeftIcon />
            </ToggleButton>
            <ToggleButton value="center">
              <AlignCenterIcon />
            </ToggleButton>
            <ToggleButton value="right">
              <AlignRightIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        </StylePropRow>
        {/* 4. Opacity */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_OPACITY()}
          enabled={getProp<number>('copyrightOpacity').enabled}
          onToggle={(e) => togglePropEnabled('copyrightOpacity', e)}

          propKeys={['copyrightOpacity']}
        >
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={getProp<number>('copyrightOpacity').value ?? 1}
            onChange={(_, v) => updateProp('copyrightOpacity', { enabled: true, value: v as number })}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
            sx={{ width: 200 }}
          />
        </StylePropRow>
      </PropCard>

      <PropCard>
        {/* 5. Title Font Size */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_TITLE_SIZE()}
          enabled={getProp<string>('copyrightTitleFontSize').enabled}
          onToggle={(e) => togglePropEnabled('copyrightTitleFontSize', e)}

          propKeys={['copyrightTitleFontSize']}
        >
          <CssUnitInput
            value={getProp<string>('copyrightTitleFontSize').value || '2.5vh'}
            onChange={(v) => updateProp('copyrightTitleFontSize', { enabled: true, value: v })}
          />
        </StylePropRow>
        {/* 6. Title Text Style */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_TITLE_BOLD_ITALIC()}
          enabled={
            getProp<boolean>('copyrightTitleFontBold').enabled ||
            getProp<boolean>('copyrightTitleFontItalic').enabled ||
            getProp<boolean>('copyrightTitleFontUnderline').enabled
          }
          onToggle={(e) => {
            togglePropEnabled('copyrightTitleFontBold', e);
            togglePropEnabled('copyrightTitleFontItalic', e);
            togglePropEnabled('copyrightTitleFontUnderline', e);
          }}

          propKeys={['copyrightTitleFontBold', 'copyrightTitleFontItalic', 'copyrightTitleFontUnderline']}
        >
          <ToggleButtonGroup size="small">
            <ToggleButton
              value="bold"
              selected={getProp<boolean>('copyrightTitleFontBold').value || false}
              onClick={() =>
                updateProp('copyrightTitleFontBold', {
                  enabled: true,
                  value: !getProp<boolean>('copyrightTitleFontBold').value,
                })
              }
            >
              <BoldIcon />
            </ToggleButton>
            <ToggleButton
              value="italic"
              selected={getProp<boolean>('copyrightTitleFontItalic').value || false}
              onClick={() =>
                updateProp('copyrightTitleFontItalic', {
                  enabled: true,
                  value: !getProp<boolean>('copyrightTitleFontItalic').value,
                })
              }
            >
              <ItalicIcon />
            </ToggleButton>
            <ToggleButton
              value="underline"
              selected={getProp<boolean>('copyrightTitleFontUnderline').value || false}
              onClick={() =>
                updateProp('copyrightTitleFontUnderline', {
                  enabled: true,
                  value: !getProp<boolean>('copyrightTitleFontUnderline').value,
                })
              }
            >
              <UnderlineIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        </StylePropRow>
        {/* 7. Title Spacing */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_TITLE_SPACING()}
          enabled={getProp<string>('copyrightTitleSpacing').enabled}
          onToggle={(e) => togglePropEnabled('copyrightTitleSpacing', e)}

          propKeys={['copyrightTitleSpacing']}
        >
          <CssUnitInput
            value={getProp<string>('copyrightTitleSpacing').value || '0.5vh'}
            onChange={(v) => updateProp('copyrightTitleSpacing', { enabled: true, value: v })}
          />
        </StylePropRow>
        {/* 8. Show Song Number in Title */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_SHOW_SONG_NUMBER()}
          enabled={getProp<boolean>('copyrightShowSongNumber').enabled}
          onToggle={(e) => togglePropEnabled('copyrightShowSongNumber', e)}

          propKeys={['copyrightShowSongNumber']}
        >
          <Switch
            size="small"
            checked={getProp<boolean>('copyrightShowSongNumber').value || false}
            onChange={(e) => updateProp('copyrightShowSongNumber', { enabled: true, value: e.target.checked })}
          />
        </StylePropRow>
      </PropCard>

      <PropCard>
        {/* 9. Size */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_SIZE()}
          enabled={getProp<string>('copyrightFontSize').enabled}
          onToggle={(e) => togglePropEnabled('copyrightFontSize', e)}

          propKeys={['copyrightFontSize']}
        >
          <CssUnitInput
            value={getProp<string>('copyrightFontSize').value || '2vh'}
            onChange={(v) => updateProp('copyrightFontSize', { enabled: true, value: v })}
          />
        </StylePropRow>
        {/* 10. Color */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_COLOR()}
          enabled={getProp<string>('copyrightFontColor').enabled}
          onToggle={(e) => togglePropEnabled('copyrightFontColor', e)}

          propKeys={['copyrightFontColor']}
        >
          <ColorSwatchButton
            value={getProp<string>('copyrightFontColor').value || '#FFFFFF'}
            onChange={(c) => updateProp('copyrightFontColor', { enabled: true, value: c })}
          />
        </StylePropRow>
        {/* 11. Text Style (Bold / Italic / Underline) */}
        <StylePropRow
          label={LL.STYLE.COPYRIGHT_BOLD_ITALIC()}
          enabled={
            getProp<boolean>('copyrightFontBold').enabled ||
            getProp<boolean>('copyrightFontItalic').enabled ||
            getProp<boolean>('copyrightFontUnderline').enabled
          }
          onToggle={(e) => {
            togglePropEnabled('copyrightFontBold', e);
            togglePropEnabled('copyrightFontItalic', e);
            togglePropEnabled('copyrightFontUnderline', e);
          }}

          propKeys={['copyrightFontBold', 'copyrightFontItalic', 'copyrightFontUnderline']}
        >
          <ToggleButtonGroup size="small">
            <ToggleButton
              value="bold"
              selected={getProp<boolean>('copyrightFontBold').value || false}
              onClick={() => updateProp('copyrightFontBold', { enabled: true, value: !getProp<boolean>('copyrightFontBold').value })}
            >
              <BoldIcon />
            </ToggleButton>
            <ToggleButton
              value="italic"
              selected={getProp<boolean>('copyrightFontItalic').value || false}
              onClick={() =>
                updateProp('copyrightFontItalic', {
                  enabled: true,
                  value: !getProp<boolean>('copyrightFontItalic').value,
                })
              }
            >
              <ItalicIcon />
            </ToggleButton>
            <ToggleButton
              value="underline"
              selected={getProp<boolean>('copyrightFontUnderline').value || false}
              onClick={() =>
                updateProp('copyrightFontUnderline', {
                  enabled: true,
                  value: !getProp<boolean>('copyrightFontUnderline').value,
                })
              }
            >
              <UnderlineIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        </StylePropRow>
      </PropCard>
    </CardGrid>
  );
};
