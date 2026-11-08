import { QueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuraLayer } from "@/shared/mascot/AuraLayer";
import { MascotController } from "@/shared/mascot/MascotController";
import { ClickPulse } from "@/shared/fx/ClickPulse";
import { EmergencyDrill } from "@/shared/fx/EmergencyDrill";
import { GridSpotlight } from "@/shared/fx/GridSpotlight";
import { PageEnter, RouteTransition } from "@/shared/fx/RouteTransition";
import { Web3Provider } from "@/shared/web3/Web3Provider";
import { AccessGate } from "@/features/auth/AccessGate";
import { LandingPage } from "@/features/landing/LandingPage";
import { AboutPage } from "@/features/about/AboutPage";
import { ProofPage } from "@/features/proof/ProofPage";
import { NotFoundPage } from "@/features/not-found/NotFoundPage";
import { DemoPage } from "./routes/DemoPage";
import { NewVaultPage } from "./routes/NewVaultPage";
import { VaultPage } from "./routes/VaultPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

/** Routes follow D16: / · /demo · /vaults/new · /vaults/:safe · /proof (admin is a drawer, not a route). */
export function App() {
  return (
    <Web3Provider queryClient={queryClient}>
      <BrowserRouter>
        <PageEnter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/vaults/new" element={<NewVaultPage />} />
            <Route path="/vaults/:safe" element={<VaultPage />} />
            <Route path="/proof" element={<ProofPage />} />
            <Route path="/signin" element={<AccessGate />} />
            <Route path="/signup" element={<Navigate to="/signin" replace />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </PageEnter>
        <MascotController />
        <AuraLayer />
        <RouteTransition />
        <GridSpotlight />
        <EmergencyDrill />
        <ClickPulse />
      </BrowserRouter>
    </Web3Provider>
  );
}
