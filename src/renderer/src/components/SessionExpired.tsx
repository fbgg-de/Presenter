/**
 * Keeps the sign-in alive without disturbing a running service:
 *
 * - **Expiring**: ten minutes before the session's ceiling (`expiresAt` from /rest/Session) a
 *   notice offers to renew it now.
 * - **Expired**: a 401 that the session check confirms shows a notice to sign in again.
 *
 * Both sign in again in a small window (`utils/relogin`), so the operator view — slides, windows,
 * running media — stays where it is; once the window reports back every cached query is fetched
 * again. Where that window cannot open (desktop app, blocked pop-up) the page itself goes to the
 * login and comes back to where it was.
 */
import { useEffect, useState, useCallback } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { API_TAG_TYPES, getBackendBaseUrl, presenterApi, SESSION_EXPIRED_EVENT } from '@/api/base.api';
import { useGetSessionQuery } from '@/api/session.api';
import { openReloginWindow, RELOGIN_DONE_MESSAGE } from '@/utils/relogin';

/** How long before the ceiling the renew notice appears. */
const WARN_BEFORE_MS = 10 * 60 * 1000;

const SessionExpired = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();

  const [expired, setExpired] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const { data: session } = useGetSessionQuery();
  const expiresAt = session?.isAuthenticated ? (session.expiresAt ?? null) : null;

  const handleRelogin = useCallback(() => {
    const popup = openReloginWindow();
    if (popup) {
      setWaiting(true);
      // Closed without finishing: the notice offers the sign-in again.
      const poll = window.setInterval(() => {
        if (!popup.closed) return;
        window.clearInterval(poll);
        setWaiting(false);
      }, 1000);
      return;
    }
    // Pass the current page as `next` so after re-login the user lands back here
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/login?next=' + next;
  }, []);

  // The sign-in window reports back: a fresh session — fetch everything that failed or went stale.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== RELOGIN_DONE_MESSAGE) return;
      setWaiting(false);
      setExpired(false);
      setExpiring(false);
      dispatch(presenterApi.util.invalidateTags([...API_TAG_TYPES]));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [dispatch]);

  // Ten minutes before the ceiling: offer to renew.
  useEffect(() => {
    if (!expiresAt) {
      setExpiring(false);
      return;
    }
    const warnIn = expiresAt * 1000 - WARN_BEFORE_MS - Date.now();
    if (warnIn <= 0) {
      setExpiring(expiresAt * 1000 > Date.now());
      return;
    }
    setExpiring(false);
    // Browsers fire timers beyond ~24.8 days (2^31 ms) at once; a sign-in lasting weeks re-arms
    // this from the next session read instead.
    if (warnIn > 2 ** 31 - 1) return;
    const timer = window.setTimeout(() => setExpiring(true), warnIn);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  useEffect(() => {
    const handler = async () => {
      // A 401 from a single endpoint does not necessarily mean the session
      // expired — it can be a per-resource permission denial while the user is
      // still validly logged in. Confirm with a fresh session check (the Session
      // endpoint is reachable unauthenticated) and only surface the warning when
      // we're genuinely logged out.
      //
      // A plain fetch, not the getSession query: writing "signed out" into that shared cache entry
      // made RequireAuth and App leave for the login page and dropped the WS sync (no wsHost) —
      // tearing down a running show. The cached session stays as it was until signing in again.
      try {
        const res = await fetch(`${getBackendBaseUrl()}/rest/Session`, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (res.ok && (await res.json())?.isAuthenticated === true) return; // still logged in — ignore the stray 401
      } catch {
        // Session check itself failed (network error / 401) → treat as expired.
      }
      setExpiring(false);
      setExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const minutesLeft = expiresAt ? Math.max(1, Math.round((expiresAt * 1000 - Date.now()) / 60000)) : 0;
  const open = expired || expiring;

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert
        severity={expired ? 'warning' : 'info'}
        variant="filled"
        onClose={() => (expired ? setExpired(false) : setExpiring(false))}
        action={
          <Button color="inherit" size="small" disabled={waiting} onClick={handleRelogin}>
            {expired ? LL.AUTH.LOGIN() : LL.AUTH.RENEW_SESSION()}
          </Button>
        }
      >
        {waiting ? LL.AUTH.RELOGIN_WAITING() : expired ? LL.AUTH.SESSION_EXPIRED() : LL.AUTH.SESSION_EXPIRING({ minutes: minutesLeft })}
      </Alert>
    </Snackbar>
  );
};

export default SessionExpired;
