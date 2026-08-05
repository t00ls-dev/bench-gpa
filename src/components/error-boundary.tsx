import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/tanstackstart-react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: { componentStack: string }) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Always reports, not only when the caller passes onError: without
    // this, a render error caught here went nowhere, not even the
    // console. The 6 current usages (Dashboard) didn't pass onError, so
    // they were 100% silent.
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="kpi-card flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="mb-3 size-8 text-destructive" />
        <h2 className="text-lg font-semibold">Algo deu errado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {this.state.error.message || "Ocorreu um erro inesperado ao carregar este componente."}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-muted"
        >
          <RefreshCw className="size-3.5" /> Tentar novamente
        </button>
      </div>
    );
  }
}
