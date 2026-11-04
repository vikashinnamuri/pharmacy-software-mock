import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"], weight: "variable" });

export const metadata: Metadata = {
  title: "Marina Care Pharmacy, PMR and MDS demo",
  description: "Frontend-only demonstration of a pharmacy PMR and weekly MDS tray workflow. Not for clinical use.",
};
export const viewport: Viewport = { themeColor: "#12264A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${atkinson.variable} h-full antialiased`}>
      <body className="h-full">
        <TooltipProvider>
          <Suspense fallback={<div className="min-h-screen bg-sidebar" />}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
