import { useAccount } from "wagmi";
import { AppShell } from "@/app/layout/AppShell";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { FUJI } from "@/shared/web3/config";
import { WalletButton } from "@/shared/web3/WalletButton";
import { shortAddress, walletStatus } from "@/shared/web3/walletStatus";

const STEPS = [
  { n: "01", title: "Safe", note: "Create a new Safe or pick one your wallet owns." },
  { n: "02", title: "Module", note: "Deploy AgentPolicyModule and enable it on the Safe." },
  { n: "03", title: "Policy", note: "Set the per-transaction cap, daily cap and expiry, then sign setPolicy in your wallet." },
  { n: "04", title: "Fund", note: "Get MockUSDC from the faucet and send it to the Safe." },
] as const;

/** /vaults/new: wizard skeleton (L9). Shows the real wallet state; no step can run until the Fuji factory exists (L3, L4). */
export function NewVaultPage() {
  const { address, isConnected, chainId } = useAccount();
  const status = walletStatus({ isConnected, chainId, expectedChainId: FUJI.id });

  return (
    <AppShell label="App / New vault">
      <section className="blueprint border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
          <span className="mono-label">Wizard · 4 steps · under 3 minutes</span>
          <h1 className="mt-3 text-4xl font-black leading-none sm:text-5xl">Create your vault</h1>
          <p className="mt-4 max-w-2xl text-lg text-soft">
            Every step is a transaction you sign in your own wallet. Progress is read from the chain, so you can close the tab and pick up where you left off.
          </p>

          <Chamfer code="WALLET" ground="wizard-wallet" className="mt-8 max-w-2xl" innerClassName="p-5 pb-9 sm:p-6 sm:pb-10">
            {status === "disconnected" && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="font-bold">Connect a wallet (Core or MetaMask) to start.</p>
                <WalletButton />
              </div>
            )}
            {status === "wrong-network" && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">Your wallet is on the wrong network. Switch to Avalanche Fuji with the yellow bar above.</p>
                <Stamp tone="warn">Wrong network</Stamp>
              </div>
            )}
            {status === "ready" && address && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  <span className="font-bold">Wallet ready on Fuji: </span>
                  <span className="font-mono text-sm" title={address}>
                    {shortAddress(address)}
                  </span>
                </p>
                <Stamp tone="ok">Connected</Stamp>
              </div>
            )}
          </Chamfer>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black sm:text-3xl">Steps</h2>
          <Stamp tone="warn">Not open yet</Stamp>
        </div>
        <p className="mt-2 text-soft">The wizard opens once the factory and MockUSDC are deployed on Fuji.</p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} data-ground={`wizard-step-${step.n}`} className="border border-line bg-surface p-5 shadow-hard">
              <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted">Step {step.n}</span>
              <h3 className="mt-2 text-xl font-extrabold">{step.title}</h3>
              <p className="mt-2 text-sm text-soft">{step.note}</p>
              <button
                type="button"
                disabled
                className="mt-4 inline-flex h-10 items-center rounded-none border border-line-strong px-4 font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Not ready
              </button>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}
