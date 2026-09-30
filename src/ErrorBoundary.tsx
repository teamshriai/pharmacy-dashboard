import { Component, type ReactNode } from 'react';

/**
 * Last line of defence: if a screen throws while rendering, show a way back
 * instead of a blank page. Sample data lives in memory, so reloading resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('SHRI HEALTH Pharmacy: unexpected error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="ph-crash" role="alert">
        <div className="card ph-card">
          <h1 className="ph-crash-title">Something went wrong</h1>
          <p className="ph-muted">The console hit an unexpected problem. Reloading starts it again with fresh sample data.</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <button className="btn btn-secondary" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Go to dashboard</button>
          </div>
        </div>
      </main>
    );
  }
}
