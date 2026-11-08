import { Link, useParams } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { primaryCta, secondaryCta } from "@/features/landing/cta";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { parseSafeParam } from "@/shared/web3/walletStatus";
import { VaultDashboardPlaceholder } from "./VaultDashboardPlaceholder";

/** /vaults/:safe: any vault, read-only for guests; owner controls appear for the Safe owner (L7, L8). */
export function VaultPage() {
  const { safe: raw } = useParams();
  const safe = parseSafeParam(raw);

  if (!safe) {
    return (
      <AppShell label="App / Vault">
        <section className="blueprint border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Chamfer edge="bg-danger" code="ERR-ADDRESS" ground="vault-invalid" className="mx-auto max-w-3xl" innerClassName="p-6 pb-10 sm:p-10 sm:pb-12">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="mono-label">Status: invalid address</span>
                <Stamp tone="danger">Không hợp lệ</Stamp>
              </div>
              <h1 className="mt-6 text-3xl font-black sm:text-4xl">Địa chỉ vault không hợp lệ</h1>
              <p className="mt-3 text-soft">
                <code className="break-all bg-hover px-1.5 py-0.5 font-mono text-sm text-fg">{raw}</code> không phải địa chỉ ví (cần dạng
                0x và 40 ký tự hex). Kiểm tra lại đường dẫn.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <span className="drop-hard">
                  <Link to="/demo" className={primaryCta}>
                    Xem vault demo
                  </Link>
                </span>
                <span className="drop-hard">
                  <Link to="/" className={secondaryCta}>
                    Về trang chủ
                  </Link>
                </span>
              </div>
            </Chamfer>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell label="App / Vault">
      <VaultDashboardPlaceholder mode="owner" safe={safe} />
    </AppShell>
  );
}
