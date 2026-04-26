import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useGetSessionQuery } from '@/api/session.api';
import { useGetSettings } from '@/store/settingsSlice';

export const RequireAuth = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const { offlineMode } = useGetSettings();
  const { data, isLoading, isError } = useGetSessionQuery(undefined, { skip: offlineMode });

  // In offline mode, always allow access without authentication
  if (offlineMode) {
    return <>{children}</>;
  }

  if (isLoading) {
    return null;
  }

  const isAuthenticated = data?.isAuthenticated ?? false;

  if (isError || !isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
};
