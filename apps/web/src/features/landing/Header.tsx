import { useRef } from "react";
import { Link } from "react-router-dom";
import { toggleShades, touch } from "@/shared/mascot/mascotStore";
import { ThemeToggle } from "@/shared/theme/ThemeToggle";

export function Header() {
  const taps = useRef<number[]>([]);
  // Easter egg: tap the logo 5x within 3s and Aura-kun puts on shades.
  const onLogo = () => {
    touch();
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      toggleShades();
    }
  };
  return (
    <div className="sticky top-0 z-40 border-b border-line bg-bg animate-hero-drop">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" onClick={onLogo} aria-label="AgentShield home" className="font-mono text-sm font-bold uppercase tracking-widest">
          <span className="text-accent-text">[</span> AgentShield <span className="text-accent-text">]</span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-6">
          <Link to="/demo" className="text-soft hover:text-fg">Demo</Link>
          <Link to="/vaults/new" className="hidden text-soft hover:text-fg md:inline">Create vault</Link>
          <Link to="/proof" className="hidden text-soft hover:text-fg md:inline">Proof</Link>
          <Link to="/about" className="hidden text-soft hover:text-fg md:inline">About</Link>
          <Link to="/signin" className="font-bold text-fg hover:text-accent-text">Sign in</Link>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
