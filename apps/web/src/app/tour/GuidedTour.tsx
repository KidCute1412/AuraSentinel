import { ArrowLeft, ArrowRight, Check, Route, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/cn";
import { prefersReducedMotion } from "@/shared/lib/useReducedMotion";
import { holeRects, padRect, placeCard, unionRect, type Placement, type Rect, type Size } from "./tourLogic";
import type { TourControls } from "./useTour";

/** Sticky header (56px) + app bar (56px) + breathing room: where a highlighted anchor scrolls to. */
const SCROLL_OFFSET = 128;
const HOLE_PAD = 6;
const CARD_ESTIMATE: Size = { width: 384, height: 280 };

const primaryBtn =
  "inline-flex h-10 items-center gap-2 rounded-none bg-accent px-4 font-bold text-on-accent transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-0 active:translate-y-0 active:shadow-none";
const secondaryBtn = "inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-4 font-bold hover:bg-hover";

function measureAnchor(anchor: string | null): Rect | null {
  if (!anchor || !/^[\w-]+$/.test(anchor)) return null;
  const rects = [...document.querySelectorAll(`[data-tour~="${anchor}"]`)].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  });
  return unionRect(rects);
}

const viewport = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Replay button for the app bar. Icon only on phones, labelled for screen readers. */
export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Xem hướng dẫn"
      className="inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-hover"
    >
      <Route aria-hidden className="size-4" />
      <span className="hidden sm:inline">Hướng dẫn</span>
    </button>
  );
}

/**
 * Step-by-step overlay: dims the page except the anchored panel and shows a card next to it
 * (bottom sheet on phones). Esc or "Bỏ qua" skips, arrow keys move, Tab stays inside the card,
 * and focus returns to where it was when the tour closes.
 */
export function GuidedTour({ tour }: { tour: TourControls }) {
  const { open, index, step, steps, next, prev, close } = tour;
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [vp, setVp] = useState<Size>(() => (typeof window === "undefined" ? CARD_ESTIMATE : viewport()));
  const [placement, setPlacement] = useState<Placement>({ mode: "center" });

  // Remember what had focus before the tour, give it back afterwards. A layout effect declared
  // before the focus effect below, so it reads the old focus before the card takes it.
  useLayoutEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const el = returnFocus.current;
      if (el && el.isConnected) el.focus();
    };
  }, [open]);

  // Bring the anchor into view on every step, then follow scroll/resize.
  useEffect(() => {
    if (!open || !step) return;
    const first = measureAnchor(step.anchor);
    if (first) {
      const top = first.top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setAnchor(measureAnchor(step.anchor));
        setVp(viewport());
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, step]);

  // Place the card once its real size is known.
  useLayoutEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    const size = card ? { width: card.offsetWidth || CARD_ESTIMATE.width, height: card.offsetHeight || CARD_ESTIMATE.height } : CARD_ESTIMATE;
    const hole = anchor ? padRect(anchor, HOLE_PAD) : null;
    const nextPlacement = placeCard(hole, size, vp);
    setPlacement((p) => (JSON.stringify(p) === JSON.stringify(nextPlacement) ? p : nextPlacement));
  }, [open, anchor, vp, index]);

  // Layout effect: focus lands in the same commit that shows the card, never a frame later.
  useLayoutEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, index]);

  // Layout effect too: Esc and the arrow keys must work from the first frame the card is visible.
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, close]);

  const trapTab = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!open || !step || typeof document === "undefined") return null;

  const hole = anchor ? padRect(anchor, HOLE_PAD) : null;
  const isLast = index === steps.length - 1;
  const cardPosition =
    placement.mode === "sheet"
      ? "inset-x-4 bottom-4 max-h-[70vh] overflow-y-auto"
      : placement.mode === "center"
        ? "left-1/2 top-1/2 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2"
        : "w-96 max-w-[calc(100vw-2rem)]";

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="guided-tour">
      {hole ? (
        <>
          {holeRects(hole, vp).map((r, i) => (
            <div key={i} aria-hidden className="absolute bg-bg/80" style={r} />
          ))}
          <div aria-hidden className="pointer-events-none absolute border-2 border-highlight" style={hole} />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-bg/80" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={trapTab}
        className={cn("absolute border border-line-strong bg-surface p-5 shadow-hard", cardPosition)}
        style={placement.mode === "float" ? { top: placement.top, left: placement.left } : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="mono-label">
            Hướng dẫn · Bước {index + 1}/{steps.length}
          </span>
          <button type="button" onClick={close} aria-label="Bỏ qua hướng dẫn" className="inline-flex size-10 items-center justify-center hover:bg-hover">
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <h2 id={titleId} className="mt-2 text-xl font-extrabold">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-2 text-base text-fg">
          {step.body}
        </p>

        <ol aria-hidden className="mt-4 flex gap-1.5">
          {steps.map((s, i) => (
            <li key={s.id} className={cn("h-1.5 flex-1", i <= index ? "bg-accent" : "bg-line")} />
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={close} className="h-10 px-1 font-bold text-soft underline-offset-4 hover:text-fg hover:underline">
            Bỏ qua
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={prev} className={secondaryBtn}>
                <ArrowLeft aria-hidden className="size-4" />
                Quay lại
              </button>
            )}
            <button ref={primaryRef} type="button" onClick={next} className={primaryBtn}>
              {isLast ? (
                <>
                  Xong <Check aria-hidden className="size-4" strokeWidth={2.5} />
                </>
              ) : (
                <>
                  Tiếp <ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
