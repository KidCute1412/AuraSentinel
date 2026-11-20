import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "@/shared/lib/cn";

/** How far below the top of the screen a column sticks: under the 56px header (/demo) or header + app bar (/vaults/*). */
const OFFSET = { header: { px: 80, cls: "lg:top-20" }, app: { px: 128, cls: "lg:top-32" } } as const;

/**
 * A desktop grid column that follows the reader while it fits on the screen, so a short column stays beside a long
 * one instead of leaving an empty strip. A column taller than the screen scrolls with the page: a sticky column taller
 * than the screen would hide its own bottom. Below `lg` the columns stack and nothing sticks.
 */
export function StickyColumn({
  children,
  className,
  offset = "header",
  as: Tag = "div",
  label,
  ref: outer,
}: {
  children: ReactNode;
  className?: string;
  offset?: keyof typeof OFFSET;
  as?: "div" | "aside" | "section";
  label?: string;
  ref?: Ref<HTMLElement>;
}) {
  const own = useRef<HTMLElement | null>(null);
  const [fits, setFits] = useState(false);
  const { px, cls } = OFFSET[offset];

  const setRef = useCallback(
    (el: HTMLElement | null) => {
      own.current = el;
      if (typeof outer === "function") outer(el);
      else if (outer) (outer as { current: HTMLElement | null }).current = el;
    },
    [outer],
  );

  useLayoutEffect(() => {
    const el = own.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // 16px of air under the column, so its last border never touches the bottom edge.
    const check = () => setFits(el.offsetHeight + px + 16 <= window.innerHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [px]);

  return (
    <Tag ref={setRef} aria-label={label} className={cn("min-w-0 lg:self-start", fits && cn("lg:sticky", cls), className)}>
      {children}
    </Tag>
  );
}
