/**
 * What a screen preview in the top bar opens: the windows of that screen group, each with its quick
 * toggles (open, show/hide, and the full quick actions), plus adding a window and the Window
 * Manager. It replaces the window chips the footer used to repeat below the layer rows.
 */
import { useState, type MouseEvent } from 'react';
import { Box, Button, Divider, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material';
import {
  Add as AddIcon,
  Cast as StreamIcon,
  Monitor as NormalIcon,
  MoreHoriz as MoreIcon,
  PlayArrow as OpenIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideWindowIcon,
  Window as WindowManagerIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { toggleFreezeWindow } from '@/store/presentationSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import type { usePresentationWindows, RigWindow } from '@/hooks/usePresentationWindows';
import { WindowQuickActions } from '@/components/layout/WindowQuickActions';
import type { ScreenInfo } from '@/components/layout/ScreenPicker';

/** Ask the Window Manager (hosted by the operator status) to open, optionally on a window or the new-window form. */
export const openWindowManager = (detail: { withNew?: boolean; selectId?: string } = {}) =>
  window.dispatchEvent(new CustomEvent('presenter:open-window-manager', { detail }));

export const MonitorWindowsMenu = ({
  anchorEl,
  title,
  windows,
  rig,
  onClose,
}: {
  anchorEl: HTMLElement | null;
  /** The screen group's name. */
  title: string;
  windows: RigWindow[];
  rig: ReturnType<typeof usePresentationWindows>;
  onClose: () => void;
}) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { data: screenGroups = [] } = useGetScreenGroupsQuery();
  const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null);
  const [actionsWindowId, setActionsWindowId] = useState<string | null>(null);
  const actionsWindow = rig.windows.find((w) => w.id === actionsWindowId);

  const closeActions = () => {
    setActionsAnchor(null);
    setActionsWindowId(null);
  };
  const closed = windows.filter((w) => !w.isOpen);

  return (
    <>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { width: 300, py: 1 } } }}
      >
        <Typography variant="subtitle2" sx={{ px: 2, pb: 0.5, fontWeight: 700 }}>
          {title}
        </Typography>
        {windows.length === 0 && (
          <Typography variant="body2" sx={{ px: 2, py: 0.5, color: 'text.secondary' }}>
            {LL.FOOTER.NO_WINDOWS()}
          </Typography>
        )}
        <Stack>
          {windows.map((win) => (
            <Stack key={win.id} direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 0.25, minHeight: 36 }}>
              <Box sx={{ color: win.isOpen && !win.hidden ? 'error.main' : 'text.disabled', display: 'flex' }}>
                {win.stream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />}
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {win.name}
                </Typography>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
                  {[
                    !win.isOpen ? LL.WINDOW.CLOSED() : null,
                    win.hidden ? LL.FOOTER.HIDE_WINDOW() : null,
                    win.frozen ? LL.FOOTER.FREEZE() : null,
                    win.screen?.label,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </Stack>
              {win.isOpen ? (
                <>
                  <Tooltip title={win.hidden ? LL.FOOTER.SHOW_WINDOW() : LL.FOOTER.HIDE_WINDOW()}>
                    <IconButton
                      size="small"
                      color={win.hidden ? 'warning' : 'default'}
                      onClick={() => void rig.setHidden(win.id, !win.hidden)}
                    >
                      {win.hidden ? <ShowIcon fontSize="small" /> : <HideWindowIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={LL.OPERATOR.WINDOW_MORE()}>
                    <IconButton
                      size="small"
                      onClick={(e: MouseEvent<HTMLElement>) => {
                        setActionsAnchor(e.currentTarget);
                        setActionsWindowId(win.id);
                      }}
                    >
                      <MoreIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <Tooltip title={LL.OPERATOR.OPEN_WINDOW()}>
                  <IconButton size="small" color="primary" onClick={() => void rig.open(win.id)}>
                    <OpenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ))}
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, flexWrap: 'wrap' }}>
          {closed.length > 1 && (
            <Button size="small" startIcon={<OpenIcon />} onClick={() => closed.forEach((w) => void rig.open(w.id))}>
              {LL.WINDOW.OPEN_ALL()}
            </Button>
          )}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              onClose();
              openWindowManager({ withNew: true });
            }}
          >
            {LL.WINDOW.ADD()}
          </Button>
          <Button
            size="small"
            color="inherit"
            startIcon={<WindowManagerIcon />}
            onClick={() => {
              onClose();
              openWindowManager();
            }}
          >
            {LL.HEADER.WINDOW_MANAGER()}
          </Button>
        </Stack>
      </Popover>

      <WindowQuickActions
        anchorEl={actionsAnchor}
        window={actionsWindow}
        screenGroups={screenGroups}
        screens={rig.screens}
        onClose={closeActions}
        onUpdate={(patch) => actionsWindow && void rig.update(actionsWindow.id, patch)}
        onToggleFreeze={() => actionsWindow && dispatch(toggleFreezeWindow(actionsWindow.name))}
        onToggleHidden={() => actionsWindow && void rig.setHidden(actionsWindow.id, !actionsWindow.hidden)}
        onBringToFront={() => {
          if (actionsWindow?.runtimeId) void window.api?.focusPresentationWindow?.(actionsWindow.runtimeId);
          closeActions();
        }}
        onCloseWindow={() => {
          if (actionsWindow) void rig.close(actionsWindow.id);
          closeActions();
        }}
        onMoveToScreen={(screen: ScreenInfo) => {
          if (!actionsWindow) return;
          void rig.update(actionsWindow.id, {
            positionX: screen.bounds.x,
            positionY: screen.bounds.y,
            width: screen.bounds.width,
            height: screen.bounds.height,
          });
        }}
        onOpenSettings={() => {
          const id = actionsWindow?.id;
          closeActions();
          onClose();
          openWindowManager({ selectId: id });
        }}
      />
    </>
  );
};
