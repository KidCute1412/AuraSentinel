import { useEffect, useRef, useState } from "react";
import { LINES, pick } from "@/shared/mascot/lines";
import { react } from "@/shared/mascot/mascotStore";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { fireAttack } from "./attackBus";

type Verdict = "APPROVE" | "BLOCKED";
interface Row { id: number; action: string; verdict: Verdict; note: string }

const EVENTS: Omit<Row, "id">[] = [
  { action: "swap 0.50 AVAX → USDC", verdict: "APPROVE", note: "13.3% of daily cap" },
  { action: "transfer 2,000 USDC → 0x999…dead", verdict: "BLOCKED", note: "ExceedsPerTxCap" },
  { action: "swap 120 USDC → AVAX", verdict: "APPROVE", note: "within whitelist" },
  { action: "approve MAX_UINT256 → 0xRouter", verdict: "BLOCKED", note: "UnlimitedApproval" },
  { action: "swap 40 USDC → WAVAX", verdict: "APPROVE", note: "recipient = vault" },
  { action: "direct call, skip website", verdict: "BLOCKED", note: "reverted on-chain" },
];
const VISIBLE = 5;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function LiveFeed() {
  const next = useRef(VISIBLE);
  const mk = (e: Omit<Row, "id">): Row => ({ ...e, id: next.current++ });
  const [rows, setRows] = useState<Row[]>(() =>
    EVENTS.slice(0, VISIBLE).map((e, i) => ({ ...e, id: i })),
  );
  const [blocked, setBlocked] = useState(0);
  const [shake, setShake] = useState(0);
  const cursor = useRef(VISIBLE);

  const push = (e: Omit<Row, "id">) =>
    setRows((r) => [...r.slice(-(VISIBLE - 1)), mk(e)]);

  useEffect(() => {
    if (reducedMotion()) return;
    const id = setInterval(() => {
      const e = EVENTS[cursor.current++ % EVENTS.length];
      push(e);
      const blockedEvent = e.verdict === "BLOCKED";
      react(blockedEvent ? "alarm" : "happy", {
        passive: true,
        hold: 1000,
        text: Math.random() < 0.4 ? pick(blockedEvent ? LINES.blocked : LINES.approve) : undefined,
      });
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const attack = () => {
    push({ action: "YOU → drain vault 10,000 USDC", verdict: "BLOCKED", note: "ExceedsPerTxCap" });
    setBlocked((b) => b + 1);
    setShake((s) => s + 1);
    fireAttack();
    react("guard", { text: LINES.rob, hold: 1500 });
  };

  return (
    <div>
      <Chamfer ground="hero-feed" code="SEC-0412 / LIVE">
        <div key={shake} className={shake ? "animate-shake" : ""} aria-label="Live transaction feed">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="mono-label">sentinel · live</span>
            <span className="mono-label !text-accent-text">STATUS: PROTECTED</span>
          </div>
          <ol className="min-h-[17rem] divide-y divide-line font-mono text-sm" aria-live="off">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`animate-feed-in flex items-center gap-3 px-3 py-3 sm:px-4 ${r.verdict === "BLOCKED" ? "bg-tint-pink" : ""}`}
              >
                <span className="w-24 shrink-0">
                  <Stamp tone={r.verdict === "BLOCKED" ? "danger" : "ok"} animate>{r.verdict}</Stamp>
                </span>
                <span className="min-w-0 flex-1 truncate text-fg">{r.action}</span>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">{r.note}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 pb-5">
            <span className="mono-label">
              You tried {blocked}× · funds lost <span className="text-accent-text">0</span>
            </span>
          </div>
        </div>
      </Chamfer>
      <div className="mt-6 flex items-center gap-4">
        <span className="drop-hard" data-ground="rob-btn">
          <button
            type="button"
            onClick={attack}
            className="chamfer h-12 bg-danger px-6 font-bold text-white transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px active:translate-x-0 active:translate-y-0"
          >
            Try to rob it
          </button>
        </span>
        <span className="mono-label">go on, we dare you</span>
      </div>
    </div>
  );
}
