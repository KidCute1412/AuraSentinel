import { Link } from "react-router-dom";
import { ThemeToggle } from "@/shared/theme/ThemeToggle";

export function Header() {
  return (
    <div className="sticky top-0 z-40 border-b border-line bg-bg">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <span className="font-mono text-sm font-bold uppercase tracking-widest">
          <span className="text-accent-text">[</span> AgentShield <span className="text-accent-text">]</span>
        </span>
        <div className="flex items-center gap-4 sm:gap-6">
          <Link to="/demo" className="text-soft hover:text-fg">Demo</Link>
          <Link to="/vaults/new" className="hidden text-soft hover:text-fg md:inline">Create vault</Link>
          <Link to="/proof" className="hidden text-soft hover:text-fg md:inline">Proof</Link>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
