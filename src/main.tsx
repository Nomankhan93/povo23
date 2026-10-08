import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { AppErrorBoundary } from "./components/system/AppErrorBoundary";
import { installGlobalDiagnostics, reportDiagnostic } from "./lib/observability";
import "./style.css";
import "./styles/design-system.css";

installGlobalDiagnostics();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

// Built static assets only; authenticated API responses never enter Cache Storage.
if(import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>{
    void navigator.serviceWorker.register('/field-sw.js').then(reg=>{
      reg.addEventListener('updatefound',()=>{
        window.dispatchEvent(new Event('poem:field-update'));
        const worker=reg.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='redundant')reportDiagnostic('service_worker',new Error('Service worker installation became redundant'),{operation:'install',phase:'redundant',online:navigator.onLine});
        });
      });
    }).catch(error=>{
      reportDiagnostic('service_worker',error,{operation:'register',online:navigator.onLine});
      window.dispatchEvent(new Event('poem:field-cache-failed'));
    });
  });
}
