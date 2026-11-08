import { AppShell } from "@/app/layout/AppShell";
import { VaultDashboardPlaceholder } from "./VaultDashboardPlaceholder";

/** /demo: the public sandbox vault. Guests need no wallet and no sign-in (D12). */
export function DemoPage() {
  return (
    <AppShell label="App / Vault demo">
      <VaultDashboardPlaceholder mode="demo" safe={null} />
    </AppShell>
  );
}
