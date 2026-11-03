import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { Lab } from "@/lab/Lab";
import { CustomersPage } from "@/pages/Customers";
import { JobsPage } from "@/pages/Jobs";
import { EstimatesPage, InvoicesPage, MaterialsPage } from "@/pages/Records";
import { SectionsPage } from "@/pages/Sections";
import { BoardPage, SchedulePage, TimePage } from "@/pages/Wide";
import { StatesPage } from "@/pages/States";
import "./index.css";

/** `?theme=` and `?palette=` so the lab can show every combination without a store. */
function Theme() {
  const [params] = useSearchParams();
  const dark = params.get("theme") === "dark";
  const palette = params.get("palette") ?? "neutral";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.palette = palette;
  }, [dark, palette]);
  return null;
}

/** Two routes per section rather than an optional param — one less thing to get wrong. */
function sectionRoutes(path: string, element: React.ReactElement) {
  return [
    <Route key={path} path={path} element={element} />,
    <Route key={`${path}/:id`} path={`${path}/:id`} element={element} />,
  ];
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Theme />
      <Routes>
        <Route path="/" element={<Navigate to="/lab" replace />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="/app/board" replace />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="time" element={<TimePage />} />
          <Route path="_states" element={<StatesPage />} />
          {sectionRoutes("jobs", <JobsPage />)}
          {sectionRoutes("customers", <CustomersPage />)}
          {sectionRoutes("estimates", <EstimatesPage />)}
          {sectionRoutes("invoices", <InvoicesPage />)}
          {sectionRoutes("materials", <MaterialsPage />)}
          {sectionRoutes("reports", <SectionsPage kind="reports" />)}
          {sectionRoutes("settings", <SectionsPage kind="settings" />)}
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
