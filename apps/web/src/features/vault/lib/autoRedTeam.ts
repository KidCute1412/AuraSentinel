import { JOB_TERMINAL_STATUSES, type JobDto } from "@agentshield/shared";

type Run = Pick<JobDto, "status" | "reasonCode" | "revertError"> | undefined;

export interface RunOutcome {
  label: string;
  tone: "blocked" | "held" | "through" | "running" | "error";
}

/** One Auto red-team row, in words: which layer answered, or that it got through (which must never happen). */
export function runOutcome(job: Run): RunOutcome {
  if (!job || !(JOB_TERMINAL_STATUSES as readonly string[]).includes(job.status)) return { label: "Checking…", tone: "running" };
  switch (job.status) {
    case "rejected":
      return { label: "Blocked · Shield 1", tone: "blocked" };
    case "reverted":
      return { label: (job.revertError ?? job.reasonCode ?? "").startsWith("GS") ? "Reverted · the Safe" : "Reverted · Shield 2", tone: "blocked" };
    case "held":
      return { label: "Held · not sent", tone: "held" };
    case "confirmed":
      return { label: "Got through", tone: "through" };
    default:
      return { label: "Error · no verdict", tone: "error" };
  }
}

/** The board's headline: how many runs finished, and how many moved money (a red-team run never should). */
export function autoScore(jobs: readonly Run[]): { total: number; finished: number; through: number; done: boolean } {
  const finished = jobs.filter((j) => j && (JOB_TERMINAL_STATUSES as readonly string[]).includes(j.status)).length;
  const through = jobs.filter((j) => j?.status === "confirmed").length;
  return { total: jobs.length, finished, through, done: jobs.length > 0 && finished === jobs.length };
}
