import { Link } from "react-router-dom";
import { primaryCta, secondaryCta } from "./cta";
import { LiveFeed } from "./LiveFeed";

export function Hero() {
  return (
    <header className="hero-grid border-b border-line">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-mono text-sm font-bold uppercase tracking-widest">
          <span className="text-accent">[</span> AgentShield <span className="text-accent">]</span>
        </span>
        <div className="flex items-center gap-6 text-base">
          <Link to="/demo" className="text-soft hover:text-fg">Demo</Link>
          <Link to="/vaults/new" className="text-soft hover:text-fg">Create vault</Link>
          <Link to="/proof" className="text-soft hover:text-fg">Proof</Link>
        </div>
      </nav>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="mono-label">Kill-switch armed · Avalanche Fuji</span>
          <span className="ml-3 inline-block -rotate-3 bg-highlight px-2 py-1 font-mono text-xs font-bold uppercase tracking-widest text-bg">funds lost: 0</span>
          <h1 className="mt-4 text-5xl leading-[1.05] md:text-6xl">
            Let AI trade 24/7.{" "}
            <span className="text-accent">It still can't rug you.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-soft">
            Your funds stay in a Safe vault. The agent holds only a limited
            session key, and an on-chain policy decides what it may do. You
            keep the Kill-Switch.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <span className="drop-hard"><Link to="/demo" className={primaryCta}>Try the demo</Link></span>
            <span className="drop-hard"><Link to="/vaults/new" className={secondaryCta}>Create your vault</Link></span>
          </div>
        </div>
        <LiveFeed />
      </div>
    </header>
  );
}
