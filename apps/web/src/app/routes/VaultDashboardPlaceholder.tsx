import type { ReactNode } from "react";
import { ArrowUpRight, Construction } from "lucide-react";
import type { Address } from "viem";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { FUJI } from "@/shared/web3/config";
import { RedTeamPanel } from "@/features/red-team/RedTeamPanel";
import { shortAddress } from "@/shared/web3/walletStatus";

interface Slot {
  name: string;
  task: string;
  note: string;
  /**
   * `data-tour` anchor for the /demo guided tour (app/tour/tourSteps.ts). Keep the same value on
   * the real panel that replaces this slot, or the tour falls back to a centered card.
   */
  tour?: string;
  /** Real panel that replaced this placeholder; rendered instead of the dashed slot. */
  panel?: (props: { mode: "demo" | "owner"; safe: Address | null }) => ReactNode;
}

interface Column {
  id: string;
  index: string;
  title: string;
  slots: Slot[];
}

/** Layout of ui-pages §4.1. Each slot names the task that will fill it, so nothing here pretends to be live data. */
const COLUMNS: Column[] = [
  {
    id: "panel-owner",
    index: "01",
    title: "Chủ vault",
    slots: [
      { name: "Trạng thái policy", task: "L7", note: "Hạn mức mỗi lệnh, hạn mức ngày, hạn dùng: đọc thẳng từ contract.", tour: "policy" },
      { name: "Sửa policy", task: "L7", note: "Owner ký setPolicy ngay trong ví, không đi qua backend.", tour: "policy" },
      { name: "Kill-Switch", task: "L7", note: "Một giao dịch revoke ký trong ví, hiện thời gian khoá đo được.", tour: "kill-switch" },
      { name: "Nạp / rút tiền", task: "L8", note: "Chuyển token vào Safe hoặc rút về ví owner." },
    ],
  },
  {
    id: "panel-activity",
    index: "02",
    title: "Vault & hoạt động",
    slots: [
      { name: "Số dư trước / sau", task: "L8", note: "Số dư Safe trước và sau giao dịch gần nhất.", tour: "balances" },
      { name: "Hạn mức ngày đã dùng", task: "L8", note: "Đã tiêu / hạn mức ngày, lấy từ chain.", tour: "balances" },
      { name: "Dòng thời gian job", task: "Q9", note: "Shield 1 → Shield 2, thẻ giải thích, link Snowtrace.", tour: "activity" },
      { name: "Lịch sử job", task: "Q9", note: "Danh sách lệnh đã duyệt và bị chặn.", tour: "activity" },
    ],
  },
  {
    id: "panel-redteam",
    index: "03",
    title: "Red-team",
    slots: [
      {
        // The panel carries the redteam-rebalance and redteam-attacks tour anchors itself.
        name: "Red-team",
        task: "Q10",
        note: "Chạy rebalance, 4 đòn tấn công và ô prompt injection.",
        panel: ({ safe }) => <RedTeamPanel safe={safe} />,
      },
    ],
  },
];

interface VaultDashboardPlaceholderProps {
  mode: "demo" | "owner";
  /** Null for the public demo vault until its Fuji address exists (L4). */
  safe: Address | null;
}

/** Honest skeleton of the shared VaultDashboard (/demo = mode "demo", /vaults/:safe = mode "owner"). */
export function VaultDashboardPlaceholder({ mode, safe }: VaultDashboardPlaceholderProps) {
  const explorer = FUJI.blockExplorers.default.url;
  return (
    <>
      <section className="blueprint border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
          <div data-tour="vault-header">
            <Chamfer code={mode === "demo" ? "VAULT / DEMO" : "VAULT / OWNER"} ground="vault-header" innerClassName="p-5 pb-9 sm:p-8 sm:pb-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="mono-label">{mode === "demo" ? "Vault demo công khai · không cần ví" : "Dashboard vault"}</span>
                <Stamp tone="warn">Chưa nối dữ liệu</Stamp>
              </div>
              <h1 className="mt-4 text-4xl font-black leading-none sm:text-5xl">{mode === "demo" ? "Vault demo" : "Vault"}</h1>
              {safe ? (
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm" title={safe}>
                    <span className="hidden sm:inline">{safe}</span>
                    <span className="sm:hidden">{shortAddress(safe)}</span>
                  </span>
                  <a
                    href={`${explorer}/address/${safe}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline"
                  >
                    Snowtrace <ArrowUpRight aria-hidden className="size-4" />
                  </a>
                </p>
              ) : (
                <p className="mt-4 text-soft">Địa chỉ vault demo sẽ có sau khi deploy lên Avalanche Fuji.</p>
              )}
            </Chamfer>
          </div>

          <div className="mt-8 flex items-start gap-3 border border-on-accent bg-highlight p-4 text-on-accent">
            <Construction aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2.5} />
            <p className="font-bold">
              Trang đang được dựng. Chưa có số liệu nào ở đây: số dư, policy và lịch sử job sẽ hiện khi contract trên Fuji và API vault sẵn
              sàng.
              {mode === "demo" ? " Khách xem vault demo không cần kết nối ví." : " Nút của owner chỉ hiện khi ví kết nối là owner của Safe."}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.id} data-ground={col.id} className="border border-line bg-surface p-5 shadow-hard">
            <span className="mono-label">
              {col.index} · {col.title}
            </span>
            <ul className="mt-4 space-y-3">
              {col.slots.map((slot) =>
                slot.panel ? (
                  <li key={slot.name} data-tour={slot.tour}>
                    {slot.panel({ mode, safe })}
                  </li>
                ) : (
                  <li key={slot.name} data-tour={slot.tour} className="border border-dashed border-line-strong p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-bold">{slot.name}</span>
                      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Chưa nối · {slot.task}</span>
                    </div>
                    <p className="mt-1 text-sm text-soft">{slot.note}</p>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
