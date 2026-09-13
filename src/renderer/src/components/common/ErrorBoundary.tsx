import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

/**
 * React class-based error boundary.
 * Catches render/lifecycle errors in the subtree and calls onError for reporting.
 * Renders a recovery action until the operator retries. Re-rendering a failing child
 * immediately would throw from the boundary itself and unmount the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) return <ErrorRecovery onRetry={() => this.setState({ hasError: false, error: null })} />;
    return this.props.children;
  }
}

function ErrorRecovery({ onRetry }: { onRetry: () => void }) {
  const { locale } = useI18nContext();
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error" action={<Button onClick={onRetry}>{locale === 'de' ? 'Erneut versuchen' : 'Try again'}</Button>}>
        {locale === 'de'
          ? 'Diese Ansicht konnte nicht angezeigt werden. Bitte versuche es erneut.'
          : 'This view could not be displayed. Please try again.'}
      </Alert>
    </Box>
  );
}
