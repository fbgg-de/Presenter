/**
 * The operator view's top bar: what is running, which mode the operator is in, and a monitor
 * per screen group — so "what does the stage see right now?" is answered without looking up.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import {
  Menu as SetListClosedIcon,
  MenuOpen as SetListOpenIcon,
  ViewSidebar as SidePanelOpenIcon,
  ViewSidebarOutlined as SidePanelClosedIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { usePresentationWindows } from '@/hooks/usePresentationWindows';
import { useActiveLook } from '@/hooks/useActiveLook';
import { lookVariesByGroup, resolveLook } from '@/look/resolveLook';
import { normaliseScreenGroupData } from '@/screens/types';
import type { BackgroundData } from '@/look/types';
import { mediaForScreen, usePlaybacks } from '@/media/playback';
import type { CuePacket } from '@/media/types';
import { parseTaggedLine } from '@/song';
import { versePages } from '@/utils/itemBlocks';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import { StageScreen } from '@/presentation/StageScreen';
import type { StageFrame } from '@/presentation/stageFrame';
import Footer from '@/components/layout/Footer';
import { GroupMonitor } from './GroupMonitor';
import { MonitorWindowsMenu, openWindowManager } from './MonitorWindowsMenu';
import { sidePanelState, sidePanelVisible, toggleSidePanel } from './sidePanel';
import { ViewMenu } from './ViewMenu';
import { ReadinessChip } from './ReadinessChip';
import { formatShowDate } from '@/utils/agendaText';
import { useShortcut, withShortcut } from '@/hooks/useShortcut';
import { MONITOR_DEFAULT, MONITOR_RANGE, clampSize, useCtrlWheelSize } from './tileSize';

/** Smaller icon buttons for the grouped clusters, so two rows fit beside the screen previews. */
const compactIcons = {
  '& .MuiIconButton-root': { p: 0.5, borderRadius: 0.75 },
  '& .MuiIconButton-root .MuiSvgIcon-root': { fontSize: 19 },
} as const;

/**
 * A labelled strip of tools, like an editing suite's toolbar groups: a tiny caption over the icons
 * in a shared frame. Hidden while none of its slots got a button.
 */
const ToolStrip = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack spacing={0.25} sx={{ '&:not(:has(button))': { display: 'none' } }}>
    <Typography
      component="span"
      sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'text.disabled', pl: 0.5, lineHeight: 1 }}
    >
      {label}
    </Typography>
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 0.25,
        p: 0.25,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'rgba(255,255,255,0.035)',
        ...compactIcons,
      }}
    >
      {children}
    </Stack>
  </Stack>
);

