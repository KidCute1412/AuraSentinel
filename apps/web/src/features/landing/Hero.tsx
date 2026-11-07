import { Link } from "react-router-dom";
import { primaryCta, secondaryCta } from "./cta";
import { LiveFeed } from "./LiveFeed";
import { AttackLane } from "./AttackLane";

const COLS = ["A", "B", "C", "D", "E", "F"];

export function Hero() {
  return (
    <header className="blueprint overflow-hidden border-b border-line">
      {/* Laser calibration line sweeping across the blueprint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-accent/70 shadow-[0_0_12px_var(--accent)] animate-blueprint-scan z-10"
      />

      {/* Blueprint coordinates */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-2 mx-auto hidden max-w-6xl justify-between px-6 font-mono text-[10px] uppercase tracking-widest text-muted lg:flex"
      >
        {COLS.map((c, i) => (
          <span
            key={c}
            className="animate-hero-drop"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        <div className="min-w-0">
          {/* Security status tags with stamp */}
          <div
            className="flex flex-wrap items-center gap-3 animate-hero-drop"
            style={{ animationDelay: "100ms" }}
          >
            <span className="mono-label">Kill-switch armed · Avalanche Fuji</span>
            <span
              className="inline-block -rotate-3 bg-highlight px-2 py-1 font-mono text-xs font-bold uppercase tracking-widest text-on-accent animate-stamp"
              style={{ animationDelay: "220ms" }}
            >
              funds lost: 0
            </span>
          </div>

          {/* Kinetic poster typography */}
          <h1 className="mt-5 text-[clamp(2.25rem,6.2vw,5rem)] font-black italic uppercase leading-[0.92] tracking-[-0.05em]">
            <span className="block overflow-hidden">
              <span
                className="block animate-hero-slide-in"
                style={{ animationDelay: "150ms" }}
              >
                Let AI trade 24/7.
              </span>
            </span>
            <span className="relative mt-1 block overflow-hidden">
              <span
                className="outline-text block animate-hero-slide-in"
                style={{ animationDelay: "260ms" }}
              >
                It still can't rug you.
              </span>
              {/* Laser wipe beam traveling across the outline text */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-full w-1/3 bg-gradient-to-r from-transparent via-accent/30 to-transparent animate-laser-sweep"
                style={{ animationDelay: "450ms" }}
              />
            </span>
          </h1>

          {/* Descriptive text */}
          <p
            className="mt-7 max-w-xl text-lg text-soft animate-hero-lift"
            style={{ animationDelay: "340ms" }}
          >
            Your funds stay in a Safe vault. The agent holds only a limited
            session key, and an on-chain policy decides what it may do. You
            keep the Kill-Switch.
          </p>

          {/* Action CTAs */}
          <div
            className="mt-10 flex flex-wrap gap-4 animate-hero-lift"
            style={{ animationDelay: "420ms" }}
          >
            <span className="drop-hard" data-ground="cta-demo">
              <Link to="/demo" className={primaryCta}>
                Try the demo
              </Link>
            </span>
            <span className="drop-hard" data-ground="cta-vault">
              <Link to="/vaults/new" className={secondaryCta}>
                Create your vault
              </Link>
            </span>
          </div>
        </div>

        {/* Live feed terminal */}
        <div
          className="relative min-w-0 pt-24 animate-hero-slide-right-in"
          style={{ animationDelay: "220ms" }}
        >
          <LiveFeed />
        </div>
      </div>

      {/* Attack lane */}
      <div
        className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 animate-hero-lift"
        style={{ animationDelay: "480ms" }}
      >
        <AttackLane />
      </div>
    </header>
  );
}
