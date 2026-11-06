import { useEffect, useRef, useState, type RefObject } from "react";

interface Options {
  threshold?: number;
  /** Stay true after the first intersection (default). Set false to track enter/leave. */
  once?: boolean;
}

/** True while (or once, by default) the element is on screen. Falls back to true without IntersectionObserver. */
export function useInView<T extends Element>({ threshold = 0.15, once = true }: Options = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}