export const OperatorTopBar = ({
  showsActionsRef,
  listActionsRef,
  saveActionRef,
  appActionsRef,
  devicesActionsRef,
}: {
  /** Slot next to the show title where the set list's show actions (search, add, save…) are portalled. */
  /** Slot for opening shows. */
  showsActionsRef?: (node: HTMLElement | null) => void;
  /** Slot for set lists and search. */
  listActionsRef?: (node: HTMLElement | null) => void;
  /** Slot for saving the show, above the set list toggle. */
  saveActionRef?: (node: HTMLElement | null) => void;
  /** Slot at the right end for the app-wide actions (account, settings). */
  appActionsRef?: (node: HTMLElement | null) => void;
  /** Slot for opening the other screens (phone control page, musician view). */
  devicesActionsRef?: (node: HTMLElement | null) => void;
}) => {
  const { LL, locale } = useI18nContext();
  const O = LL.OPERATOR;
  const settings = useGetSettings(
    'operatorMode',
    'operatorMonitorWidth',
    'operatorSetListOpen',
    'operatorSidePanelOpen',
    'operatorInspectorOpen',
    'operatorPreviewOpen',
  );
  const { operatorMode, operatorMonitorWidth, operatorSetListOpen } = settings;
  // Older stored settings have no width yet; keep it inside the slider's range either way.
  const monitorWidth = clampSize(operatorMonitorWidth, MONITOR_RANGE, MONITOR_DEFAULT);
  const updateSetting = useUpdateSetting();
  const setMonitorWidth = useCallback((width: number) => updateSetting('operatorMonitorWidth', width), [updateSetting]);
  const monitorWheelRef = useCtrlWheelSize(monitorWidth, MONITOR_RANGE, setMonitorWidth);
  // Stored settings from before the toggles existed read as open.
  const setListOpen = operatorSetListOpen !== false;
  const sidePanel = sidePanelState(settings);
  const sidePanelOpen = sidePanelVisible(sidePanel);
  const setListKey = useShortcut('toggle_set_list');
  // The action keeps its stored id; it toggles the whole side panel now.
  const sidePanelKey = useShortcut('toggle_inspector');
  const { currentShow } = useGetShow();
  const showDate = formatShowDate(currentShow?.date, locale);

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: 'center',
        px: 1,
        py: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        minHeight: 0,
        // The page is a column that shrinks its children to fit; the bar keeps the height of its
        // screen previews instead of letting their captions spill over the slides.
        flexShrink: 0,
        // Live is noticeable without reading the toggle: a red rule along the whole bar.
        boxShadow: (theme) => (operatorMode === 'live' ? `inset 0 -3px 0 ${theme.palette.error.main}` : 'none'),
      }}
    >
      {/* Left edge: the set list toggle. */}
      <Tooltip title={withShortcut(setListOpen ? O.HIDE_SET_LIST() : O.SHOW_SET_LIST(), setListKey)}>
        <IconButton
          size="small"
          color={setListOpen ? 'primary' : 'default'}
          onClick={() => updateSetting('operatorSetListOpen', !setListOpen)}
          sx={{ flexShrink: 0 }}
        >
          {setListOpen ? <SetListOpenIcon /> : <SetListClosedIcon />}
        </IconButton>
      </Tooltip>

      {/* The show: its title (with Save beside it while there are changes) over its date. Then the
          tools in three labelled strips — the show, the screens, the app — like an editing suite's
          toolbar, and under them the mode with the connections. The Footer hosts the dialogs. */}
      <Footer
        variant="status"
        layout={({ connections, styleEditor }) => (
          <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0, minWidth: 0, alignItems: 'center' }}>
            <Stack sx={{ minWidth: 0, width: 190 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography
                  noWrap
                  title={[currentShow?.title, showDate].filter(Boolean).join(' · ')}
                  sx={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3, minWidth: 0 }}
                >
                  {currentShow?.title}
                </Typography>
                <Stack ref={saveActionRef} direction="row" sx={{ flexShrink: 0, ...compactIcons, '&:empty': { display: 'none' } }} />
              </Stack>
              {showDate && (
                <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
                  {showDate}
                </Typography>
              )}
            </Stack>
            <Stack spacing={0.75} sx={{ flexShrink: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-end' }}>
                <ToolStrip label={O.TOOLS_SHOW()}>
                  <Stack ref={showsActionsRef} direction="row" sx={{ alignItems: 'center', '&:empty': { display: 'none' } }} />
                  <Stack ref={listActionsRef} direction="row" sx={{ alignItems: 'center', '&:empty': { display: 'none' } }} />
                </ToolStrip>
                <ToolStrip label={O.TOOLS_SCREENS()}>
                  {styleEditor}
                  <Stack ref={devicesActionsRef} direction="row" sx={{ alignItems: 'center', '&:empty': { display: 'none' } }} />
                </ToolStrip>
                <ToolStrip label={O.TOOLS_APP()}>
                  <Stack ref={appActionsRef} direction="row" sx={{ alignItems: 'center', '&:empty': { display: 'none' } }} />
                </ToolStrip>
              </Stack>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={operatorMode}
                  onChange={(_, mode: 'prepare' | 'live' | null) => mode && updateSetting('operatorMode', mode)}
                  sx={{ '& .MuiToggleButton-root': { py: 0.25, lineHeight: 1.5 } }}
                >
                  <Tooltip title={O.MODE_PREPARE_HINT()}>
                    <ToggleButton
                      value="prepare"
                      sx={{
                        textTransform: 'none',
                        px: 1.5,
                        // Green while preparing, red while live: the mode is read without looking twice.
                        '&.Mui-selected': {
                          bgcolor: 'success.main',
                          color: 'success.contrastText',
                          '&:hover': { bgcolor: 'success.dark' },
                        },
                      }}
                    >
                      {O.MODE_PREPARE()}
                    </ToggleButton>
                  </Tooltip>
                  <Tooltip title={O.MODE_LIVE_HINT()}>
                    <ToggleButton
                      value="live"
                      sx={{
                        textTransform: 'none',
                        px: 1.5,
                        '&.Mui-selected': { bgcolor: 'error.main', color: 'error.contrastText', '&:hover': { bgcolor: 'error.dark' } },
                      }}
                    >
                      ● {O.MODE_LIVE()}
                    </ToggleButton>
                  </Tooltip>
                </ToggleButtonGroup>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', '& .MuiChip-root': { height: 24 } }}>
                  {/* A pre-service check: in Live it is too late to act on, and it only takes room. */}
                  {operatorMode !== 'live' && <ReadinessChip />}
                  {connections}
                </Stack>
              </Stack>
            </Stack>
          </Stack>
        )}
      />

      <MonitorStrip boxRef={monitorWheelRef} monitorWidth={monitorWidth} />

      {/* Right edge: the View menu above the side panel toggle. */}
      <Stack sx={{ flexShrink: 0, alignItems: 'center', gap: 0.25 }}>
        <Stack sx={{ minHeight: 34, justifyContent: 'center' }}>
          <ViewMenu />
        </Stack>
        <Tooltip title={withShortcut(sidePanelOpen ? O.HIDE_SIDE_PANEL() : O.SHOW_SIDE_PANEL(), sidePanelKey)}>
          <IconButton
            size="small"
            color={sidePanelOpen ? 'primary' : 'default'}
            onClick={() => toggleSidePanel(sidePanel, updateSetting)}
            aria-label={sidePanelOpen ? O.HIDE_SIDE_PANEL() : O.SHOW_SIDE_PANEL()}
          >
            {sidePanelOpen ? <SidePanelOpenIcon /> : <SidePanelClosedIcon />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
};

/**
 * A monitor per screen group. Its own component because it follows the live slide and the
 * playing media (four updates a second while a video runs): in the bar itself every one of
 * those re-rendered the title, the tool strips and the footer controls too.
 */
const MonitorStrip = ({ boxRef, monitorWidth }: { boxRef: (node: HTMLElement | null) => void; monitorWidth: number }) => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const { operatorMode } = useGetSettings('operatorMode');
  const { isBlack, isTextHidden, videoVisible, mediaVisible } = useGetPresentationSettings(
    'isBlack',
    'isTextHidden',
    'videoVisible',
    'mediaVisible',
  );
  const playbacks = usePlaybacks();
  const { data: groups = [] } = useGetScreenGroupsQuery();
  const rig = usePresentationWindows();
  const { input, item, song, blocks } = useActiveLook();
  const { activeBlockIndex } = useGetPresentationSettings('activeBlockIndex');
  // The screen preview whose windows menu is open.
  const [windowsMenu, setWindowsMenu] = useState<{ anchor: HTMLElement; key: string } | null>(null);

  // What a stage screen draws right now, for a Stage group's tile — the same frame the window builds.
  const stageFrame = useMemo<StageFrame>(() => {
    const primary = (raw: string[]) => {
      const parsed = raw.map(parseTaggedLine);
      const main = parsed.filter((line) => !line.language);
      return (main.length ? main : parsed).map((line) => line.text).filter((text) => text.trim());
    };
    const sections =
      item?.type === 'song'
        ? blocks.map((block) => ({ name: block.name, lines: primary(block.lines) }))
        : item?.type === 'bible_verse'
          ? versePages(item).map((page) => ({ name: page.name, lines: page.lines.filter((line) => line.trim()) }))
          : [];
    const current = sections[activeBlockIndex];
    const next = sections[activeBlockIndex + 1];
    return {
      kind: item?.type ?? 'empty',
      title: item?.type === 'bible_verse' ? item.bibleRef : (song?.title ?? item?.label),
      songKey: item?.type === 'song' ? item.key || parseOrderKey(item.order).key : undefined,
      sections: sections.map((section) => section.name),
      activeIndex: activeBlockIndex,
      current: current?.lines ?? [],
      next: next ? { name: next.name, lines: next.lines } : undefined,
      textHidden: isTextHidden,
    };
  }, [item, song, blocks, activeBlockIndex, isTextHidden]);

  // The first lines of what is on screen: primary lyric lines, or the verse text.
  const lines = useMemo(() => {
    if (item?.type === 'song') {
      const parsed = (blocks[activeBlockIndex]?.lines ?? []).map(parseTaggedLine);
      const primary = parsed.filter((line) => !line.language);
      return (primary.length ? primary : parsed).map((line) => line.text).slice(0, 2);
    }
    if (item?.type === 'bible_verse') return (versePages(item)[activeBlockIndex]?.lines ?? []).filter((line) => line.trim()).slice(0, 2);
    return [];
  }, [item, blocks, activeBlockIndex]);

  // A colour entry fills the screen; images and videos come from what is running on each group.
  const colour: BackgroundData | undefined =
    item?.type === 'media' && item.mediaSubType === 'color' ? { color: item.mediaColor } : undefined;
  const thumbOf = (packet: CuePacket | undefined): BackgroundData | undefined => {
    if (!packet || packet.visible === false) return undefined;
    const source = packet.cue.sources.find((s) => s.id === packet.assignment?.sourceId);
    return source
      ? { [source.type]: { path: source.path, fit: packet.assignment?.frame.fit === 'contain' ? 'contain' : 'cover' } }
      : undefined;
  };

  /** Open a group's closed windows — or, when it has none yet, the Window Manager to add one. */
  const openWindows = (windows: typeof rig.windows) => {
    if (windows.length === 0) {
      openWindowManager({ withNew: true });
      return;
    }
    for (const win of windows) if (!win.isOpen) void rig.open(win.id);
  };

  const monitors = useMemo(() => {
    const varies = lookVariesByGroup(input);
    const openLabel = (windows: typeof rig.windows) => O.MONITOR_WINDOWS({ count: windows.length });
    if (groups.length === 0) {
      return [
        {
          key: 'all',
          label: O.MONITOR_ALL(),
          sublabel: openLabel(rig.windows),
          windows: rig.windows,
          live: rig.windows.some((w) => w.isOpen),
          style: resolveLook(input).style,
          layers: undefined,
        },
      ];
    }
    return groups
      .filter((group) => group.enabled)
      .map((group) => {
        const windows = rig.windows.filter((w) => w.config.screenGroupId === group.id);
        return {
          key: String(group.id),
          label: group.name,
          sublabel: openLabel(windows),
          windows,
          live: windows.some((w) => w.isOpen),
          style: resolveLook(input, varies ? String(group.id) : undefined).style,
          layers: normaliseScreenGroupData(group.data).layers,
          stageLayout: normaliseScreenGroupData(group.data).stage,
        };
      });
    // `rig.windows` is a fresh array per poll; its identity is what should drive this.
  }, [input, groups, rig.windows, O]);

  return (
    <>
      <Box ref={boxRef} sx={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end', width: 'max-content', ml: 'auto', py: 0.5, px: 0.5 }}>
          {monitors.map((monitor) => {
            const layers = monitor.layers;
            const mediaShown = item?.type !== 'media' || !layers || layers.media;
            const running = mediaForScreen(playbacks, monitor.key === 'all' ? undefined : Number(monitor.key), {
              backgroundVisible: videoVisible,
              contentVisible: mediaVisible,
            });
            const content = thumbOf(running.contents.filter((packet) => packet.visible !== false).at(-1)) ?? colour;
            const textLayer = !layers || (item?.type === 'bible_verse' ? layers.bibleVerses : layers.slides);
            return (
              <GroupMonitor
                key={monitor.key}
                label={monitor.label}
                sublabel={monitor.sublabel}
                style={monitor.style}
                media={mediaShown ? content : undefined}
                background={thumbOf(running.background)}
                lines={lines}
                showText={textLayer && !isTextHidden && mediaShown}
                showBackground={!layers || layers.background}
                black={isBlack}
                blackLabel={O.MONITOR_BLACK()}
                live={monitor.live}
                width={monitorWidth}
                // Setting up a window for a group that has none is preparation; reopening one is not.
                onOpen={operatorMode === 'live' && monitor.windows.length === 0 ? undefined : () => openWindows(monitor.windows)}
                // A Stage group's tile shows the real stage screen, not the audience picture.
                picture={
                  'stageLayout' in monitor && monitor.stageLayout ? (
                    <StageScreen frame={stageFrame} settings={monitor.stageLayout} />
                  ) : undefined
                }
                openLabel={monitor.windows.length > 0 ? O.OPEN_WINDOW() : O.ADD_WINDOW()}
                onShowWindows={(anchor) => setWindowsMenu({ anchor, key: monitor.key })}
                showWindowsLabel={O.MONITOR_WINDOWS_MENU()}
              />
            );
          })}
        </Stack>
      </Box>

      {(() => {
        const monitor = monitors.find((m) => m.key === windowsMenu?.key);
        return (
          <MonitorWindowsMenu
            anchorEl={monitor ? (windowsMenu?.anchor ?? null) : null}
            title={monitor?.label ?? ''}
            windows={monitor?.windows ?? []}
            rig={rig}
            onClose={() => setWindowsMenu(null)}
          />
        );
      })()}
    </>
  );
};
