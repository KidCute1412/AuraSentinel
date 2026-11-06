import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileCheck2, Gauge, ShieldAlert, TriangleAlert } from "lucide-react";
import { Header } from "@/features/landing/Header";
import { Footer } from "@/features/landing/Footer";
import { primaryCta } from "@/features/landing/cta";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { Reveal } from "@/shared/ui/Reveal";
import { cn } from "@/shared/lib/cn";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";
import { usePageMood } from "@/shared/mascot/usePageMood";
import { formatUtc, seconds, shortHash, useCountUp, useProof, type Proof } from "./proof";

function Section({ id, index, label, title, intro, children }: { id?: string; index: string; label: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <span className="mono-label">{index} · {label}</span>
          <h2 className="mt-2 text-3xl md:text-4xl">{title}</h2>
          <p className="mt-4 text-soft">{intro}</p>
        </div>
        <Reveal className="min-w-0 lg:col-span-8">{children}</Reveal>
      </div>
    </section>
  );
}

function Tile({ label, value, note, tone = "ok" }: { label: string; value: string; note: string; tone?: "ok" | "neutral" }) {
  return (
    <Chamfer tilt edge={tone === "ok" ? "bg-accent" : "bg-line-strong"} fill={tone === "ok" ? "bg-tint-mint" : "bg-surface"} innerClassName="p-5">
      <dt className="mono-label">{label}</dt>
      <dd className="tabular mt-2 text-4xl font-bold sm:text-5xl">{value}</dd>
      <p className="mt-2 text-sm text-soft">{note}</p>
    </Chamfer>
  );
}

function Hero({ proof, sample }: { proof: Proof; sample: boolean }) {
  const fuzz = useCountUp(proof.tests.fuzzRuns);
  return (
    <section className="blueprint relative overflow-hidden border-b border-line">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 lg:pt-28">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-label">PROOF / {proof.network.name} · chain {proof.network.chainId}</span>
          {sample && <Stamp tone="warn">Sample data</Stamp>}
        </div>
        <h1 className="mt-4 text-5xl font-black italic uppercase leading-[0.92] tracking-[-0.04em] sm:text-7xl">
          Don&apos;t trust us.
          <span className="outline-text block">Check the chain.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-soft">
          Every claim on this page can be re-checked: contract addresses, measured Kill-Switch time, fuzz results and the real
          transactions the policy module reverted.
          {sample && " The live feed is offline, so the numbers below are illustrative samples."}
        </p>
        <dl className="mt-10 grid gap-5 md:grid-cols-3">
          <Tile label="Kill finality (avg)" value={seconds(proof.finality.avgMs)} note={`min ${seconds(proof.finality.minMs)} · max ${seconds(proof.finality.maxMs)}`} />
          <Tile label="Fuzz runs" value={fuzz.toLocaleString("en-US")} note={`${proof.tests.invariants.length} invariants · ${proof.tests.passed ? "all green" : "FAILING"}`} />
          <Tile label="Slither" value={proof.tests.slither} note="static analysis summary" tone="neutral" />
        </dl>
      </div>
    </section>
  );
}

