import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AuraLayer } from "@/shared/mascot/AuraLayer";
import { MascotController } from "@/shared/mascot/MascotController";
import { AccessGate } from "@/features/auth/AccessGate";
import { LandingPage } from "@/features/landing/LandingPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <span className="mono-label">404</span>
      <h1 className="mt-2 text-4xl">Page not found</h1>
      <Link to="/" className="mt-6 inline-block text-accent-text underline">
        Back to home
      </Link>
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<AccessGate mode="signin" />} />
          <Route path="/signup" element={<AccessGate mode="signup" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <MascotController />
        <AuraLayer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
