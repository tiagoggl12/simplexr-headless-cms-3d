/**
 * ErrorBoundary Component
 * Catches React errors and displays a fallback UI
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Error caught:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    // In production, you might want to send this to an error tracking service
    // like Sentry, LogRocket, etc.
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-16 h-16 mb-4 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Algo deu errado
          </h2>
          <p className="text-gray-600 mb-6 max-w-md">
            Ocorreu um erro inesperado. Nossa equipe foi notificada e estamos
            trabalhando para resolver o problema.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <div className="mb-6 p-4 bg-gray-100 rounded-lg text-left max-w-2xl overflow-auto">
              <p className="font-mono text-sm text-red-600">
                {this.state.error.message}
              </p>
              {this.state.error.stack && (
                <pre className="mt-2 text-xs text-gray-600 overflow-auto">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}
          <div className="flex gap-4">
            <Button variant="secondary" onClick={this.handleRetry}>
              Recarregar página
            </Button>
            <Button variant="primary" onClick={() => window.history.back()}>
              Voltar
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper for convenience
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
): React.ComponentType<P> {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
