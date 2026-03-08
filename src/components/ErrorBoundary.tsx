import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ClawSquire error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md text-center">
            <div className="text-5xl mb-4">🦞</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              ClawSquire encountered an unexpected error. Your data is safe.
            </p>

            {this.state.error && (
              <pre className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-left text-xs text-red-700 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}

            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                }}
                className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
              >
                Reload App
              </button>
            </div>

            <p className="mt-6 text-xs text-gray-400">
              If this keeps happening, please{' '}
              <a
                href="https://github.com/Jiansen/clawsquire/issues/new?template=bug_report.yml"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                report a bug
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
