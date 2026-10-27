import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

const AdminApp = lazy(() => import("./admin/AdminApp.jsx").then((module) => ({ default: module.AdminApp })));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/owner") ? <Suspense fallback={<main className="owner-loading" dir="rtl">جارٍ تحميل لوحة المالك…</main>}><AdminApp /></Suspense> : <App />}
  </React.StrictMode>,
);
