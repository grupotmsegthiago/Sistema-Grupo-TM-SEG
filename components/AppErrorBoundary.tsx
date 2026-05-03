import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Erro capturado:', error);
    console.error('[AppErrorBoundary] Stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
    try {
      const overlay = document.getElementById('ios-error-overlay');
      if (overlay) {
        overlay.style.display = 'block';
        overlay.innerHTML = `
          <div style="max-width:720px;margin:0 auto;">
            <h2 style="font-size:18px;font-weight:700;margin-bottom:12px;color:#fca5a5;">Erro na tela</h2>
            <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.4;background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;">${(error?.message || String(error)).replace(/</g, '&lt;')}\n\n${(errorInfo?.componentStack || '').replace(/</g, '&lt;')}</pre>
            <button id="ios-error-close" style="margin-top:16px;background:#dc2626;color:#fff;padding:10px 18px;border:none;border-radius:8px;font-weight:700;">Fechar</button>
          </div>
        `;
        const closeBtn = document.getElementById('ios-error-close');
        if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; };
      }
    } catch {}
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) this.props.onReset();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6" data-testid="error-boundary-fallback">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="text-red-600" size={24} />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Algo deu errado nesta tela</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              A tela falhou ao carregar, mas o sistema continua funcionando. Você pode voltar pra tela inicial ou recarregar o app.
            </p>
            {this.state.error && (
              <details className="text-xs text-gray-500 bg-gray-50 rounded p-3 mb-4 overflow-auto max-h-40">
                <summary className="cursor-pointer font-semibold mb-2">Detalhes técnicos</summary>
                <div className="font-mono break-all">{this.state.error.message}</div>
                {this.state.errorInfo && (
                  <pre className="mt-2 whitespace-pre-wrap text-[10px]">{this.state.errorInfo.componentStack}</pre>
                )}
              </details>
            )}
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white font-semibold py-2.5 px-4 rounded-lg"
                data-testid="button-error-back-home"
              >
                <Home size={16} /> Voltar ao início
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg"
                data-testid="button-error-reload"
              >
                <RefreshCw size={16} /> Recarregar app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
