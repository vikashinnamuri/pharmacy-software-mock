import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

// Each page is its own chunk, so heavy libraries (Recharts, jsPDF) load only on the screens that use them.
const Dashboard = lazy(() => import("@/pages/dashboard"));
const PatientsPage = lazy(() => import("@/pages/patients"));
const PatientProfile = lazy(() => import("@/pages/patient-profile"));
const PrescriptionsPage = lazy(() => import("@/pages/prescriptions"));
const TraysPage = lazy(() => import("@/pages/trays"));
const PreparationPage = lazy(() => import("@/pages/preparation"));
const VerificationPage = lazy(() => import("@/pages/verification"));
const CataloguePage = lazy(() => import("@/pages/catalogue"));
const InventoryPage = lazy(() => import("@/pages/inventory"));
const DocumentsPage = lazy(() => import("@/pages/documents"));
const BillingPage = lazy(() => import("@/pages/billing"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const DispensingPage = lazy(() => import("@/pages/dispensing"));
const CollectionPage = lazy(() => import("@/pages/collection"));
const DisplayPage = lazy(() => import("@/pages/display"));
const MdsPage = lazy(() => import("@/pages/mds"));

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientProfile />} />
        <Route path="prescriptions" element={<PrescriptionsPage />} />
        <Route path="dispensing" element={<DispensingPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="display" element={<DisplayPage />} />
        <Route path="mds" element={<MdsPage />} />
        <Route path="trays" element={<TraysPage />} />
        <Route path="preparation" element={<PreparationPage />} />
        <Route path="verification" element={<VerificationPage />} />
        <Route path="catalogue" element={<CataloguePage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
