import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource-variable/atkinson-hyperlegible-next";
import { AppShell } from "@/components/shell/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRoutes } from "./routes";
import { useAppStore } from "./store/app-store";
import "./index.css";

// Keep a second tab (for example the public collection display) in step with this one.
window.addEventListener("storage", (e) => {
  if (e.key === useAppStore.persist.getOptions().name) void useAppStore.persist.rehydrate();
});

// Development only: lets automated end-to-end checks drive the store. Never included in a production build.
if (import.meta.env.DEV) (window as unknown as { __demoStore: typeof useAppStore }).__demoStore = useAppStore;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </TooltipProvider>
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
  </StrictMode>,
);
