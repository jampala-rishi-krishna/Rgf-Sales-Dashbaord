import { Component, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";

/**
 * Keeps one malformed call from taking down the whole app: a render error in the detail
 * pane shows a local message instead of the root "This page didn't load" screen.
 */
export class CallDetailBoundary extends Component<
  { callId: string; onBack?: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[calls] could not render call ${this.props.callId}:`, error);
  }

  componentDidUpdate(prev: { callId: string }) {
    if (prev.callId !== this.props.callId && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[var(--ch-text-2)]">
        <AlertTriangle className="size-7 text-orange-400" aria-hidden />
        <div className="text-sm font-semibold text-[var(--ch-text)]">
          Couldn&apos;t display this call
        </div>
        <div className="max-w-sm text-xs">
          Vapi returned data in an unexpected format. Call ID{" "}
          <span className="font-mono">{this.props.callId}</span>
        </div>
        {this.props.onBack && (
          <button
            type="button"
            onClick={this.props.onBack}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-[var(--ch-text)] hover:bg-white/15"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Back to calls
          </button>
        )}
      </div>
    );
  }
}
