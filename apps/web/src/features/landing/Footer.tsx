import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6 text-muted">
      <span className="mono-label">AgentShield · Avalanche Fuji testnet</span>
      <div className="flex gap-6">
        <Link to="/demo" className="hover:text-fg">Demo</Link>
        <Link to="/proof" className="hover:text-fg">Proof</Link>
      </div>
    </footer>
  );
}
