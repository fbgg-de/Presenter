/**
 * A Stage group's layout: pick one of the designed stage screens, then a few switches. Shown on the
 * Stage group card in the screen groups board — nothing here is positioned by hand.
 */
import type { ReactNode } from 'react';
import { Box, ButtonBase, MenuItem, Select, Stack, Switch, Typography, Tooltip } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { STAGE_LAYOUT_KINDS, type StageLayoutKind, type StageLayoutSettings } from '@/screens/types';
import { SectionLabel } from '@/components/operator/SectionLabel';

/** A block of the mini layout sketch, in percent of the thumbnail. */
const Bar = ({ l, t, w, h, accent }: { l: number; t: number; w: number; h: number; accent?: boolean }) => (
  <Box
    sx={{
      position: 'absolute',
      left: `${l}%`,
      top: `${t}%`,
      width: `${w}%`,
      height: `${h}%`,
      borderRadius: '1px',
      bgcolor: accent ? 'rgba(240,169,74,0.7)' : 'rgba(255,255,255,0.28)',
    }}
  />
);

const SKETCH: Record<StageLayoutKind, ReactNode> = {
  band: (
    <>
      <Bar l={0} t={0} w={100} h={13} accent />
      <Bar l={6} t={30} w={50} h={9} />
      <Bar l={6} t={45} w={42} h={9} />
      <Bar l={68} t={26} w={28} h={40} />
      <Bar l={0} t={88} w={100} h={12} />
    </>
  ),
  speaker: (
    <>
      <Bar l={0} t={0} w={100} h={13} accent />
      <Bar l={5} t={24} w={42} h={68} />
      <Bar l={53} t={24} w={42} h={68} />
    </>
  ),
  countdown: (
    <>
      <Bar l={22} t={30} w={56} h={28} />
      <Bar l={30} t={66} w={40} h={8} accent />
    </>
  ),
  lyrics: (
    <>
      <Bar l={0} t={0} w={100} h={13} accent />
      <Bar l={10} t={38} w={80} h={11} />
      <Bar l={15} t={55} w={70} h={11} />
    </>
  ),
};

export const StageLayoutEditor = ({ value, onChange }: { value: StageLayoutSettings; onChange: (next: StageLayoutSettings) => void }) => {
  const { LL } = useI18nContext();
  const G = LL.SCREEN_GROUP;
  const layoutLabel = (kind: StageLayoutKind) =>
    ({ band: G.LAYOUT_BAND(), speaker: G.LAYOUT_SPEAKER(), countdown: G.LAYOUT_COUNTDOWN(), lyrics: G.LAYOUT_LYRICS() })[kind];
  const set = (patch: Partial<StageLayoutSettings>) => onChange({ ...value, ...patch });

  /**
   * A switch keeps its place in every layout — one that the chosen layout does not use is greyed
   * out instead of removed, so the card keeps its height and the grid stays even.
   */
  const toggle = (label: string, key: 'roadmap' | 'next' | 'key' | 'clock' | 'mirror', used = true) => (
    <Tooltip title={used ? '' : G.STAGE_NOT_IN_LAYOUT()}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', opacity: used ? 1 : 0.5 }}>
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
          {label}
        </Typography>
        <Switch size="small" disabled={!used} checked={value[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      </Stack>
    </Tooltip>
  );

  return (
    <Stack spacing={0.75} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
      <SectionLabel>{G.STAGE_LAYOUT()}</SectionLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75 }}>
        {STAGE_LAYOUT_KINDS.map((kind) => {
          const selected = value.layout === kind;
          return (
            <ButtonBase
              key={kind}
              onClick={() => set({ layout: kind })}
              sx={{
                display: 'block',
                textAlign: 'left',
                p: 0.5,
                borderRadius: 1,
                border: 1,
                borderColor: selected ? 'primary.main' : 'divider',
                boxShadow: (theme) => (selected ? `0 0 0 1px ${theme.palette.primary.main}` : 'none'),
              }}
            >
              <Box sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: '#050607', borderRadius: 0.5, overflow: 'hidden' }}>
                {SKETCH[kind]}
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontWeight: selected ? 600 : 400 }}>
                {layoutLabel(kind)}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
      {toggle(G.STAGE_ROADMAP(), 'roadmap', value.layout === 'band')}
      {toggle(G.STAGE_NEXT(), 'next', value.layout === 'band' || value.layout === 'speaker')}
      {toggle(G.STAGE_KEY(), 'key', value.layout !== 'countdown')}
      {toggle(G.STAGE_CLOCK(), 'clock', value.layout !== 'countdown')}
      {toggle(G.STAGE_MIRROR(), 'mirror')}
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
          {G.STAGE_TEXT_SIZE()}
        </Typography>
        <Select
          size="small"
          value={value.textSize}
          onChange={(e) => set({ textSize: e.target.value as StageLayoutSettings['textSize'] })}
          sx={{ fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.5 } }}
        >
          <MenuItem value="normal">{G.TEXT_NORMAL()}</MenuItem>
          <MenuItem value="large">{G.TEXT_LARGE()}</MenuItem>
          <MenuItem value="huge">{G.TEXT_HUGE()}</MenuItem>
        </Select>
      </Stack>
    </Stack>
  );
};
