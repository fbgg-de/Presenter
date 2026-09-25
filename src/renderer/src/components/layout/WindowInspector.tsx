/**
 * Everything about one window, as three tabs.
 *
 * This replaces `WindowConfigForm`, which was one ~250-line column rendered twice — once to
 * create and once per window to edit — and which pushed the window list off screen the
 * moment it opened. The split is by question rather than by widget: *where* it is, *which
 * screen group* it belongs to, and *which stage layers* land on it.
 *
 * A window is only a placement on this computer. What it shows — layers, stream mode, languages,
 * transparency, stage overlays — is decided by its screen group, so the second and third tab
 * only show the group's decisions and point to where they are changed.
 *
 * The boolean flags are an icon toggle row rather than switch rows. They are one bit each,
 * they already appear as one-click items in the footer menu, and as switches they cost about
 * 100px of a panel that has a screen map to fit in.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Box, Chip, MenuItem, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import {
  CropFree as FramelessIcon,
  Fullscreen as FullscreenIcon,
  MouseOutlined as MouseIcon,
  VerticalAlignTop as OnTopIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { WindowConfig } from '@/store/windowSlice';
import type { StageLayerEntity } from '@/stage/types';
import { normaliseScreenGroupData, type ScreenGroupEntity, type ScreenGroupLayers } from '@/screens/types';
import { ScreenPicker, screenIdForBounds, type ScreenInfo, type ScreenPickerWindow } from './ScreenPicker';

export interface WindowInspectorProps {
  config: WindowConfig;
  onChange: (patch: Partial<WindowConfig>) => void;
  screens: ScreenInfo[];
  openWindows: ScreenPickerWindow[];
  stageLayers: StageLayerEntity[];
  /** Account screen groups the window can join. */
  screenGroups?: ScreenGroupEntity[];
  /** Live geometry of the window being edited, so the map opens on where it actually is. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** Rendered under the tabs — the Create button, in new-window mode. */
  footer?: ReactNode;
}

/**
 * A number field that only reports a value once the operator has finished with it.
 *
 * Committing on every keystroke would apply the width `1` and then `19` on the way to
 * `1920`, moving the real window twice for no reason.
 */
const CommittedNumberField = ({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  placeholder?: string;
}) => {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  // Follow the outside world when it changes for other reasons — dragging the window on
  // screen, or selecting a different one.
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    onCommit(trimmed === '' ? undefined : Number(trimmed));
  };

  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      sx={{ flex: 1 }}
    />
  );
};

/** The window's boolean flags, one icon each. */
const FLAGS = [
  { key: 'fullscreen', Icon: FullscreenIcon, labelKey: 'FULLSCREEN' },
  { key: 'frameless', Icon: FramelessIcon, labelKey: 'FRAMELESS' },
  { key: 'alwaysOnTop', Icon: OnTopIcon, labelKey: 'ALWAYS_ON_TOP' },
  { key: 'hideMouse', Icon: MouseIcon, labelKey: 'HIDE_MOUSE' },
] as const;

const LAYER_KEYS: Array<keyof ScreenGroupLayers> = ['background', 'slides', 'media', 'bibleVerses', 'overlays'];

/** One line of the group summary: a label and what the group decides. */
const SummaryRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
      {label}
    </Typography>
    <Typography variant="body2" component="div" sx={{ textAlign: 'right', minWidth: 0 }}>
      {value}
    </Typography>
  </Stack>
);

