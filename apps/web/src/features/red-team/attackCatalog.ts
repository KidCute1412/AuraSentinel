import {
  ATTACK_EXPECTATIONS,
  REASONS,
  TOKEN_DECIMALS,
  parseUnits,
  type AttackExpectation,
  type AttackScenario,
  type JobDto,
} from "@agentshield/shared";

/** Default demo rebalance: 200 USDC in base units (glossary: 200 = 13,3% of the 1.500 daily cap). */
export const DEMO_REBALANCE_USDC = "200";
export const DEMO_REBALANCE_AMOUNT = parseUnits(DEMO_REBALANCE_USDC, TOKEN_DECIMALS.USDC).toString();

export type ButtonAttack = Exclude<AttackScenario, "prompt-injection">;

export interface AttackCopy {
  scenario: ButtonAttack;
  index: string;
  title: string;
  /** What the attack really does (system-design §5). */
  description: string;
}

/** The 4 attack buttons, in demo order. Copy describes the real action; the outcome copy comes from ATTACK_EXPECTATIONS. */
export const ATTACKS: readonly AttackCopy[] = [
  { scenario: "over-withdraw", index: "#1", title: "Rút quá hạn mức", description: "Gửi lệnh 2.000 USDC, gấp 4 lần hạn mức mỗi lệnh." },
  { scenario: "wrong-recipient", index: "#2", title: "Đổi người nhận", description: "Lệnh muốn chuyển tiền tới ví của kẻ tấn công thay vì két." },
  { scenario: "unlimited-approval", index: "#3", title: "Xin quyền rút vô hạn", description: "Khoá agent gọi thẳng Safe để approve không giới hạn." },
  { scenario: "bypass", index: "#4", title: "Bỏ qua website", description: "Ký lệnh và gửi thẳng lên contract, né hoàn toàn Shield 1." },
];

const STOPPER: Record<Exclude<AttackExpectation["stoppedBy"], "llm-guard">, string> = {
  shield1: "Shield 1 chặn",
  shield2: "Shield 2 chặn",
  safe: "Safe chặn",
};

const blocks = (e: AttackExpectation) => e.status === "rejected" || e.status === "reverted";

/**
 * "Shield 2 chặn · Vượt hạn mức mỗi lệnh · có link Snowtrace". Built from ATTACK_EXPECTATIONS so the
 * panel can never promise something the server tests do not check.
 */
export function expectationLabel(scenario: AttackScenario): string {
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  if (e.stoppedBy === "llm-guard") {
    return blocks(e) ? "LLM không có quyền: lệnh vẫn bị chặn" : "LLM không có quyền: kết quả không đổi";
  }
  // A Safe reason title already names the Safe ("Safe từ chối (GS104)"); do not say it twice.
  const parts = e.stoppedBy === "safe" && e.reasonCode ? [] : [STOPPER[e.stoppedBy]];
  if (e.reasonCode) parts.push(REASONS[e.reasonCode].title);
  if (e.onchainEvidence) parts.push("có link Snowtrace");
  return parts.join(" · ");
}

export type Outcome =
  | { kind: "pending" }
  | { kind: "expected"; label: string }
  | { kind: "unexpected"; label: string };

/**
 * Compares the job the server created for an attack with what ATTACK_EXPECTATIONS promises.
 * Only a terminal status counts; the reason must match too when one is expected.
 */
export function compareOutcome(job: JobDto | undefined, scenario: AttackScenario): Outcome {
  if (!job || !["confirmed", "rejected", "reverted", "failed"].includes(job.status)) return { kind: "pending" };
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const reason = job.reasonCode ?? job.revertError;
  const statusOk = job.status === e.status;
  const reasonOk = e.reasonCode === null || reason === e.reasonCode;
  if (statusOk && reasonOk) {
    return { kind: "expected", label: blocks(e) ? "Bị chặn đúng như dự kiến" : "Đúng như dự kiến" };
  }
  return { kind: "unexpected", label: `Khác dự kiến: ${job.status}${reason ? ` · ${reason}` : ""}` };
}
