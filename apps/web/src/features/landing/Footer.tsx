import { Link } from "react-router-dom";
import { setHidden, useMascot } from "@/shared/mascot/mascotStore";

export function Footer() {
  const hidden = useMascot((s) => s.hidden);
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6 text-muted">
      <span className="mono-label">AgentShield · Avalanche Fuji testnet</span>
      <div className="flex gap-6">
        <Link to="/demo" className="hover:text-fg">Demo</Link>
        <Link to="/proof" className="hover:text-fg">Proof</Link>
        <button type="button" onClick={() => setHidden(!hidden)} className="hover:text-fg">
          {hidden ? "Show Aura-kun" : "Hide Aura-kun"}
        </button>
      </div>
    </footer>
  );
}
