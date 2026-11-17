import type { Status, Verdict } from "./judge.ts";

export interface Check extends Verdict {
  id: string;
  title: string;
}

const MARK: Record<Status, string> = { PASS: "PASS", WARN: "WARN", FAIL: "FAIL", SKIP: "skip" };

/** Collects checks and prints them as they come, so a slow RPC never looks like a hang. */
export class Report {
  readonly checks: Check[] = [];
  constructor(private readonly quiet = false) {}

  add(id: string, title: string, v: Verdict): void {
    const c = { id, title, ...v };
    this.checks.push(c);
    if (!this.quiet) console.log(`${MARK[c.status].padEnd(4)}  ${c.id.padEnd(3)} ${c.title}: ${c.detail}`);
  }

  section(name: string): void {
    if (!this.quiet) console.log(`\n== ${name}`);
  }

  count(s: Status): number {
    return this.checks.filter((c) => c.status === s).length;
  }

  get failed(): boolean {
    return this.count("FAIL") > 0;
  }

  summary(): string {
    return `${this.count("PASS")} PASS, ${this.count("WARN")} WARN, ${this.count("FAIL")} FAIL${this.count("SKIP") ? `, ${this.count("SKIP")} skipped` : ""}`;
  }
}
