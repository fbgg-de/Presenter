/**
 * Every screen group's version of the theme being edited, side by side, so a change made for
 * one group can be checked against the others at a glance. Clicking a tile switches to that
 * group's tab.
 */
import { useMemo } from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { StyleData } from '@/api/styles.api';
import type { ScreenGroupEntity } from '@/screens/types';
import { normaliseScreenGroupData } from '@/screens/types';
import { withoutBackgroundMedia } from '@/look/resolveLook';
import { DEFAULT_STYLE, mergeStyles, resolveStyleData } from '@/utils/styleUtils';
import { useGetSettings } from '@/store/settingsSlice';
import { GroupMonitor } from '@/components/operator/GroupMonitor';
import { splitSampleAtSeparator } from '@/components/style/styleFormUtils';

export const GroupPreviewStrip = ({
  styleData,
  groups,
  activeKey,
  onSelect,
}: {
  styleData: StyleData;
  groups: ScreenGroupEntity[];
  /** The tab being edited: a group id, or null for all groups. */
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}) => {
  const { LL } = useI18nContext();
  const { stylePreview } = useGetSettings('stylePreview');
  const lines = useMemo(() => splitSampleAtSeparator(stylePreview.languages[0]?.lines ?? []).current.slice(0, 2), [stylePreview]);

  const tiles = useMemo(() => {
    const styleFor = (variant?: StyleData) => {
      let style = mergeStyles(DEFAULT_STYLE, resolveStyleData(styleData));
      if (variant) style = mergeStyles(style, resolveStyleData(variant));
      return withoutBackgroundMedia(style);
    };
    return [
      { key: null, label: LL.LOOK.VARIANT_ALL_GROUPS(), style: styleFor(), showBackground: true },
      ...groups
        .filter((g) => g.enabled)
        .map((g) => ({
          key: String(g.id),
          label: g.name,
          style: styleFor(styleData.variants?.[String(g.id)]),
          showBackground: normaliseScreenGroupData(g.data).layers.background,
        })),
    ];
  }, [styleData, groups, LL]);

  if (groups.length === 0) return null;

  return (
    <Stack spacing={0.5} sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {LL.STYLE.GROUP_PREVIEWS()}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1 }}>
        {tiles.map((tile) => (
          <ButtonBase
            key={tile.key ?? 'all'}
            onClick={() => onSelect(tile.key)}
            sx={{
              display: 'block',
              textAlign: 'left',
              borderRadius: 1,
              p: 0.5,
              outline: tile.key === activeKey ? '2px solid' : 'none',
              outlineColor: 'warning.main',
            }}
          >
            <GroupMonitor
              width="100%"
              label={tile.label}
              style={tile.style}
              lines={lines}
              showText
              showBackground={tile.showBackground}
              black={false}
              blackLabel=""
              live={false}
            />
          </ButtonBase>
        ))}
      </Box>
    </Stack>
  );
};
