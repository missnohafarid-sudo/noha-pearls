import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../../i18n';

interface State {
  failed: boolean;
}

/** Keeps one broken page from blanking the whole site. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page-state stack" role="alert">
        <p className="notice notice--bad">{t.common.crashed}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {t.common.reload}
        </button>
      </div>
    );
  }
}
