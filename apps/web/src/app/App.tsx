import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuraLayer } from "@/shared/mascot/AuraLayer";
import { MascotController } from "@/shared/mascot/MascotController";
import { ClickPulse } from "@/shared/fx/ClickPulse";
import { EmergencyDrill } from "@/shared/fx/EmergencyDrill";
import { GridSpotlight } from "@/shared/fx/GridSpotlight";
import { PageEnter, RouteTransition } from "@/shared/fx/RouteTransition";
import { AccessGate } from "@/features/auth/AccessGate";
import { LandingPage } from "@/features/landing/LandingPage";
import { AboutPage } from "@/features/about/AboutPage";
import { ProofPage } from "@/features/proof/ProofPage";
import { NotFoundPage } from "@/features/not-found/NotFoundPage";
import { DemoPage } from "@/features/vault/demo/DemoPage";
import { VaultRoutes } from "@/features/vault/routes";
import { DevSessionBar } from "@/shared/session/DevSessionBar";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PageEnter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signin" element={<AccessGate />} />
            <Route path="/signup" element={<Navigate to="/signin" replace />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/proof" element={<ProofPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/vaults/*" element={<VaultRoutes />} />
            <Route path="/vault" element={<Navigate to="/vaults" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </PageEnter>
        <MascotController />
        <AuraLayer />
        <RouteTransition />
        <GridSpotlight />
        <EmergencyDrill />
        <ClickPulse />
        {import.meta.env.DEV && <DevSessionBar />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
