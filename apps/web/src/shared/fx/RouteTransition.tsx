import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { prefersReducedMotion } from "@/shared/lib/useReducedMotion";

/**
 * Gentle route change: scroll to top and draw a thin green line across the top edge.
 * Pair with <PageEnter> so the new page fades in. Nothing blocks or delays navigation.
 */
export function RouteTransition() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    if (!prefersReducedMotion()) setLine((n) => n + 1);
  }, [pathname]);

  if (!line) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <div key={line} className="animate-route-line h-full w-full bg-accent" />
    </div>
  );
}

/** Fades and lifts the page in (240ms) whenever the path changes. Remounts the subtree, which routing does anyway. */
export function PageEnter({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div key={pathname} className="animate-page-in">{children}</div>;
}
