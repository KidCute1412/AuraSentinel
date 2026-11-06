import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Header } from "@/features/landing/Header";
import { Footer } from "@/features/landing/Footer";
import { primaryCta, secondaryCta } from "@/features/landing/cta";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";

export function NotFoundPage() {
  const { pathname } = useLocation();

  useEffect(() => {
    react("whoa", { text: LINES.notFound, hold: 2200, passive: true });
  }, []);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <main className="blueprint relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:pt-32">
          <Chamfer edge="bg-danger" ground="not-found-card" code="ERR-404" className="mx-auto max-w-3xl" innerClassName="p-6 pb-10 sm:p-10 sm:pb-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="mono-label">STATUS: ROUTE NOT FOUND</span>
              <Stamp tone="danger" animate>Route blocked</Stamp>
            </div>

            <h1 aria-label="404" className="relative mt-6 select-none font-mono text-[7rem] font-black leading-none tracking-[-0.06em] sm:text-[11rem]">
              <span aria-hidden className="animate-glitch-alt absolute left-1.5 top-1.5 block text-transparent [-webkit-text-stroke:2px_var(--shadow-color)]">404</span>
              <span aria-hidden className="animate-glitch relative block text-danger-text">404</span>
            </h1>

            <p className="mt-6 text-xl font-bold">This door leads nowhere.</p>
            <p className="mt-2 text-soft">
              The auditor looked for <code className="break-all bg-hover px-1.5 py-0.5 font-mono text-sm text-fg">{pathname}</code>
              {" "}and found nothing to approve. No funds moved.
              <span aria-hidden className="animate-caret ml-1 inline-block h-4 w-2 translate-y-0.5 bg-accent" />
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <span className="drop-hard">
                <Link to="/" className={primaryCta}>Back to home</Link>
              </span>
              <span className="drop-hard">
                <Link to="/proof" className={secondaryCta}>See the proof</Link>
              </span>
            </div>
          </Chamfer>
        </div>
      </main>
      <Footer />
    </div>
  );
}
