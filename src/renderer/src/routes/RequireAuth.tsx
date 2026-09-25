import { useEffect, type PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useGetSessionQuery } from '@/api/session.api';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useAppSelector } from '@/store';

export const RequireAuth = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const { offlineMode, offlineFallback } = useGetSettings('offlineMode', 'offlineFallback');
  const updateSetting = useUpdateSetting();
  const hasSavedShow = useAppSelector((state) => state.show.currentShow !== null);
  const { data, isLoading, error } = useGetSessionQuery(undefined, { skip: offlineMode });

  // Opt-in startup fallback: the server never answered (no session yet) and a show is saved here →
  // present it offline instead of the login page. A 4xx means the server is up, so that still logs in.
  // ConnectivityChecker's snackbar tells the operator it happened.
  const status = error && 'status' in error ? error.status : undefined;
  const unreachable = !data && status !== undefined && (typeof status === 'string' || status >= 500);
  const fallBack = unreachable && offlineFallback && hasSavedShow && !offlineMode;
  useEffect(() => {
    if (fallBack) updateSetting('offlineMode', true);
  }, [fallBack, updateSetting]);

  // In offline mode, always allow access without authentication
  if (offlineMode) {
    return <>{children}</>;
  }

  if (isLoading || fallBack) {
    return null;
  }

  // Decided by the last good answer, not `isError`: RTK keeps `data` when a refetch fails, and a
  // network blip during a show must not unmount the operator view. A real expiry is handled by
  // SessionExpired's notice, which signs in again without leaving the page.
  if (!data?.isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
};
