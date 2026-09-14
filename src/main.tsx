import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Built static assets only; authenticated API responses never enter Cache Storage.
if(import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>{
    void navigator.serviceWorker.register('/field-sw.js').then(reg=>{
      reg.addEventListener('updatefound',()=>window.dispatchEvent(new Event('poem:field-update')));
    }).catch(()=>window.dispatchEvent(new Event('poem:field-cache-failed')));
  });
}
