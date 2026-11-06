import { Link } from "react-router-dom";
import { MascotHero } from "@/shared/mascot/Mascot";
import { primaryCta, secondaryCta } from "./cta";
import { LiveFeed } from "./LiveFeed";

const COLS = ["A", "B", "C", "D", "E", "F"];

export function Hero() {
  return (
    <header className="blueprint overflow-hidden border-b border-line">
      {/* Blueprint coordinates */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 mx-auto hidden max-w-6xl justify-between px-6 font-mono text-[10px] uppercase tracking-widest text-muted lg:flex">
        {COLS.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-label">Kill-switch armed · Avalanche Fuji</span>
            <span className="inline-block -rotate-3 bg-highlight px-2 py-1 font-mono text-xs font-bold uppercase tracking-widest text-on-accent">funds lost: 0</span>
          </div>
          <h1 className="mt-5 text-[clamp(2.25rem,6.2vw,5rem)] font-black italic uppercase leading-[0.92] tracking-[-0.05em]">
            Let AI trade 24/7.
            <span className="outline-text mt-1 block">It still can't rug you.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg text-soft">
            Your funds stay in a Safe vault. The agent holds only a limited
            session key, and an on-chain policy decides what it may do. You
            keep the Kill-Switch.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <span className="drop-hard"><Link to="/demo" className={primaryCta}>Try the demo</Link></span>
            <span className="drop-hard"><Link to="/vaults/new" className={secondaryCta}>Create your vault</Link></span>
          </div>
        </div>
        <div className="relative min-w-0 pt-32">
          <MascotHero />
          <LiveFeed />
        </div>
      </div>
    </header>
  );
}
