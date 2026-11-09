import type { JobDetailDto } from "@agentshield/shared";
import { Check, Minus, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount, reasonOf, stageViews, type TokenBook } from "../jobView";

interface JobDetailProps {
  detail: JobDetailDto | undefined;
  isLoading: boolean;
  isError: boolean;
  tokens: TokenBook;
}

const RESULT = {
  pass: { icon: Check, text: "Qua", className: "text-accent-text" },
  fail: { icon: X, text: "Chặn", className: "text-danger-text" },
  skipped: { icon: Minus, text: "Không chạy", className: "text-muted" },
} as const;

/** Audit trail of one job (api.md #11): which stage passed, which one stopped it, and the simulated deltas. */
export function JobDetail({ detail, isLoading, isError, tokens }: JobDetailProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-2 border border-line p-4">
        <span className="sr-only">Đang tải chi tiết kiểm tra</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden className="h-5 animate-pulse bg-hover" />
        ))}
      </div>
    );
  }
  if (isError || !detail) {
    return <p className="border border-line p-4 text-soft">Không tải được chi tiết kiểm tra của lệnh này.</p>;
  }

  const stages = stageViews(detail.audit);
  const failedChecks = detail.precheck && !detail.precheck.ok ? detail.precheck.reasons : [];
  const intent = detail.intent;

  return (
    <div className="space-y-4 border border-line p-4">
      <ol className="divide-y divide-line">
        {stages.map((s) => {
          const r = RESULT[s.result];
          return (
            <li key={s.label} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-mono text-sm">{s.label}</span>
              <span className={cn("inline-flex items-center gap-1 font-mono text-sm font-bold uppercase", r.className)}>
                <r.icon aria-hidden className="size-4" strokeWidth={3} />
                {r.text}
                {s.reason && <span className="normal-case">· {s.reason}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {failedChecks.length > 1 && (
        <div>
          <span className="mono-label">Mọi điều kiện precheck không đạt</span>
          <ul className="mt-2 flex flex-wrap gap-2">
            {failedChecks.map((code) => (
              <li key={code} className="rounded-pill border border-line-strong px-2 py-0.5 font-mono text-[11px]">
                {reasonOf(code).title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.sim && intent && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 font-mono text-sm sm:grid-cols-2">
          <dt className="text-muted">Chạy thử</dt>
          <dd className={detail.sim.ok ? "text-accent-text" : "text-danger-text"}>{detail.sim.ok ? "Không revert" : "Revert"}</dd>
          <dt className="text-muted">Két trả ra</dt>
          <dd className="tabular break-all">{formatTokenAmount(abs(detail.sim.deltaSafeTokenIn), intent.tokenIn, tokens)}</dd>
          <dt className="text-muted">Két nhận về</dt>
          <dd className="tabular break-all">{formatTokenAmount(abs(detail.sim.deltaSafeTokenOut), intent.tokenOut, tokens)}</dd>
          <dt className="text-muted">Quyền rút còn lại</dt>
          <dd className="tabular">{detail.sim.allowanceAfter === "0" ? "0" : "Còn (bị chặn)"}</dd>
        </dl>
      )}
    </div>
  );
}

/** "-200000000" -> "200000000"; amounts in deltas are signed base-unit strings. */
const abs = (signed: string) => (signed.startsWith("-") ? signed.slice(1) : signed);
