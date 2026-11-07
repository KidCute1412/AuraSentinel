import { ambient, cooled } from "./auraEvents";
import { lookAt } from "./eyes";
import { LINES } from "./lines";
import { react, touch, useMascot } from "./mascotStore";

/**
 * Page-independent reactions. Pages do not call anything: they either do nothing (browser-level
 * behavior below) or tag an element with `data-aura`:
 *
 *   danger     hover: guard "think twice." (override with data-aura-line), click: alarm
 *   blocked    hover: small alarm (a blocked row in a feed)
 *   success    click: happy "clean."
 *   sensitive  focus: Aura-kun covers his eyes until blur (password inputs count automatically)
 *
 * Everything here is decoration: each handler is wrapped so a bug can never break the app.
 */

const ADDRESS = /0x[0-9a-fA-F]{8,}/;
const AWAY_TITLE = "come back...";

const safe =
  <A extends unknown[]>(fn: (...a: A) => void) =>
  (...a: A): void => {
    try {
      fn(...a);
    } catch {
      /* decoration must never break the app */
    }
  };

const isHidden = () => useMascot.getState().hidden;
const mood = () => useMascot.getState().mood;

const auraOf = (t: EventTarget | null, kind: string): HTMLElement | null =>
  t instanceof Element ? t.closest<HTMLElement>(`[data-aura="${kind}"]`) : null;

const isSensitive = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (auraOf(t, "sensitive") !== null || (t instanceof HTMLInputElement && t.type === "password"));

const isTextField = (t: EventTarget | null): t is HTMLElement =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

const isExternal = (a: HTMLAnchorElement): boolean => {
  try {
    const u = new URL(a.href, window.location.href);
    return /^https?:$/.test(u.protocol) && u.origin !== window.location.origin;
  } catch {
    return false;
  }
};

/** Currently selected text, including inside <input>/<textarea> where getSelection() is empty. */
function selectedText(): string {
  const a = document.activeElement;
  if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) {
    const { selectionStart: s, selectionEnd: e, value } = a;
    if (s !== null && e !== null && e > s) return value.slice(s, e);
  }
  return window.getSelection()?.toString() ?? "";
}

/** Is the Kill-Switch section mostly on screen (so leaving a danger hover should restore its mood)? */
function killInView(): boolean {
  const el = document.getElementById("kill-switch");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return r.height > 0 && visible / r.height >= 0.5;
}

