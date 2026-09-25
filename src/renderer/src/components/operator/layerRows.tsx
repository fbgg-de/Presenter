/**
 * The layer bar's rows as things of their own: their colours, icons and names, how a row's name
 * looks (so Settings can show the rows exactly as the bar does), and which rows are shown.
 */
import type { SvgIconComponent } from '@mui/icons-material';
import {
  Audiotrack as AudioLayerIcon,
  LayersOutlined as OverlaysLayerIcon,
  PermMediaOutlined as MediaLayerIcon,
  SubjectOutlined as SlidesLayerIcon,
  WallpaperOutlined as BackgroundLayerIcon,
} from '@mui/icons-material';
import { Box, Stack, Switch, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { SectionLabel } from './SectionLabel';

export const LAYER_ROW_IDS = ['background', 'slides', 'media', 'audio', 'overlays'] as const;
export type LayerRowId = (typeof LAYER_ROW_IDS)[number];

/** Layer colours: background, slides, media, audio, overlays — the same hues as the pills. */
export const LAYER_COLORS: Record<LayerRowId, string> = {
  background: '#3fc2b3',
  slides: '#8f96ff',
  media: '#f0a94a',
  audio: '#e07bbf',
  overlays: '#d77ad9',
};

/** Layer icons, so a row is recognised without reading its name. */
export const LAYER_ICONS: Record<LayerRowId, SvgIconComponent> = {
  background: BackgroundLayerIcon,
  slides: SlidesLayerIcon,
  media: MediaLayerIcon,
  audio: AudioLayerIcon,
  overlays: OverlaysLayerIcon,
};

/** The row names the bar prints. */
export const useLayerRowNames = (): Record<LayerRowId, string> => {
  const { LL } = useI18nContext();
  return {
    background: LL.OPERATOR.LAYER_BACKGROUND(),
    slides: LL.OPERATOR.LAYER_SLIDES(),
    media: LL.MEDIA_ITEM.LAYER(),
    audio: LL.AUDIO.LAYER(),
    overlays: LL.OPERATOR.LAYER_OVERLAYS(),
  };
};

/** Whether a row is shown: every row is, unless switched off in Settings. */
export const useLayerRowShown = () => {
  const { operatorLayerRows } = useGetSettings('operatorLayerRows');
  return (id: LayerRowId) => operatorLayerRows?.[id] !== false;
};

/** A row's name as the bar draws it: its icon in its colour, then the name in small capitals. */
export const LayerRowLabel = ({ id, name }: { id: LayerRowId; name: string }) => {
  const Icon = LAYER_ICONS[id];
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Icon sx={{ fontSize: 16, color: LAYER_COLORS[id], flexShrink: 0 }} />
      <SectionLabel sx={{ flexShrink: 0 }}>{name}</SectionLabel>
    </Stack>
  );
};

/**
 * Settings → which rows the layer bar shows. Each row is drawn the way the bar draws it, with what
 * it holds beside it, so the one to hide is found by sight rather than by name.
 */
export const LayerRowsSetting = () => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const { operatorLayerRows } = useGetSettings('operatorLayerRows');
  const updateSetting = useUpdateSetting();
  const names = useLayerRowNames();
  const shown = useLayerRowShown();
  const describe: Record<LayerRowId, string> = {
    background: O.ROW_DESC_BACKGROUND(),
    slides: O.ROW_DESC_SLIDES(),
    media: O.ROW_DESC_MEDIA(),
    audio: O.ROW_DESC_AUDIO(),
    overlays: O.ROW_DESC_OVERLAYS(),
  };
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {LAYER_ROW_IDS.map((id, index) => (
        <Box
          key={id}
          sx={{
            display: 'grid',
            gridTemplateColumns: '170px minmax(0, 1fr) auto',
            alignItems: 'center',
            borderTop: index > 0 ? 1 : 0,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            opacity: shown(id) ? 1 : 0.55,
          }}
        >
          <Box
            sx={{ pl: 1.5, pr: 0.75, py: 1, borderRight: 1, borderColor: 'divider', height: '100%', display: 'flex', alignItems: 'center' }}
          >
            <LayerRowLabel id={id} name={names[id]} />
          </Box>
          <Typography variant="body2" sx={{ px: 1.5, color: 'text.secondary' }}>
            {describe[id]}
          </Typography>
          <Switch
            size="small"
            checked={shown(id)}
            slotProps={{ input: { 'aria-label': names[id] } }}
            onChange={(e) => updateSetting('operatorLayerRows', { ...operatorLayerRows, [id]: e.target.checked })}
            sx={{ mr: 1 }}
          />
        </Box>
      ))}
    </Box>
  );
};
