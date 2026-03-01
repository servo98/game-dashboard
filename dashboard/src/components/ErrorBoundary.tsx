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
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-800 rounded-2xl p-6 max-w-md w-full text-center">
            <p className="text-lg font-semibold text-red-400 mb-2">Something went wrong</p>
            <p className="text-sm text-gray-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
