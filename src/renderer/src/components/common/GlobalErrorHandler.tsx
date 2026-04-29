import { useCallback, useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useMetrics } from '@/hooks/useMetrics';
import { useGetSettings } from '@/store/settingsSlice';

interface ErrorInfo {
  message: string;
  stack?: string;
  source?: string;
}

/**
 * Global error handler component.
 * - Listens for uncaught errors and unhandled promise rejections.
 * - Sends all such errors to the metrics API.
 * - Shows a Snackbar notification (configurable via settings: errorBoundaryNotification).
 *
 * Place this inside the Redux Provider and TypesafeI18n context in App.tsx.
 */
export const GlobalErrorHandler = ({ boundaryError }: { boundaryError?: Error | null }) => {
  const { trackEvent } = useMetrics();
  const { errorBoundaryNotification } = useGetSettings();
  const [notification, setNotification] = useState<ErrorInfo | null>(null);

  const report = useCallback(
    (info: ErrorInfo) => {
      trackEvent('uncaught_error', undefined, undefined, {
        message: info.message,
        stack: info.stack,
        source: info.source,
      });
      if (errorBoundaryNotification) {
        setNotification(info);
      }
    },
    [trackEvent, errorBoundaryNotification],
  );

  // React ErrorBoundary errors passed via prop
  useEffect(() => {
    if (boundaryError) {
      report({ message: boundaryError.message, stack: boundaryError.stack, source: 'react_boundary' });
    }
  }, [boundaryError, report]);

  // Global window errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      report({ message: event.message, stack: event.error?.stack, source: 'window_onerror' });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      report({ message: err.message, stack: err.stack, source: 'unhandled_rejection' });
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [report]);

  return (
    <Snackbar
      open={!!notification}
      autoHideDuration={6000}
      onClose={() => setNotification(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert severity="error" onClose={() => setNotification(null)} sx={{ maxWidth: 420, wordBreak: 'break-word' }}>
        {notification?.message ?? ''}
      </Alert>
    </Snackbar>
  );
};

