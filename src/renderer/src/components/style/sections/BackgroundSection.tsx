import { Button, Stack, Typography } from '@mui/material';
import { CardGrid, PropCard, StylePropRow } from '@/components/style/StyleFormPrimitives';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import type { StyleFormCtx } from '@/components/style/styleFormContext';

/**
 * Background: the colour the text is drawn on. Pictures and videos behind the text are
 * background entries in the agenda, so they can change per group and be switched live.
 */
export const BackgroundSection = ({ ctx }: { ctx: StyleFormCtx }) => {
  const { LL, getProp, updateProp, togglePropEnabled } = ctx;

  return (
    <CardGrid>
      {/* Background color — always available as a base layer */}
      <PropCard span>
        <StylePropRow
          label={LL.STYLE.BACKGROUND_COLOR()}
          enabled={getProp<string>('backgroundColor').enabled}
          onToggle={(e) => togglePropEnabled('backgroundColor', e)}

          propKeys={['backgroundColor']}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}
          >
            <ColorSwatchButton
              value={getProp<string>('backgroundColor').value || '#000000'}
              onChange={(c) => updateProp('backgroundColor', { enabled: true, value: c })}
            />
            <Button
              size="small"
              variant={getProp<string>('backgroundColor').value === 'transparent' ? 'contained' : 'outlined'}
              onClick={() => updateProp('backgroundColor', { enabled: true, value: 'transparent' })}
              sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 0 }}
            >
              {LL.STYLE.BACKGROUND_TRANSPARENT()}
            </Button>
          </Stack>
        </StylePropRow>
      </PropCard>

      <PropCard span>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {LL.STYLE.BACKGROUND_FROM_AGENDA()}
        </Typography>
      </PropCard>
    </CardGrid>
  );
};
