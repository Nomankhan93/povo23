import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { reportDiagnostic } from "../../lib/observability";

type Props = { children: ReactNode };
type State = { crashed: boolean; diagnosticId: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, diagnosticId: "" };

  static getDerivedStateFromError(): State {
    return { crashed: true, diagnosticId: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const record = reportDiagnostic("app", error, { operation: "react_render", component: info.componentStack ? "react_tree" : "unknown", online: navigator.onLine });
    if (record?.id && record.id !== this.state.diagnosticId) this.setState({ diagnosticId: record.id });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return <main className="setup" role="alert" aria-live="assertive">
      <AlertTriangle size={42}/>
      <h1>FieldLance could not finish loading this screen</h1>
      <p>Your saved server data is unchanged. Reload the app to retry. If the problem continues, share the diagnostic code with support.</p>
      {this.state.diagnosticId && <p>Diagnostic code: <code>{this.state.diagnosticId}</code></p>}
      <div className="actions">
        <button type="button" onClick={() => location.reload()}>Reload FieldLance</button>
        <button type="button" className="secondary" onClick={() => { location.assign("/"); }}>Return home</button>
      </div>
    </main>;
  }
}
