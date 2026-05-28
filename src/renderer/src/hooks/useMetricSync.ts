import { useEffect, useRef } from 'react';
import { useMetrics } from './useMetrics';
import { useGetSettings } from '@/store/settingsSlice';
import { peekQueue } from '@/utils/metricQueue';

/**
 * Mount this hook once (in App.tsx) to automatically flush the offline
 * metric queue whenever the app transitions from offline → online.
 *
 * It watches:
 *   1. The browser's `navigator.onLine` / `online` event.
 *   2. The Redux `offlineMode` flag (toggled by the user or ConnectivityChecker).
 */
export const useMetricSync = () => {
  const { flushQueue } = useMetrics();
  const { offlineMode } = useGetSettings();
  const prevOfflineRef = useRef(offlineMode);

  // Flush when offlineMode transitions true → false
  useEffect(() => {
    if (prevOfflineRef.current && !offlineMode) {
      void flushQueue();
    }
    prevOfflineRef.current = offlineMode;
  }, [offlineMode, flushQueue]);

  // Also flush on browser online event and on mount (in case queue has entries)
  useEffect(() => {
    const handleOnline = () => {
      if (peekQueue().length > 0) void flushQueue();
    };
    window.addEventListener('online', handleOnline);
    // Flush on mount in case we came back online before the hook mounted
    handleOnline();
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue]);
};
