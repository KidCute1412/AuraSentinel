import { useEffect, useState } from "react";
import { Ban, Check, Landmark, Minus, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { prefersReducedMotion } from "@/shared/lib/useReducedMotion";
import { Stamp } from "@/shared/ui/Stamp";
import { GATE_INFO } from "../lib/checks";
import { nextStop, shownLook, trackTarget, VAULT_STOP, type GateLook } from "../lib/pipelineMotion";
import type { StepId } from "../lib/timeline";

/** Left edge (percent) of each gate post, then the vault. The agent starts at 0. */
const GATE_AT = [22, 41, 60, 79] as const;
const VAULT_AT = 96;
/** Where the packet waits: just in front of gate i, or inside the vault. */
const PACKET_AT = [...GATE_AT.map((g) => g - 7), VAULT_AT] as const;
/** One gate per beat: the 200ms slide plus a short look at the gate. */
const STEP_MS = 320;

/** The packet walks to `target` one gate per beat (replay on mount, live steps as the job advances). */
function useShownStop(target: number, bypass: boolean): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (shown === target) return;
    if (shown > target || prefersReducedMotion()) return void setShown(target);
    const t = setTimeout(() => setShown((s) => nextStop(s, target, bypass)), STEP_MS);
    return () => clearTimeout(t);
  }, [shown, target, bypass]);
  return shown;
}

const POST: Record<GateLook, { box: string; icon: typeof Check | null }> = {
  pass: { box: "border-accent bg-accent text-on-accent", icon: Check },
  fail: { box: "border-danger bg-danger text-bg", icon: X },
  active: { box: "border-fg bg-surface text-fg animate-pulse motion-reduce:animate-none", icon: null },
  pending: { box: "border-line-strong bg-surface text-muted", icon: null },
  skipped: { box: "border-line border-dashed bg-surface text-muted", icon: Minus },
  bypassed: { box: "border-line-strong border-dashed bg-hover text-muted", icon: Ban },
};

/**
 * The trade as a packet walking the four gates toward the vault (design-system §4 "Shield pipeline"). Every position
 * comes from the audit trail: it never runs ahead of what the server recorded. Decorative: the gate tabs below carry
 * the same facts in text, so this is aria-hidden.
 */
export function PipelineTrack({ ids, looks, label, jobFailed }: { ids: readonly StepId[]; looks: readonly GateLook[]; label: string; jobFailed: boolean }) {
  const target = trackTarget(looks, jobFailed);
  const shown = useShownStop(target.stop, target.bypass);
  const arrived = shown === target.stop;
  const inVault = arrived && shown === VAULT_STOP;
  const stopped = arrived && target.blocked;
  const halted = arrived && target.halted;

  return (
    <div aria-hidden className="relative h-[4.25rem] select-none">
      {/* The packet's label rides above it; at a barrier the Blocked stamp takes its place. */}
      {!stopped && (
        <span
          className={cn("absolute top-0 whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-widest", inVault ? "right-0 text-accent-text" : "track-move -translate-x-1/2")}
          style={inVault ? undefined : { left: `${PACKET_AT[shown]}%` }}
        >
          {inVault ? `${label} · landed` : label}
        </span>
      )}

      {/* Agent end */}
      <span className="absolute left-0 top-[1.85rem] font-mono text-[10px] uppercase tracking-widest text-muted">Agent</span>

      {/* Segments: solid where the packet has been, dashed where the website was skipped. */}
      {GATE_AT.map((g, i) => {
        const from = i === 0 ? 7 : GATE_AT[i - 1]! + 3;
        const skippedWeb = target.bypass && i < 3;
        const walked = !skippedWeb && shown >= i;
        return (
          <span
            key={`seg-${i}`}
            className={cn("absolute top-[2.25rem] h-0 border-t-2", skippedWeb ? "border-dashed border-line-strong" : walked ? "border-fg" : "border-line")}
            style={{ left: `${from}%`, width: `${g - from}%` }}
          />
        );
      })}
      <span
        className={cn("absolute top-[2.25rem] h-0 border-t-2", inVault ? "border-accent" : "border-line")}
        style={{ left: `${GATE_AT[3] + 3}%`, width: `${VAULT_AT - GATE_AT[3] - 5}%` }}
      />
      {target.bypass && (
        <span className="absolute top-[0.85rem] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-muted" style={{ left: `${GATE_AT[1] + 2}%` }}>
          Website skipped
        </span>
      )}

      {/* Gate posts */}
      {ids.map((id, i) => {
        const look = shownLook(looks[i]!, i, shown, target);
        const post = POST[look];
        const Icon = post.icon;
        const barrier = look === "fail";
        return (
          <span key={id} className="absolute top-[1.5rem]" style={{ left: `${GATE_AT[i]}%` }}>
            <span key={look} className={cn("flex w-6 items-center justify-center border-2", barrier ? "-mt-2 h-10" : "h-6", post.box, (look === "pass" || barrier) && "animate-gate-flash")}>
              {Icon && <Icon strokeWidth={3} className="size-3.5" />}
            </span>
            <span className="absolute left-1/2 top-[2rem] hidden -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-widest text-muted sm:block">
              {GATE_INFO[id].title}
            </span>
            {barrier && stopped && <Stamp tone="danger" animate className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-bg">Blocked</Stamp>}
          </span>
        );
      })}

      {/* The vault */}
      <span
        className={cn(
          "absolute right-0 top-[1.4rem] flex h-7 items-center gap-1 border-2 px-1.5 font-mono text-[10px] font-bold uppercase tracking-widest",
          inVault ? "animate-gate-flash border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-muted",
        )}
      >
        <Landmark strokeWidth={2.5} className="size-3.5" />
        <span className="hidden sm:inline">Vault</span>
      </span>

      {/* The packet */}
      {!inVault && (
        <span
          className={cn(
            "track-move absolute top-[1.85rem] size-3.5 -translate-x-1/2 border-2",
            stopped ? "animate-shake border-danger bg-danger" : halted ? "border-line-strong bg-hover" : "border-fg bg-fg",
          )}
          style={{ left: `${PACKET_AT[shown]}%` }}
        />
      )}
    </div>
  );
}
