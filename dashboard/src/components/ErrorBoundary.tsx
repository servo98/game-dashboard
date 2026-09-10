import { Component, type ReactNode } from "react";
import { api } from "../api";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    api
      .reportError({
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        component: "ErrorBoundary",
      })
      .catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4">
          <div className="bg-surface border border-danger/35 rounded-lg p-6 max-w-md w-full text-center">
            <p className="text-title font-semibold text-danger mb-2">Algo se ha roto</p>
            <p className="text-body text-muted mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="tap px-4 py-2 bg-accent hover:bg-accent/90 text-accent-ink text-body font-medium rounded-md transition-colors"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
