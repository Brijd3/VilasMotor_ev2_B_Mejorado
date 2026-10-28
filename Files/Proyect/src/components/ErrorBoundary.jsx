import React from 'react';

/** Evita que un error de renderizado deje toda la aplicación en blanco. */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error de interfaz:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="glass-panel error-panel" role="alert">
        <h2>Algo salió mal en esta sección</h2>
        <p>La página no pudo mostrarse. Sus datos no se han perdido; puede reintentar o recargar.</p>
        <div className="error-panel-actions">
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Recargar página</button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
