import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Landmark, ShieldCheck, Skull } from "lucide-react";
import { Chamfer } from "@/shared/ui/Chamfer";
import { useInView } from "@/shared/lib/useInView";
import { useReducedMotion } from "@/shared/lib/useReducedMotion";
import { ATTACK_EVENT } from "./attackBus";

type Kind = "bad" | "good";
interface Packet { id: number; kind: Kind }
interface Burst { id: number }

const BAD_MS = 900;
const GOOD_MS = 1600;
const SPAWN_MS = 2600;
const MAX_PACKETS = 6;
const SHARDS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2;
  return { dx: Math.round(Math.cos(a) * 34), dy: Math.round(Math.sin(a) * 34) };
});

/** Decorative rail: red attacks shatter on the shield, green trades pass to the vault. */
export function AttackLane() {
  const reduced = useReducedMotion();
  const [ref, visible] = useInView<HTMLDivElement>({ threshold: 0.2, once: false });
  const [packets, setPackets] = useState<Packet[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [blocked, setBlocked] = useState(0);
  const [hit, setHit] = useState(0);
  const nextId = useRef(0);
  const count = useRef(0);
  const live = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const spawn = useCallback(
    (kind: Kind) => {
      if (live.current >= MAX_PACKETS) return;
      live.current += 1;
      const id = nextId.current++;
      setPackets((p) => [...p, { id, kind }]);
      later(() => {
        live.current -= 1;
        setPackets((p) => p.filter((x) => x.id !== id));
        if (kind === "bad") {
          setBlocked((b) => b + 1);
          setHit((h) => h + 1);
          setBursts((b) => [...b, { id }]);
          later(() => setBursts((b) => b.filter((x) => x.id !== id)), 750);
        }
      }, kind === "bad" ? BAD_MS : GOOD_MS);
    },
    [later],
  );

  // Ambient traffic: one packet every 2.6s, every third one is a valid trade.
  useEffect(() => {
    if (reduced || !visible) return;
    const iv = setInterval(() => {
      if (document.hidden) return;
      count.current += 1;
      spawn(count.current % 3 === 0 ? "good" : "bad");
    }, SPAWN_MS);
    return () => clearInterval(iv);
  }, [reduced, visible, spawn]);

  // "Try to rob it": a burst of three attacks.
  useEffect(() => {
    if (reduced) return;
    const onAttack = () => [0, 250, 500].forEach((ms) => later(() => spawn("bad"), ms));
    window.addEventListener(ATTACK_EVENT, onAttack);
    return () => window.removeEventListener(ATTACK_EVENT, onAttack);
  }, [reduced, spawn, later]);

  useEffect(() => {
    const all = timers.current;
    return () => {
      all.forEach(clearTimeout);
      all.clear();
    };
  }, []);

  return (
    <div ref={ref}>
      <Chamfer code="LANE / ATTACKS" innerClassName="px-5 pb-10 pt-4 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="mono-label">live attack lane</span>
          <span className="mono-label !text-accent-text">
            blocked <span className="tabular">{reduced ? 1 : blocked}</span> · funds lost 0
          </span>
        </div>

        <div aria-hidden className="relative mt-4 h-16">
          <div className="absolute inset-x-8 top-1/2 border-t-2 border-dashed border-line-strong" />

          <div className="absolute left-0 top-1/2 grid size-14 -translate-y-1/2 place-items-center border border-danger bg-tint-pink">
            <Skull className="size-6 text-danger-text" />
          </div>

          <div key={hit} className={`absolute left-[56%] top-1/2 -translate-x-1/2 -translate-y-1/2 ${hit ? "animate-shake" : ""}`}>
            <span className="drop-hard block">
              <span className="chamfer grid size-14 place-items-center bg-accent text-on-accent">
                <ShieldCheck className="size-7" />
              </span>
            </span>
          </div>

          <div className="absolute right-0 top-1/2 grid size-14 -translate-y-1/2 place-items-center border border-line-strong bg-surface">
            <Landmark className="size-6 text-accent-text" />
          </div>

          {reduced ? (
            <>
              <span className="absolute top-1/2 size-3 -translate-y-1/2 bg-danger" style={{ left: "calc(56% - 2.5rem)" }} />
              <span className="absolute top-1/2 size-3 -translate-y-1/2 bg-accent" style={{ left: "calc(100% - 5rem)" }} />
            </>
          ) : (
            packets.map((p) => (
              <span key={p.id} className={`absolute top-1/2 size-3 -translate-y-1/2 ${p.kind === "bad" ? "lane-bad bg-danger" : "lane-good bg-accent"}`} />
            ))
          )}

          {bursts.map((b) => (
            <span key={b.id} className="absolute top-1/2 size-0" style={{ left: "calc(56% - 2.5rem)" }}>
              {SHARDS.map((s, i) => (
                <span key={i} className="gate-spark absolute -left-1 -top-1 size-2 bg-danger" style={{ "--dx": `${s.dx}px`, "--dy": `${s.dy}px` } as CSSProperties} />
              ))}
            </span>
          ))}
        </div>

        <div aria-hidden className="relative mt-1 h-4 font-mono text-[10px] uppercase tracking-widest text-muted">
          <span className="absolute left-0">attacker</span>
          <span className="absolute left-[56%] -translate-x-1/2">shield</span>
          <span className="absolute right-0">vault</span>
        </div>
        <p className="sr-only">Illustration: attacks are stopped at the shield, valid trades reach the vault.</p>
      </Chamfer>
    </div>
  );
}
