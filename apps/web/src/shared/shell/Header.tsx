import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileCheck2, Info, Menu, Play, Plus, type LucideIcon } from "lucide-react";
import { toggleShades, touch } from "@/shared/mascot/mascotStore";
import { cn } from "@/shared/lib/cn";
import { useSession } from "@/shared/session/sessionStore";
import { DropdownMenu, menuItemClass } from "@/shared/ui/DropdownMenu";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "@/shared/theme/ThemeToggle";

/** `mobileOnly` rows duplicate a link the bar already shows from the `sm` breakpoint up. */
const NAV: { to: string; label: string; icon: LucideIcon; mobileOnly?: boolean }[] = [
  { to: "/demo", label: "Demo", icon: Play, mobileOnly: true },
  { to: "/vaults/new", label: "Create vault", icon: Plus },
  { to: "/proof", label: "Proof", icon: FileCheck2 },
  { to: "/about", label: "About", icon: Info },
];

export function Header() {
  const { pathname } = useLocation();
  const taps = useRef<number[]>([]);
  const wallet = useSession((s) => s.wallet);
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
      {/* Left = where to go, right = settings then identity (wallet outermost). On phones the menu button moves to the far right. */}
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link to="/" onClick={onLogo} aria-label="AgentShield home" className="order-1 inline-flex shrink-0 items-center gap-2.5 font-mono text-sm font-bold uppercase tracking-widest sm:mr-3">
          <img src="/favicon.svg" alt="" aria-hidden="true" width={28} height={28} className="h-7 w-7 shrink-0" />
          <span className="hidden min-[430px]:inline">AgentShield</span>
        </Link>

        <div className="order-3 flex items-center gap-1 sm:order-2">
          <Link to="/demo" aria-current={pathname === "/demo" ? "page" : undefined} className={cn("hidden h-10 items-center px-3 font-bold hover:text-fg sm:inline-flex", pathname === "/demo" ? "text-accent-text" : "text-soft")}>Demo</Link>
          <DropdownMenu
            label="Menu"
            panelClassName="sm:left-0 sm:right-auto"
            triggerClassName="inline-flex h-10 min-w-10 items-center justify-center gap-2 border border-line-strong px-2.5 font-bold text-fg hover:bg-hover sm:px-3"
            trigger={
              <>
                <Menu aria-hidden className="size-5" />
                <span className="hidden sm:inline">Menu</span>
              </>
            }
          >
            {(close) => (
              <>
                {NAV.map(({ to, label, icon: Icon, mobileOnly }, i) => (
                  <Link
                    key={to}
                    to={to}
                    role="menuitem"
                    aria-current={pathname === to ? "page" : undefined}
                    onClick={() => close(false)}
                    className={cn(menuItemClass, i > 0 && "border-t border-line", mobileOnly && "sm:hidden", pathname === to && "text-accent-text")}
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-accent-text" />
                    {label}
                  </Link>
                ))}
              </>
            )}
          </DropdownMenu>
        </div>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:gap-3">
          <ThemeToggle />
          {wallet ? <AccountMenu wallet={wallet} /> : <Link to="/signin" className="inline-flex h-10 items-center px-2 font-bold text-fg hover:text-accent-text">Sign in</Link>}
        </div>
      </nav>
    </div>
  );
}