export function installGlobalReactions(): () => void {
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof DocumentEventMap>(
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    const h = safe(fn) as EventListener;
    document.addEventListener(type, h, opts);
    cleanups.push(() => document.removeEventListener(type, h, opts));
  };
  const onWin = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    const h = safe(fn) as EventListener;
    window.addEventListener(type, h, opts);
    cleanups.push(() => window.removeEventListener(type, h, opts));
  };

  // --- tab: leaving and coming back ---------------------------------------------------------------
  let awayAt = 0;
  let savedTitle: string | null = null;
  on("visibilitychange", () => {
    if (document.hidden) {
      awayAt = Date.now();
      if (!isHidden() && savedTitle === null) {
        savedTitle = document.title;
        document.title = AWAY_TITLE;
      }
      return;
    }
    if (savedTitle !== null && document.title === AWAY_TITLE) document.title = savedTitle;
    savedTitle = null;
    const away = Date.now() - awayAt;
    if (!awayAt || away < 4000 || isHidden()) return;
    awayAt = 0;
    touch();
    react("happy", { text: away > 60_000 ? LINES.backLong : LINES.back, hold: 1500 });
  });
  cleanups.push(() => {
    if (savedTitle !== null && document.title === AWAY_TITLE) document.title = savedTitle;
  });

  // --- network ------------------------------------------------------------------------------------
  onWin("offline", () => react("alarm", { text: LINES.offline, hold: 1800 }));
  onWin("online", () => react("happy", { text: LINES.online, hold: 1400 }));

  // --- clipboard and selection --------------------------------------------------------------------
  on("copy", () => {
    if (ADDRESS.test(selectedText()) && cooled("copy", 8000)) react("inspect", { text: LINES.copyAddr, hold: 1600 });
  });
  on("paste", (e) => {
    if (ADDRESS.test(e.clipboardData?.getData("text") ?? "") && cooled("paste", 8000)) {
      react("inspect", { text: LINES.pasteAddr, hold: 1600 });
    }
  });
  let selTimer: ReturnType<typeof setTimeout> | undefined;
  on("selectionchange", () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(
      safe(() => {
        const t = window.getSelection()?.toString().trim() ?? "";
        if (t.length >= 40) ambient("read", 45_000, "inspect", { text: LINES.reading, hold: 1800 });
      }),
      700,
    );
  });
  cleanups.push(() => clearTimeout(selTimer));

  // --- scrolling: too fast, bottom, back to top ---------------------------------------------------
  let path = window.location.pathname;
  let lastY = window.scrollY;
  let lastT = performance.now();
  let fast = 0;
  let maxY = 0;
  let bottomPath = "";
  onWin(
    "scroll",
    () => {
      const now = performance.now();
      if (window.location.pathname !== path) {
        // a route change scrolls to the top by itself: not the person's doing
        path = window.location.pathname;
        maxY = 0;
        fast = 0;
        lastY = window.scrollY;
        lastT = now;
        return;
      }
      const y = window.scrollY;
      const vh = window.innerHeight;
      maxY = Math.max(maxY, y);
      if (now - lastT >= 100) {
        const v = (Math.abs(y - lastY) / (now - lastT)) * 1000;
        fast = v > 4500 ? fast + 1 : 0;
        lastY = y;
        lastT = now;
        if (fast >= 2) {
          fast = 0;
          ambient("fast", 60_000, "whoa", { text: LINES.fastScroll, hold: 1000 });
        }
      }
      const total = document.documentElement.scrollHeight;
      if (bottomPath !== path && total > vh * 1.5 && y + vh >= total - 4) {
        if (ambient("bottom", 5000, "happy", { text: LINES.bottom, hold: 1600 })) bottomPath = path;
      }
      if (maxY > vh * 2 && y < 8) {
        if (ambient("top", 30_000, "hop", { text: LINES.top, hold: 500 })) maxY = 0;
      }
    },
    { passive: true },
  );

  // --- window: resize and leaving through the top edge --------------------------------------------
  let width = window.innerWidth;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  onWin("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(
      safe(() => {
        const w = window.innerWidth;
        if (Math.abs(w - width) > 300) ambient("resize", 20_000, "whoa", { text: LINES.resize, hold: 1400 });
        width = w;
      }),
      400,
    );
  });
  cleanups.push(() => clearTimeout(resizeTimer));

  let dangerEl: HTMLElement | null = null;
  const leaveDanger = () => {
    if (!dangerEl) return;
    dangerEl = null;
    if (mood() === "guard") react(killInView() ? "kill" : "idle", { hold: 0 });
  };
  on("mouseout", (e) => {
    if (e.relatedTarget !== null) return;
    leaveDanger();
    if (e.clientY <= 0) ambient("exit", 120_000, "guard", { text: LINES.exit, hold: 1500 });
  });
  on("contextmenu", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-aura-self]")) return;
    ambient("ctx", 30_000, "inspect", { text: LINES.context, hold: 1500 });
  });

  // --- data-aura elements: hover ------------------------------------------------------------------
  let lastRow: HTMLElement | null = null;
  on("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const danger = auraOf(e.target, "danger");
    if (danger !== dangerEl) {
      leaveDanger();
      dangerEl = danger;
      if (danger) react("guard", { text: danger.dataset.auraLine ?? LINES.dangerHover, hold: 8000 });
    }
    const row = auraOf(e.target, "blocked");
    if (row && row !== lastRow) ambient("row", 8000, "alarm", { text: LINES.blockedRow, hold: 900 });
    lastRow = row;
  });

  // --- data-aura elements: click, plus external links ---------------------------------------------
  on(
    "click",
    (e) => {
      if (auraOf(e.target, "danger")) return react("alarm", { text: LINES.dangerClick, hold: 1200 });
      if (auraOf(e.target, "success")) return react("happy", { text: LINES.success, hold: 1000 });
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (a && isExternal(a)) react("whoa", { text: LINES.external, hold: 1000 });
    },
    true,
  );

  // --- forms: secrets, typing, errors -------------------------------------------------------------
  on(
    "focusin",
    (e) => {
      if (isSensitive(e.target)) react("shy", { text: LINES.shy, hold: 20_000 });
    },
    true,
  );
  on(
    "focusout",
    (e) => {
      if (isSensitive(e.target) && mood() === "shy") react("idle", { hold: 0 });
    },
    true,
  );
  let lastGlance = 0;
  on(
    "keydown",
    (e) => {
      if (!isTextField(e.target)) return;
      if (isSensitive(e.target)) {
        if (mood() === "shy") react("shy", { hold: 20_000 }); // typing keeps the hands up
        return;
      }
      const now = Date.now();
      if (now - lastGlance < 250) return;
      lastGlance = now;
      const r = e.target.getBoundingClientRect();
      lookAt(r.left + Math.min(r.width, 240) / 2, r.top + r.height / 2, 1500);
    },
    true,
  );
  on(
    "invalid",
    () => {
      if (cooled("invalid", 2500)) react("annoyed", { text: LINES.invalid, hold: 1600 });
    },
    true,
  );

  // --- modal opens: look at it --------------------------------------------------------------------
  if (typeof MutationObserver !== "undefined") {
    const SEL = '[role="dialog"],[aria-modal="true"]';
    const mo = new MutationObserver(
      safe((records: MutationRecord[]) => {
        for (const rec of records) {
          for (const n of rec.addedNodes) {
            if (!(n instanceof Element)) continue;
            const dlg = n.matches(SEL) ? n : n.querySelector(SEL);
            if (dlg) {
              const r = dlg.getBoundingClientRect();
              lookAt(r.left + r.width / 2, r.top + r.height / 2, 3000);
              return;
            }
          }
        }
      }),
    );
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => mo.disconnect());
  }

  return () => cleanups.forEach((c) => c());
}
