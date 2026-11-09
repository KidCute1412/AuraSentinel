import { Ban, Check, CircleSlash, Clock, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { JobStatus } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";

type Tone = "ok" | "danger" | "warn" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-accent text-on-accent",
  danger: "bg-danger text-white",
  warn: "bg-warn text-on-accent",
  info: "bg-tint-sky text-fg border border-line-strong",
  neutral: "bg-hover text-soft border border-line-strong",
};

export type VaultStatus = "active" | "revoked" | "incomplete" | "unknown";

interface Spec {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

/** Job state -> badge. Icon + text so color is never the only signal. */
const JOB: Record<JobStatus, Spec> = {
  queued: { label: "Queued", tone: "info", icon: Clock },
  prechecking: { label: "Checking", tone: "info", icon: Clock },
  simulating: { label: "Simulating", tone: "info", icon: Clock },
  broadcasting: { label: "Broadcasting", tone: "info", icon: Clock },
  confirmed: { label: "Safe", tone: "ok", icon: Check },
  rejected: { label: "Shield 1 blocked", tone: "danger", icon: X },
  reverted: { label: "Shield 2 blocked", tone: "danger", icon: Ban },
  failed: { label: "Infra error", tone: "neutral", icon: CircleSlash },
};

const VAULT: Record<VaultStatus, Spec> = {
  active: { label: "Protected", tone: "ok", icon: Check },
  revoked: { label: "Revoked", tone: "danger", icon: Ban },
  incomplete: { label: "Incomplete", tone: "warn", icon: TriangleAlert },
  unknown: { label: "Unknown", tone: "neutral", icon: CircleSlash },
};

type Props = { className?: string } & ({ job: JobStatus; vault?: never } | { vault: VaultStatus; job?: never });

export function StatusBadge({ job, vault, className }: Props) {
  const spec = job ? JOB[job] : VAULT[vault!];
  const Icon = spec.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest", TONE[spec.tone], className)}>
      <Icon aria-hidden strokeWidth={3} className="size-3" />
      {spec.label}
    </span>
  );
}
