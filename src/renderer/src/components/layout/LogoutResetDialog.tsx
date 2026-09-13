import { useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useLogout } from '@/hooks/useLogout';
import { isElectronApp, oidcLogoutUrl } from '@/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * `menu` (default): the profile menu of a signed-in user. `login`: "Trouble signing in?" on the
   * login page — no session to end, cookies preselected, and the desktop app clears its whole
   * cookie store.
   */
  context?: 'menu' | 'login';
};

/** A checkbox with a title and an explanation underneath. */
const ResetOption = ({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: ReactNode;
  hint: ReactNode;
}) => (
  <FormControlLabel
    control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />}
    label={
      <Stack sx={{ pt: 1 }}>
        <Typography variant="body1">{title}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {hint}
        </Typography>
      </Stack>
    }
    sx={{ alignItems: 'flex-start', mr: 0 }}
  />
);

/**
 * "Log out and reset": for a device stuck in a state a plain logout does not clear, such as
 * one that signs straight back in but sees no data. Cookies and local data are separate
 * choices — losing this device's settings is a price not every case needs to pay.
 */
export const LogoutResetDialog = ({ open, onClose, context = 'menu' }: Props) => {
  const { LL } = useI18nContext();
  const logout = useLogout();
  const fromLogin = context === 'login';
  const [cookies, setCookies] = useState(fromLogin);
  const [storage, setStorage] = useState(false);
  const [busy, setBusy] = useState(false);
  const R = LL.AUTH.LOGOUT_RESET;
  const anySelected = cookies || storage;
  const desktopClearsAll = fromLogin && isElectronApp();

  const confirm = async () => {
    setBusy(true);
    // Only from the login page: in the profile menu the session cookie still holds the id_token
    // the backend needs to end the provider session, so it must reach the backend first.
    if (cookies && desktopClearsAll) {
      try {
        await window.api?.clearAllCookies?.();
      } catch {
        // The backend still expires its own cookies on the way through the reset URL.
      }
    }
    logout({ cookies, storage });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{fromLogin ? R.LOGIN_TITLE() : R.TITLE()}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {fromLogin ? R.LOGIN_INTRO() : R.INTRO()}
          </Typography>
          <ResetOption
            checked={cookies}
            onChange={setCookies}
            title={R.COOKIES()}
            hint={desktopClearsAll ? R.COOKIES_HINT_DESKTOP() : R.COOKIES_HINT()}
          />
          <ResetOption checked={storage} onChange={setStorage} title={R.STORAGE()} hint={R.STORAGE_HINT()} />
          {storage && <Alert severity="warning">{R.STORAGE_WARNING()}</Alert>}
          {anySelected && (
            <Stack sx={{ gap: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {R.LINK_HINT()}
              </Typography>
              {/* The same URL the button opens — it works without a session, so it can be
                  sent to a device that cannot get as far as this menu. */}
              <Typography variant="caption" component="code" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>
                {oidcLogoutUrl({ cookies, storage })}
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {LL.COMMON.CANCEL()}
        </Button>
        <Button variant="contained" color="error" disabled={!anySelected || busy} onClick={() => void confirm()}>
          {fromLogin ? R.LOGIN_CONFIRM() : R.CONFIRM()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
