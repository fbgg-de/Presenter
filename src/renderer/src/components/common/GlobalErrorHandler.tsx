import { useCallback, useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useMetrics } from '@/hooks/useMetrics';
import { useGetSettings } from '@/store/settingsSlice';
import { reportClientError, type ClientErrorSource } from '@/utils/clientErrorLog';

interface ErrorInfo {
  message: string;
  stack?: string;
  source?: ClientErrorSource;
}

/**
 * The in-app half of error handling: metrics, and the snackbar that tells the operator something
 * broke (settings: errorBoundaryNotification).
 *
 * Forwarding to the server log is not done here. `utils/clientErrorLog` owns that and starts
 * listening before React does, so boot failures are reported too; this component only hands it
 * the errors React catches on its own. Place inside the Redux Provider and TypesafeI18n context.
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

  // A render that threw never reaches the window handlers, so the boundary reports it itself.
  useEffect(() => {
    if (!boundaryError) return;

    const info: ErrorInfo = { message: boundaryError.message, stack: boundaryError.stack, source: 'react_boundary' };

    reportClientError({ ...info, source: 'react_boundary' });
    report(info);
  }, [boundaryError, report]);

  // Uncaught errors and rejections are already on their way to the log — `clientErrorLog` has been
  // listening since before this component existed. Mirror them into metrics and the snackbar.
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (!event.message) return; // a failed resource load, reported but not worth a toast
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
