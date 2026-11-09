import { Navigate, Route, Routes } from "react-router-dom";
import { VaultListPage } from "./list/VaultListPage";
import { VaultLayout } from "./layout/VaultLayout";
import { ActivityPage, FundsPage, JobDetailPage, OverviewPage, PolicyPage, RedTeamPage, SettingsPage } from "./pages/sections";
import { WizardPage } from "./wizard/WizardPage";

/**
 * Mounted at /vaults/* in App. Static segments (`new`) outrank `:safe`, so /vaults/new never reads as an address.
 * Route map: docs/product/ui-pages.md §1.
 */
export function VaultRoutes() {
  return (
    <Routes>
      <Route index element={<VaultListPage />} />
      <Route path="new" element={<WizardPage />} />
      <Route path="new/:step" element={<WizardPage />} />
      <Route path=":safe" element={<VaultLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="activity/:jobId" element={<JobDetailPage />} />
        <Route path="policy" element={<PolicyPage />} />
        <Route path="funds" element={<FundsPage />} />
        <Route path="red-team" element={<RedTeamPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to=".." replace />} />
      </Route>
    </Routes>
  );
}
