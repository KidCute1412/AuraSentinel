import { JOB_TERMINAL_STATUSES, type JobDetailDto } from "@agentshield/shared";
import { reasonTitle } from "@/shared/api/mockEngine";

export type StepId = JobDetailDto["audit"][number]["shield"];
export type StepState = "pending" | "active" | "pass" | "fail" | "skipped";

export interface TimelineStep {
  id: StepId;
  label: string;
  shield: "Shield 1" | "Shield 2";
  state: StepState;
  note: string | null;
  /** When the step finished (audit entry timestamp); null if it never ran. */
  ts: string | null;
}

const STEPS: { id: StepId; label: string; shield: TimelineStep["shield"] }[] = [
  { id: "precheck", label: "Pre-check", shield: "Shield 1" },
  { id: "simulation", label: "Simulation", shield: "Shield 1" },
  { id: "invariant", label: "Invariants", shield: "Shield 1" },
  { id: "onchain", label: "On-chain policy", shield: "Shield 2" },
];

/** Which step is running while the job is in a non-terminal status. */
const ACTIVE: Partial<Record<JobDetailDto["status"], StepId>> = { prechecking: "precheck", simulating: "simulation", broadcasting: "onchain" };

/**
 * Four-step view of a job (Shield 1 pre-check, simulation, invariants, then Shield 2 on-chain).
 * Driven entirely by the audit trail + status, so a step that never ran after a block shows as "skipped",
 * and an attack that bypasses the website shows its Shield 1 steps as skipped with the reason.
 */
export function timelineSteps(job: Pick<JobDetailDto, "status" | "audit" | "precheck" | "kind" | "origin">): TimelineStep[] {
  const terminal = (JOB_TERMINAL_STATUSES as readonly string[]).includes(job.status);
  const active = ACTIVE[job.status];
  const bypassed = terminal && job.origin === "redteam" && job.precheck === null;
  return STEPS.map((s) => {
    const entry = job.audit.find((a) => a.shield === s.id);
    if (entry) return { ...s, state: entry.result === "pass" ? "pass" : "fail", note: entry.result === "fail" ? reasonTitle(entry.reason) : null, ts: entry.ts } as TimelineStep;
    if (!terminal) return { ...s, state: s.id === active ? "active" : "pending", note: null, ts: null };
    return { ...s, state: "skipped", note: bypassed && s.shield === "Shield 1" ? "Skipped: the website was bypassed" : "Not reached", ts: null };
  });
}

export const isTerminal = (status: JobDetailDto["status"]): boolean => (JOB_TERMINAL_STATUSES as readonly string[]).includes(status);
