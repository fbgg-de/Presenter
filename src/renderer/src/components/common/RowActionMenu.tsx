import { useState, type MouseEvent, type ReactNode } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { MoreVert as MoreIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';

export type RowAction = {
  /** Stable identity for the React key. */
  key: string;
  /** Menu label — full words, not the terse tooltip a bare icon has to make do with. */
  label: string;
  icon: ReactNode;
  /**
   * Receives the overflow button itself, so an action that opens a popover of its own has something
   * still-mounted to anchor to (the menu is gone by the time this runs).
   */
  onClick: (anchor: HTMLElement) => void;
  disabled?: boolean;
  /** Renders the entry in the error colour (destructive actions). */
  destructive?: boolean;
  /** Leave the action out entirely (as opposed to showing it disabled). */
  hidden?: boolean;
};

/**
 * Collapses a cluster of per-row icon buttons into a single overflow button with a labelled menu.
 *
 * On a phone a row of four icon buttons eats the width the title needs and gives the user
 * 24px targets with no labels; one menu button costs a single tap and can spell each action
 * out. Callers keep the plain icon buttons on wider screens, where hover tooltips work and
 * the width is there — so this is normally rendered behind a `useIsMobile()` check.
 *
 * Clicks are stopped from propagating: these rows sit inside a ListItemButton whose own
 * onClick would otherwise fire (React events bubble through the portal that hosts the menu).
 */
export const RowActionMenu = ({
  actions,
  size = 'small',
  edge = 'end',
}: {
  actions: RowAction[];
  size?: 'small' | 'medium';
  edge?: 'end' | false;
}) => {
  const { LL } = useI18nContext();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const visible = actions.filter((action) => !action.hidden);

  if (visible.length === 0) return null;

  const close = (event?: MouseEvent) => {
    event?.stopPropagation();
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title={LL.COMMON.MORE_ACTIONS()}>
        <IconButton
          edge={edge}
          size={size}
          aria-label={LL.COMMON.MORE_ACTIONS()}
          onClick={(event) => {
            event.stopPropagation();
            setAnchor(event.currentTarget);
          }}
        >
          <MoreIcon fontSize={size === 'small' ? 'small' : 'medium'} />
        </IconButton>
      </Tooltip>
      <Menu
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => close()}
        onClick={(event) => event.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {visible.map((action) => (
          <MenuItem
            key={action.key}
            disabled={action.disabled}
            onClick={(event) => {
              const button = anchor;
              close(event);
              if (button) action.onClick(button);
            }}
            sx={action.destructive ? { color: 'error.main' } : undefined}
          >
            <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>{action.icon}</ListItemIcon>
            <ListItemText slotProps={{ primary: { variant: 'body2' } }}>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
