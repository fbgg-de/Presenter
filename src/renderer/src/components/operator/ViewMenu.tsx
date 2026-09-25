/**
 * The operator view's View menu: how big the screen previews and the slides are, and which side
 * columns are shown — one place for all of it instead of a size button next to each.
 */
import { useState } from 'react';
import { Box, Divider, IconButton, Popover, Slider, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { DashboardCustomize as ViewIcon } from '@mui/icons-material';
import { sidePanelState, sidePanelVisible, toggleSidePanel } from './sidePanel';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useShortcut } from '@/hooks/useShortcut';
import { MONITOR_DEFAULT, MONITOR_RANGE, SLIDE_DEFAULT, SLIDE_RANGE, clampSize, type SizeRange } from './tileSize';
import { SectionLabel } from './SectionLabel';

const SizeRow = ({
  label,
  range,
  value,
  onChange,
}: {
  label: string;
  range: SizeRange;
  value: number;
  onChange: (value: number) => void;
}) => (
  <Stack spacing={0.25}>
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="body2">{label}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {value} px
      </Typography>
    </Stack>
    <Slider size="small" min={range.min} max={range.max} step={range.step} value={value} onChange={(_, next) => onChange(next as number)} />
  </Stack>
);

const ToggleRow = ({
  label,
  shortcut,
  checked,
  onChange,
}: {
  label: string;
  shortcut?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
    <Typography variant="body2">{label}</Typography>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
      {shortcut && (
        <Box
          component="kbd"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            px: 0.6,
            border: 1,
            borderColor: 'divider',
            borderRadius: 0.5,
            color: 'text.secondary',
          }}
        >
          {shortcut}
        </Box>
      )}
      <Switch size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Stack>
  </Stack>
);

export const ViewMenu = () => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const settings = useGetSettings(
    'operatorMonitorWidth',
    'operatorSlideSize',
    'operatorSetListOpen',
    'operatorPreviewBeforeLive',
    'operatorSidePanelOpen',
    'operatorInspectorOpen',
    'operatorPreviewOpen',
  );
  const { operatorMonitorWidth, operatorSlideSize, operatorSetListOpen, operatorPreviewBeforeLive } = settings;
  const sidePanel = sidePanelState(settings);
  const updateSetting = useUpdateSetting();
  const setListShortcut = useShortcut('toggle_set_list');
  const sidePanelShortcut = useShortcut('toggle_inspector');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title={O.VIEW_MENU()}>
        <IconButton size="small" color={anchor ? 'primary' : 'default'} onClick={(e) => setAnchor(e.currentTarget)} sx={{ flexShrink: 0 }}>
          <ViewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, width: 280 } } }}
      >
        <Stack spacing={1.5}>
          <SectionLabel>{O.VIEW_MENU()}</SectionLabel>
          <SizeRow
            label={O.VIEW_PREVIEWS()}
            range={MONITOR_RANGE}
            value={clampSize(operatorMonitorWidth, MONITOR_RANGE, MONITOR_DEFAULT)}
            onChange={(value) => updateSetting('operatorMonitorWidth', value)}
          />
          <SizeRow
            label={O.VIEW_SLIDES()}
            range={SLIDE_RANGE}
            value={clampSize(operatorSlideSize, SLIDE_RANGE, SLIDE_DEFAULT)}
            onChange={(value) => updateSetting('operatorSlideSize', value)}
          />
          <Divider />
          <ToggleRow
            label={O.VIEW_SET_LIST()}
            shortcut={setListShortcut}
            checked={operatorSetListOpen !== false}
            onChange={(checked) => updateSetting('operatorSetListOpen', checked)}
          />
          <ToggleRow
            label={O.VIEW_SIDE_PANEL()}
            shortcut={sidePanelShortcut}
            checked={sidePanelVisible(sidePanel)}
            onChange={() => toggleSidePanel(sidePanel, updateSetting)}
          />
          {/* What the side panel holds. */}
          <Stack spacing={1.5} sx={{ pl: 2, borderLeft: 2, borderColor: 'divider', opacity: sidePanel.open ? 1 : 0.5 }}>
            <ToggleRow
              label={O.VIEW_PREVIEW()}
              checked={sidePanel.preview}
              onChange={(checked) => updateSetting('operatorPreviewOpen', checked)}
            />
            <ToggleRow
              label={O.VIEW_INSPECTOR()}
              checked={sidePanel.inspector}
              onChange={(checked) => updateSetting('operatorInspectorOpen', checked)}
            />
          </Stack>
          <Stack spacing={0.25}>
            <ToggleRow
              label={O.VIEW_PREVIEW_BEFORE_LIVE()}
              checked={!!operatorPreviewBeforeLive}
              onChange={(checked) => updateSetting('operatorPreviewBeforeLive', checked)}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {O.VIEW_PREVIEW_BEFORE_LIVE_HINT()}
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {O.VIEW_HINT()}
          </Typography>
        </Stack>
      </Popover>
    </>
  );
};
