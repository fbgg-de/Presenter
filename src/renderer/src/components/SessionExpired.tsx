import { useEffect, useState, useCallback } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { SESSION_EXPIRED_EVENT } from '@/api/base.api';
import { useLazyGetSessionQuery } from '@/api/session.api';

const SessionExpired = () => {
  const { LL } = useI18nContext();

  const [open, setOpen] = useState(false);
  const [checkSession] = useLazyGetSessionQuery();

  const handleRelogin = useCallback(() => {
    setOpen(false);
    // Pass the current page as `next` so after re-login the user lands back here
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/login?next=' + next;
  }, []);

  useEffect(() => {
    const handler = async () => {
      // A 401 from a single endpoint does not necessarily mean the session
      // expired — it can be a per-resource permission denial while the user is
      // still validly logged in. Confirm with a fresh session check (the Session
      // endpoint is reachable unauthenticated) and only surface the warning when
      // we're genuinely logged out.
      try {
        const session = await checkSession(undefined, false).unwrap();
        if (session?.isAuthenticated === true) return; // still logged in — ignore the stray 401
      } catch {
        // Session check itself failed (network error / 401) → treat as expired.
      }
      setOpen(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [checkSession]);

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} onClose={() => setOpen(false)}>
      <Alert
        severity="warning"
        variant="filled"
        onClose={() => setOpen(false)}
        action={
          <Button color="inherit" size="small" onClick={handleRelogin}>
            {LL.AUTH.LOGIN()}
          </Button>
        }
      >
        {LL.AUTH.SESSION_EXPIRED()}
      </Alert>
    </Snackbar>
  );
};

export default SessionExpired;
