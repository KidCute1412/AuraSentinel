import { Ban, Check, Hand, Landmark, Minus, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Stamp } from "@/shared/ui/Stamp";
import { GATE_INFO } from "../lib/checks";
import { isSettled, VAULT_STOP, type GateLook, type TrackPos, type TrackTarget } from "../lib/pipelineMotion";
import type { StepId } from "../lib/timeline";

/** Left edge (percent) of each gate post, then the vault. The agent starts at 0. */
const GATE_AT = [22, 41, 60, 79] as const;
const VAULT_AT = 96;
/** Where the packet waits: just in front of gate i, or inside the vault. */
const PACKET_AT = [...GATE_AT.map((g) => g - 7), VAULT_AT] as const;
/** Where each path segment starts: the agent, then just past the previous post. */
const SEG_FROM = [7, ...GATE_AT.slice(0, 3).map((g) => g + 3)] as const;

const POST: Record<GateLook, { box: string; icon: typeof Check | null; name: string }> = {
  pass: { box: "border-accent bg-accent text-on-accent", icon: Check, name: "text-accent-text" },
  fail: { box: "border-danger bg-danger text-bg", icon: X, name: "font-bold text-danger-text" },
  active: { box: "border-fg bg-surface text-fg", icon: null, name: "font-bold text-fg" },
  pending: { box: "border-line-strong bg-surface text-muted", icon: null, name: "text-muted" },
  skipped: { box: "border-line border-dashed bg-surface text-muted", icon: Minus, name: "text-muted" },
  bypassed: { box: "border-line-strong border-dashed bg-hover text-muted", icon: Ban, name: "text-muted" },
  held: { box: "border-accent border-dashed bg-surface text-accent-text", icon: Hand, name: "font-bold text-accent-text" },
};

/**
 * The trade as a packet walking the four gates toward the vault (design-system §4 "Shield pipeline"). `looks` and
 * `shown` come from the replay in ShieldPipeline, so the track never runs ahead of the audit trail. Decorative
 * (aria-hidden): the gate tabs below carry the same facts in text.
 */
export function PipelineTrack({ ids, looks, pos, target, label }: { ids: readonly StepId[]; looks: readonly GateLook[]; pos: TrackPos; target: TrackTarget; label: string }) {
  const shown = pos.stop;
  const arrived = isSettled(pos, target);
  const inVault = arrived && shown === VAULT_STOP;
  const stopped = arrived && target.blocked;
  const halted = arrived && target.halted;
  // A red-team plan inside the policy: it waits in front of the chain and never enters the vault.
  const parked = arrived && target.held;

  return (
    // The whole track jolts once when the packet hits a barrier (the class appears at that moment).
    <div aria-hidden className={cn("relative h-[4.5rem] select-none", stopped && "animate-shake")}>
      {/* The packet's tag rides above it. In the vault a SAFE stamp takes over; at a barrier, BLOCKED. */}
      {parked && (
        <Stamp tone="ok" animate className="absolute -top-1 right-0 whitespace-nowrap bg-bg">
          {`Held · not sent`}
        </Stamp>
      )}
      {!stopped && !inVault && !parked && (
        <span className="track-move absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-widest" style={{ left: `${PACKET_AT[shown]}%` }}>
          {label}
        </span>
      )}
      {inVault && (
        <Stamp tone="ok" animate className="absolute -top-1 right-0 whitespace-nowrap bg-bg">
          {`Safe · ${label}`}
        </Stamp>
      )}

      {/* Start: the word on wide screens, a small square marker on phones (the word would run into the path). */}
      <span className="absolute left-0 top-[1.95rem] hidden font-mono text-[10px] uppercase tracking-widest text-muted sm:block">Agent</span>
      <span className="absolute left-0 top-[2.05rem] size-2.5 border-2 border-line-strong bg-surface sm:hidden" />

      {/* Path: a quiet base line, then the walked part drawn in behind the packet. */}
      {GATE_AT.map((g, i) => {
        const from = SEG_FROM[i]!;
        const skippedWeb = target.bypass && i < 3;
        const walked = !skippedWeb && shown >= i;
        const intoBarrier = stopped && i === target.stop;
        return (
          <span key={`seg-${i}`} className="absolute top-[2.35rem] h-0" style={{ left: `${from}%`, width: `${g - from}%` }}>
            <span className={cn("absolute inset-x-0 top-0 border-t-2", skippedWeb ? "border-dashed border-line-strong" : "border-line")} />
            {walked && <span className={cn("flow-draw-r absolute inset-x-0 -top-px border-t-[3px]", intoBarrier ? "border-danger" : "border-accent")} />}
          </span>
        );
      })}
      <span className="absolute top-[2.35rem] h-0" style={{ left: `${GATE_AT[3] + 3}%`, width: `${VAULT_AT - GATE_AT[3] - 5}%` }}>
        <span className="absolute inset-x-0 top-0 border-t-2 border-line" />
        {inVault && <span className="flow-draw-r absolute inset-x-0 -top-px border-t-[3px] border-accent" />}
      </span>
      {target.bypass && (
        <span className="absolute top-[0.9rem] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-muted" style={{ left: `${GATE_AT[1] + 2}%` }}>
          Website skipped
        </span>
      )}

      {/* Gate posts */}
      {ids.map((id, i) => {
        const look = looks[i]!;
        const post = POST[look];
        const Icon = post.icon;
        const barrier = look === "fail";
        return (
          <span key={id} className="absolute top-[1.6rem]" style={{ left: `${GATE_AT[i]}%` }}>
            <span
              key={look}
              className={cn(
                "relative flex w-6 items-center justify-center overflow-hidden border-2",
                barrier ? "-mt-2 h-10 animate-danger-flash" : "h-6",
                look === "pass" && "animate-gate-flash",
                post.box,
              )}
            >
              {Icon && <Icon strokeWidth={3} className={cn("size-3.5", (look === "pass" || barrier) && "animate-pop-in")} />}
              {look === "active" && <span className="animate-scan absolute inset-x-0 top-0 h-1.5 bg-highlight" />}
            </span>
            <span className={cn("absolute left-1/2 top-[2rem] hidden -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-widest sm:block", post.name)}>
              {GATE_INFO[id].title}
            </span>
            {barrier && stopped && (
              <Stamp tone="danger" animate className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-bg">
                Blocked
              </Stamp>
            )}
          </span>
        );
      })}

      {/* The vault lifts off the page when the trade lands. */}
      <span
        className={cn(
          "vault-lift absolute right-0 top-[1.5rem] flex h-7 items-center gap-1 border-2 px-1.5 font-mono text-[10px] font-bold uppercase tracking-widest",
          inVault ? "-translate-x-px -translate-y-px border-accent bg-accent text-on-accent shadow-hard-sm" : "border-line-strong bg-surface text-muted",
        )}
      >
        <Landmark strokeWidth={2.5} className="size-3.5" />
        <span className="hidden sm:inline">Vault</span>
      </span>

      {/* The packet */}
      {!inVault && (
        <span
          className={cn(
            "track-move absolute top-[1.95rem] size-3.5 -translate-x-1/2 border-2",
            stopped ? "border-danger bg-danger" : halted ? "border-line-strong bg-hover" : parked ? "border-accent bg-surface" : "border-fg bg-fg shadow-hard-sm",
          )}
          style={{ left: `${PACKET_AT[shown]}%` }}
        />
      )}
    </div>
  );
}
