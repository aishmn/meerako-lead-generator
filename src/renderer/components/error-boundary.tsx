import React from 'react';

type ErrorBoundaryProps = {
  section: string;
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[renderer] page render failed', { error, info });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (prevProps.section !== this.props.section && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <h2 className="mb-2 text-lg font-semibold text-destructive">Page failed to render</h2>
          <p className="mb-2 text-sm text-destructive/90">
            Section: <strong>{this.props.section}</strong>
          </p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive/90">
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack ?? ''}
          </pre>
        </div>
      </div>
    );
  }
}
