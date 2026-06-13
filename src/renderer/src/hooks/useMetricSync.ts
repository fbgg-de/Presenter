import { useEffect, useRef } from 'react';
import { useMetrics } from './useMetrics';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetSessionQuery } from '@/api/session.api';
import { peekQueue } from '@/utils/metricQueue';

/**
 * Mount this hook once (in App.tsx) to automatically flush the offline
 * metric queue whenever the app transitions from offline → online.
 *
 * It watches:
 *   1. The browser's `navigator.onLine` / `online` event.
 *   2. The Redux `offlineMode` flag (toggled by the user or ConnectivityChecker).
 *
 * Flushing is intentionally skipped until the session is confirmed as
 * authenticated so that queued metrics never trigger a 401 while on the
 * login page or during the initial session-check round-trip.
 */
export const useMetricSync = () => {
  const { flushQueue } = useMetrics();
  const { offlineMode } = useGetSettings();

  // Re-use the cached session result — no extra network request.
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const isAuthenticated = offlineMode || session?.isAuthenticated === true;

  const prevOfflineRef = useRef(offlineMode);

  // Flush when offlineMode transitions true → false (and authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (prevOfflineRef.current && !offlineMode) {
      void flushQueue();
    }
    prevOfflineRef.current = offlineMode;
  }, [offlineMode, flushQueue, isAuthenticated]);

  // Also flush on browser online event and on mount (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleOnline = () => {
      if (peekQueue().length > 0) void flushQueue();
    };
    window.addEventListener('online', handleOnline);
    // Flush on mount in case we came back online before the hook mounted
    handleOnline();
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue, isAuthenticated]);
};
