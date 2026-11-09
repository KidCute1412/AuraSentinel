import { AppShell } from "@/app/layout/AppShell";
import { GuidedTour, TourButton } from "@/app/tour/GuidedTour";
import { DEMO_TOUR_SEEN_KEY, DEMO_TOUR_STEPS } from "@/app/tour/tourSteps";
import { useTour } from "@/app/tour/useTour";
import { VaultDashboardPlaceholder } from "./VaultDashboardPlaceholder";

/** /demo: the public sandbox vault. Guests need no wallet and no sign-in (D12). The guided tour opens on the first visit. */
export function DemoPage() {
  const tour = useTour(DEMO_TOUR_STEPS, { storageKey: DEMO_TOUR_SEEN_KEY });
  return (
    <AppShell label="App / Vault demo" actions={<TourButton onClick={tour.start} />}>
      <VaultDashboardPlaceholder mode="demo" safe={null} />
      <GuidedTour tour={tour} />
    </AppShell>
  );
}