export const WindowInspector = ({
  config,
  onChange,
  screens,
  openWindows,
  stageLayers,
  screenGroups = [],
  bounds,
  footer,
}: WindowInspectorProps) => {
  const { LL } = useI18nContext();
  const G = LL.SCREEN_GROUP;
  const [tab, setTab] = useState(0);

  const flagLabel = (key: (typeof FLAGS)[number]['labelKey']): string => (key === 'HIDE_MOUSE' ? LL.FOOTER.HIDE_MOUSE() : LL.WINDOW[key]());

  const activeFlags = FLAGS.filter((f) => (f.key === 'frameless' ? config.frameless !== false : !!config[f.key])).map((f) => f.key);

  const selectedScreenId = screenIdForBounds(bounds ?? boundsFromConfig(config), screens) ?? '';
  const group = screenGroups.find((g) => g.id === config.screenGroupId);
  const groupData = group ? normaliseScreenGroupData(group.data) : undefined;
  const groupStageLayers = group ? stageLayers.filter((l) => l.data.screenGroupIds?.includes(group.id)) : [];

  const layerLabel = (key: keyof ScreenGroupLayers): string =>
    ({
      background: G.LAYER_BACKGROUND(),
      slides: G.LAYER_SLIDES(),
      media: G.LAYER_MEDIA(),
      bibleVerses: G.LAYER_BIBLE(),
      overlays: G.LAYER_OVERLAYS(),
    })[key];

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="fullWidth" sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38 } }}>
        <Tab label={LL.WINDOW.TAB_PLACEMENT()} />
        <Tab label={LL.WINDOW.TAB_CONTENT()} />
        <Tab label={LL.WINDOW.TAB_STAGE()} />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {tab === 0 && (
          <Stack spacing={1.5}>
            <TextField
              label={LL.WINDOW.NAME()}
              value={config.name ?? ''}
              onChange={(e) => onChange({ name: e.target.value })}
              size="small"
              fullWidth
            />

            <ScreenPicker
              screens={screens}
              value={selectedScreenId}
              windows={openWindows}
              height={150}
              onChange={(screenId) => {
                const target = screens.find((s) => s.id === screenId);
                if (!target) return;
                onChange({
                  positionX: target.bounds.x,
                  positionY: target.bounds.y,
                  width: target.bounds.width,
                  height: target.bounds.height,
                });
              }}
            />

            <Stack direction="row" spacing={1}>
              <CommittedNumberField label={LL.WINDOW.WIDTH()} value={config.width} onCommit={(v) => onChange({ width: v })} />
              <CommittedNumberField label={LL.WINDOW.HEIGHT()} value={config.height} onCommit={(v) => onChange({ height: v })} />
              <CommittedNumberField
                label={LL.WINDOW.POSITION_X()}
                value={config.positionX}
                placeholder="auto"
                onCommit={(v) => onChange({ positionX: v })}
              />
              <CommittedNumberField
                label={LL.WINDOW.POSITION_Y()}
                value={config.positionY}
                placeholder="auto"
                onCommit={(v) => onChange({ positionY: v })}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {LL.WINDOW.OPTIONS()}
              </Typography>
              <ToggleButtonGroup
                value={activeFlags}
                size="small"
                onChange={(_e, next: string[]) => {
                  // Report only what actually flipped: the group hands back the whole set,
                  // and writing all of them every time would churn the window config.
                  for (const flag of FLAGS) {
                    const was = activeFlags.includes(flag.key);
                    const now = next.includes(flag.key);
                    if (was !== now) onChange({ [flag.key]: now } as Partial<WindowConfig>);
                  }
                }}
                sx={{ flexWrap: 'wrap' }}
              >
                {FLAGS.map(({ key, Icon, labelKey }) => (
                  <ToggleButton key={key} value={key} sx={{ px: 1.25, gap: 0.5, textTransform: 'none' }}>
                    <Icon sx={{ fontSize: 16 }} />
                    <Typography variant="caption">{flagLabel(labelKey)}</Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={1.5}>
            <TextField
              select
              size="small"
              label={LL.WINDOW.SCREEN_GROUP()}
              value={group ? group.id : ''}
              helperText={LL.WINDOW.SCREEN_GROUP_HINT()}
              onChange={(e) => onChange({ screenGroupId: Number(e.target.value) })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              {!group && (
                <MenuItem value="" disabled>
                  <em>{LL.WINDOW.SCREEN_GROUP_NONE()}</em>
                </MenuItem>
              )}
              {screenGroups.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>

            {groupData && (
              <Stack spacing={0.75} sx={{ p: 1.25, borderRadius: 1, bgcolor: 'action.hover' }}>
                <SummaryRow
                  label={G.DISPLAY()}
                  value={groupData.display.mode === 'stream' ? G.DISPLAY_STREAM({ count: groupData.display.lines }) : G.DISPLAY_NORMAL()}
                />
                <SummaryRow
                  label={G.LANGUAGES()}
                  value={groupData.languages.length > 0 ? groupData.languages.join(', ') : G.LANGUAGES_FROM_THEME()}
                />
                {groupData.transparent && <SummaryRow label={G.TRANSPARENT()} value="✓" />}
                <SummaryRow
                  label={G.SHOWS()}
                  value={
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, justifyContent: 'flex-end' }}>
                      {LAYER_KEYS.filter((key) => groupData.layers[key]).map((key) => (
                        <Chip key={key} size="small" label={layerLabel(key)} sx={{ height: 20, fontSize: '0.7rem' }} />
                      ))}
                    </Stack>
                  }
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {G.CHANGE_ON_GROUP()}
                </Typography>
              </Stack>
            )}
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={1}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {LL.WINDOW.STAGE_LAYERS_HINT()}
            </Typography>
            {stageLayers.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {LL.WINDOW.STAGE_LAYERS_NONE()}
              </Typography>
            ) : groupStageLayers.length === 0 || groupData?.layers.overlays === false ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {LL.WINDOW.STAGE_LAYERS_NONE_HERE()}
              </Typography>
            ) : (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {groupStageLayers.map((layer) => (
                  <Chip key={layer.id} label={layer.name} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Box>

      {footer && <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>{footer}</Box>}
    </Stack>
  );
};

/** Geometry from the saved config, for a window that is not open to report live bounds. */
const boundsFromConfig = (config: WindowConfig): { x: number; y: number; width: number; height: number } | undefined => {
  const { positionX, positionY, width, height } = config;
  if (positionX === undefined || positionY === undefined || !width || !height) return undefined;
  return { x: positionX, y: positionY, width, height };
};
