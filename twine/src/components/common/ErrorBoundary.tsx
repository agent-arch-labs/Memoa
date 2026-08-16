import { Component, type ReactNode, type ErrorInfo } from "react";
import { IconWarning } from "./Icons";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
    this.props.onError?.(error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="text-4xl mb-3"><IconWarning size={32} /></div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            组件渲染异常
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mb-4 max-w-md break-all">
            {this.state.error?.message || "未知错误"}
          </p>
          <button
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
            onClick={this.handleReset}
          >
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}