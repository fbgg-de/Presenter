import { Component, type ErrorInfo, type ReactNode } from 'react';

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
 * Does NOT show a fallback UI — it lets the app continue best-effort.
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
    // Reset after reporting so the app can recover on next render
    this.setState({ hasError: false, error: null });
  }

  render() {
    return this.props.children;
  }
}

