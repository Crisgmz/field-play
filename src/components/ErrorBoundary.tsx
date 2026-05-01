import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * Error boundary global. Atrapa errores de cualquier componente del árbol
 * y muestra una UI de fallback en vez de quedarse blanco. Imprime el error
 * a consola para que se pueda diagnosticar.
 *
 * Solo atrapa errores en render / lifecycle. Errores en handlers async
 * (fetch que falla, etc.) NO los atrapa — esos se ven en consola pero no
 * desmontarían el árbol de React, así que no son blancos.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('ErrorBoundary atrapó un error de render:', error);
    if (info.componentStack) {
      console.error('Component stack:\n', info.componentStack);
    }
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
    window.location.reload();
  };

  handleSoftReset = () => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // ignore
    }
    window.location.href = '/login';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message ?? 'Error desconocido';
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg rounded-3xl border border-destructive/30 bg-card p-8 shadow-sm">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Algo salió mal
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La aplicación encontró un error y no pudo continuar. Esto suele
            arreglarse recargando la página.
          </p>
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Detalle técnico</p>
            <p className="mt-1 break-words font-mono text-xs text-foreground">{message}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Recargar página
            </button>
            <button
              type="button"
              onClick={this.handleSoftReset}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Cerrar sesión y volver al login
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Si el problema persiste, abre las herramientas de desarrollador
            (F12) → pestaña <strong>Console</strong> → comparte el error
            con el equipo técnico.
          </p>
        </div>
      </div>
    );
  }
}