function Contracts({ proof, sample }: { proof: Proof; sample: boolean }) {
  return (
    <Chamfer code="CONTRACTS" innerClassName="p-0 pb-8">
      <ul className="divide-y divide-line">
        {proof.contracts.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-bold">{c.name}</div>
              <div className="break-all font-mono text-xs text-soft">{c.address}</div>
            </div>
            <div className="flex items-center gap-3">
              {c.verified ? <Stamp tone="ok">Verified</Stamp> : <Stamp tone="warn">Unverified</Stamp>}
              {!sample && c.explorerUrl && (
                <a href={c.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-accent-text hover:underline">
                  Snowtrace <ArrowUpRight aria-hidden className="size-3" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Chamfer>
  );
}

function Finality({ proof }: { proof: Proof }) {
  const { avgMs, minMs, maxMs, recentMs } = proof.finality;
  const top = Math.max(maxMs, 1);
  return (
    <Chamfer code="KILL-SWITCH LATENCY" innerClassName="p-5 pb-10">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {[["min", minMs], ["avg", avgMs], ["max", maxMs]].map(([k, v]) => (
          <div key={k as string}>
            <div className="mono-label">{k}</div>
            <div className="tabular text-2xl font-bold">{seconds(v as number)}</div>
          </div>
        ))}
      </div>
      {recentMs && recentMs.length > 0 ? (
        <figure className="mt-6">
          <div role="img" aria-label={`Last ${recentMs.length} Kill-Switch times in milliseconds: ${recentMs.join(", ")}`} className="relative flex h-40 items-end gap-2 border-b border-line-strong">
            <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-accent" style={{ bottom: `${(avgMs / top) * 100}%` }} />
            {recentMs.map((ms, i) => (
              <div key={i} className="flex h-full flex-1 items-end">
                <div className={cn("bar-grow w-full", ms === maxMs ? "bg-warn" : "bg-accent")} style={{ height: `${(ms / top) * 100}%`, animationDelay: `${i * 20}ms` }} title={`${ms} ms`} />
              </div>
            ))}
          </div>
          <figcaption className="mono-label mt-2">last {recentMs.length} kills · dashed line = average</figcaption>
        </figure>
      ) : (
        <p className="mono-label mt-6">{proof.finality.samples} samples measured on-chain</p>
      )}
    </Chamfer>
  );
}

function Tests({ proof }: { proof: Proof }) {
  return (
    <Chamfer code="TESTS" innerClassName="p-5 pb-10">
      <div className="flex flex-wrap items-center gap-4">
        <span className="tabular text-3xl font-bold">{proof.tests.fuzzRuns.toLocaleString("en-US")}</span>
        <span className="mono-label">fuzz runs per invariant</span>
        <Stamp tone={proof.tests.passed ? "ok" : "danger"}>{proof.tests.passed ? "Passing" : "Failing"}</Stamp>
      </div>
      <ul className="mt-5 grid gap-2">
        {proof.tests.invariants.map((name) => (
          <li key={name} className="flex items-center gap-3 border border-line p-3">
            <FileCheck2 aria-hidden className="size-4 shrink-0 text-accent-text" />
            <code className="font-mono text-sm">{name}</code>
          </li>
        ))}
      </ul>
      <p className="mono-label mt-4">slither: {proof.tests.slither}</p>
    </Chamfer>
  );
}

function Blocked({ proof, sample }: { proof: Proof; sample: boolean }) {
  if (proof.blockedTxs.length === 0) {
    return <Chamfer code="BLOCKED" innerClassName="p-5 pb-10"><p className="text-soft">No reverted attacks recorded yet. Run the red-team demo to create some.</p></Chamfer>;
  }
  return (
    <Chamfer edge="bg-danger" fill="bg-tint-pink" code="REVERTED ON-CHAIN" innerClassName="p-0 pb-8">
      <ul className="divide-y divide-line">
        {proof.blockedTxs.map((t) => (
          <li key={t.txHash} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <ShieldAlert aria-hidden className="size-5 shrink-0 text-danger-text" />
              <div>
                <code className="font-mono text-sm font-bold text-danger-text">{t.error}</code>
                <div className="font-mono text-xs text-soft">{formatUtc(t.at)}</div>
              </div>
            </div>
            {!sample && t.explorerUrl ? (
              <a href={t.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest hover:underline">
                {shortHash(t.txHash)} <ArrowUpRight aria-hidden className="size-3" />
              </a>
            ) : (
              <span className="font-mono text-xs text-soft">{shortHash(t.txHash)}</span>
            )}
          </li>
        ))}
      </ul>
    </Chamfer>
  );
}

const LIMITS = [
  "The per-tx cap is measured in input token units (USDC), not in value received.",
  "minOut is supplied by the agent. A manipulated pool can still deliver less than expected. Chainlink oracle is the planned fix.",
  "Testnet only: Avalanche Fuji with free faucet tokens. Not audited for mainnet.",
];

function Limits() {
  return (
    <Chamfer edge="bg-warn" fill="bg-tint-amber" code="KNOWN LIMITS" innerClassName="p-5 pb-10">
      <ul className="grid gap-3">
        {LIMITS.map((l) => (
          <li key={l} className="flex gap-3">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
            <span className="text-soft">{l}</span>
          </li>
        ))}
      </ul>
    </Chamfer>
  );
}

export function ProofPage() {
  const { proof, sample } = useProof();
  useEffect(() => {
    react("guard", { text: LINES.proof, hold: 2200, passive: true });
  }, []);
  usePageMood("proof-contracts", "inspect", LINES.inspect);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <Hero proof={proof} sample={sample} />
      <Section id="proof-contracts" index="01" label="Contracts" title="Deployed. Verified. Public." intro="The four addresses that hold and guard the demo vault. Open each on the explorer and read the source yourself.">
        <Contracts proof={proof} sample={sample} />
      </Section>
      <Section index="02" label="Finality" title="Kill-Switch in about a second and a half." intro="Measured from the owner's click to the session key being revoked on-chain. Faster than an attacker can drain a vault on a slow chain.">
        <Finality proof={proof} />
      </Section>
      <Section index="03" label="Tests" title="10,000 tries to break the lock." intro="Foundry fuzzing throws random inputs at the policy module and asserts three invariants hold every single time.">
        <Tests proof={proof} />
      </Section>
      <Section index="04" label="Blocked" title="Real attacks, reverted by the chain." intro="Transactions that bypassed the web app entirely and hit the contract directly. The on-chain policy cancelled each one.">
        <Blocked proof={proof} sample={sample} />
      </Section>
      <Section index="05" label="Honesty" title="What this does not do." intro="Security claims without limits are marketing. These are ours.">
        <Limits />
      </Section>
      <section className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
          <div className="flex items-center gap-3">
            <Gauge aria-hidden className="size-6 text-accent-text" />
            <p className="text-xl font-bold">Seen enough? Try to rob it yourself.</p>
          </div>
          <span className="drop-hard"><Link to="/demo" className={primaryCta}>Open the demo</Link></span>
        </div>
      </section>
      <Footer />
    </div>
  );
}
