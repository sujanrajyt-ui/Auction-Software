import React from 'react';
import { AlertTriangle, RefreshCw, Home, Trash2 } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'An unexpected rendering error occurred';
      const stack = this.state.error?.stack || this.state.errorInfo?.componentStack || '';

      return (
        <div className="min-h-screen w-full bg-[#07090E] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none">
          {/* Ambient Glow */}
          <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_35%,rgba(239,68,68,0.15)_0%,transparent_60%)]" />

          <div className="relative z-10 w-full max-w-xl rounded-3xl bg-slate-900/95 border border-rose-500/40 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 text-center">
            {/* Header Icon & Brand */}
            <div className="flex flex-col items-center gap-3">
              <div className="h-16 w-16 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/50">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <div className="inline-block px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-extrabold uppercase tracking-widest">
                  APPLICATION RECOVERY DESK
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-2">
                  Something Went Wrong
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  VISTA Live Auction recovered from an unexpected error so your screen is never left blank.
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 text-left">
              <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold mb-1">
                ERROR DETAILS
              </div>
              <div className="font-mono text-xs sm:text-sm text-slate-200 break-words font-semibold">
                {errorMsg}
              </div>
              {stack && (
                <details className="mt-3">
                  <summary className="text-[11px] font-bold text-slate-500 hover:text-slate-300 cursor-pointer">
                    Show component stack trace
                  </summary>
                  <pre className="mt-2 text-[10px] font-mono text-slate-400 max-h-40 overflow-auto p-2 rounded bg-slate-900/80 border border-slate-800 whitespace-pre-wrap">
                    {stack}
                  </pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-500/20 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Screen
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer border border-slate-700 transition-all"
              >
                <Home className="w-4 h-4" />
                Return to Portal
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold text-xs uppercase tracking-wider cursor-pointer border border-rose-500/30 transition-all"
                title="Clears corrupted session tokens or local cache and reloads"
              >
                <Trash2 className="w-4 h-4" />
                Reset Session
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
