import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { LandingPage } from "@/features/landing/LandingPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <span className="mono-label">404</span>
      <h1 className="mt-2 text-4xl">Page not found</h1>
      <Link to="/" className="mt-6 inline-block text-accent underline">
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
