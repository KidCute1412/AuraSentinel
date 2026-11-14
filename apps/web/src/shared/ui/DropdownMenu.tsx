import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** Row inside a DropdownMenu. Give it `role="menuitem"` and call `close` when it is chosen. */
export const menuItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-none px-4 text-left font-bold text-fg hover:bg-hover focus-visible:bg-hover";

interface Props {
  /** Accessible name of the trigger button. */
  label: string;
  /** Visible content of the trigger (icon, text). */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Extra panel classes; the panel is always anchored to the trigger's right edge. */
  panelClassName?: string;
  /** `close(false)` closes without pulling focus back to the trigger (use it when navigating away). */
  children: (close: (refocus?: boolean) => void) => ReactNode;
}

/**
 * Small action menu: closes on outside click, Escape and Tab; arrow keys, Home and End move between items.
 * Square, hard-shadowed panel from the design system (Dialog/Toast row).
 */
export function DropdownMenu({ label, trigger, triggerClassName, panelClassName, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      const list = items();
      if (list.length === 0) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      const go = (n: number) => {
        e.preventDefault();
        list[(n + list.length) % list.length]?.focus();
      };
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(list.length - 1);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          className={cn("absolute right-0 top-full z-50 mt-2 min-w-52 max-w-[calc(100vw-2rem)] border border-line-strong bg-surface shadow-hard animate-feed-in", panelClassName)}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
