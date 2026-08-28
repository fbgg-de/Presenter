import { Stack, Switch, Typography } from '@mui/material';
import { Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon } from '@mui/icons-material';
import { CardGrid, FontFamilyEditor, PropCard, StylePropRow } from '@/components/style/StyleFormPrimitives';
import { LanguagesSection } from '@/components/style/sections/LanguagesSection';
import { type StyleFormCtx } from '@/components/style/styleFormContext';

/**
 * Text: the font, every language's typography, and whether text shows at all.
 *
 * The languages used to be a category of their own, which put the main text in one place and
 * its translations in another — the two things you almost always compare against each other.
 * They are one list here, and the main language is simply "Language 1" in it rather than a
 * differently-named panel, because that is exactly what it is.
 */
export const TextSection = ({ ctx }: { ctx: StyleFormCtx }) => {
  const { LL, getProp, updateProp, togglePropEnabled, styleData, setStyleData, setIsDirty } = ctx;

  return (
    <CardGrid>
      <PropCard title={LL.STYLE.SECTION_FONT()}>
        <StylePropRow
          block
          label={LL.STYLE.FONT_FAMILY()}
          enabled={getProp<string>('fontFamily').enabled || getProp<string[]>('fontFallback').enabled}
          onToggle={(e) => {
            togglePropEnabled('fontFamily', e);
            togglePropEnabled('fontFallback', e);
          }}

          propKeys={['fontFamily', 'fontFallback']}
        >
          <FontFamilyEditor
            primary={getProp<string>('fontFamily').value || 'Arial'}
            fallbacks={getProp<string[]>('fontFallback').value || []}
            onPrimaryChange={(font) => updateProp('fontFamily', { enabled: true, value: font })}
            onFallbacksChange={(list) => updateProp('fontFallback', { enabled: true, value: list })}
          />
        </StylePropRow>
      </PropCard>

      <LanguagesSection ctx={ctx} />

      <PropCard title={LL.STYLE.SECTION_VISIBILITY()}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5, px: 1 }}>
          <Switch
            size="small"
            checked={styleData.hideText || false}
            onChange={(e) => {
              setStyleData((prev) => ({ ...prev, hideText: e.target.checked }));
              setIsDirty(true);
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {styleData.hideText ? (
              <VisibilityOffIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
            ) : (
              <VisibilityIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
            )}
            {LL.STYLE.HIDE_TEXT()}
          </Typography>
        </Stack>
      </PropCard>
    </CardGrid>
  );
};
