import { useAccount } from "wagmi";
import { AppShell } from "@/app/layout/AppShell";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { FUJI } from "@/shared/web3/config";
import { WalletButton } from "@/shared/web3/WalletButton";
import { shortAddress, walletStatus } from "@/shared/web3/walletStatus";

const STEPS = [
  { n: "01", title: "Safe", note: "Tạo Safe mới hoặc chọn Safe mà ví của bạn là owner." },
  { n: "02", title: "Module", note: "Tạo AgentPolicyModule và bật nó trên Safe." },
  { n: "03", title: "Policy", note: "Đặt hạn mức mỗi lệnh, hạn mức ngày, hạn dùng; ký setPolicy trong ví." },
  { n: "04", title: "Nạp tiền", note: "Lấy MockUSDC từ faucet rồi chuyển vào Safe." },
] as const;

/** /vaults/new: wizard skeleton (L9). Shows the real wallet state; no step can run until the Fuji factory exists (L3, L4). */
export function NewVaultPage() {
  const { address, isConnected, chainId } = useAccount();
  const status = walletStatus({ isConnected, chainId, expectedChainId: FUJI.id });

  return (
    <AppShell label="App / Tạo vault">
      <section className="blueprint border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
          <span className="mono-label">Wizard · 4 bước · mục tiêu dưới 3 phút</span>
          <h1 className="mt-3 text-4xl font-black leading-none sm:text-5xl">Tạo vault của bạn</h1>
          <p className="mt-4 max-w-2xl text-lg text-soft">
            Mỗi bước là một giao dịch bạn tự ký trong ví. Tiến trình đọc từ chain, nên đóng tab mở lại vẫn tiếp tục được.
          </p>

          <Chamfer code="WALLET" ground="wizard-wallet" className="mt-8 max-w-2xl" innerClassName="p-5 pb-9 sm:p-6 sm:pb-10">
            {status === "disconnected" && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="font-bold">Kết nối ví (Core hoặc MetaMask) để bắt đầu.</p>
                <WalletButton />
              </div>
            )}
            {status === "wrong-network" && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">Ví đang ở sai mạng. Chuyển sang Avalanche Fuji bằng thanh vàng phía trên.</p>
                <Stamp tone="warn">Sai mạng</Stamp>
              </div>
            )}
            {status === "ready" && address && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  <span className="font-bold">Ví sẵn sàng trên Fuji: </span>
                  <span className="font-mono text-sm" title={address}>
                    {shortAddress(address)}
                  </span>
                </p>
                <Stamp tone="ok">Đã kết nối</Stamp>
              </div>
            )}
          </Chamfer>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black sm:text-3xl">Các bước</h2>
          <Stamp tone="warn">Chưa mở</Stamp>
        </div>
        <p className="mt-2 text-soft">Wizard sẽ mở khi factory và MockUSDC đã deploy lên Fuji.</p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} data-ground={`wizard-step-${step.n}`} className="border border-line bg-surface p-5 shadow-hard">
              <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted">Bước {step.n}</span>
              <h3 className="mt-2 text-xl font-extrabold">{step.title}</h3>
              <p className="mt-2 text-sm text-soft">{step.note}</p>
              <button
                type="button"
                disabled
                className="mt-4 inline-flex h-10 items-center rounded-none border border-line-strong px-4 font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Chưa sẵn sàng
              </button>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}
