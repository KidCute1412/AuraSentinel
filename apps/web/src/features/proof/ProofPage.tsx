import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileCheck2, Gauge, ShieldAlert, TriangleAlert } from "lucide-react";
import { Header } from "@/shared/shell/Header";
import { Footer } from "@/shared/shell/Footer";
import { primaryCta } from "@/shared/ui/cta";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { Reveal } from "@/shared/ui/Reveal";
import { cn } from "@/shared/lib/cn";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";
import { usePageMood } from "@/shared/mascot/usePageMood";
import { formatUtc, seconds, shortHash, testsNotRun, useCountUp, useProof, type Proof } from "./proof";

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

/** What a hero tile shows when its number is not known: never a made-up value. */
const UNKNOWN = "—";

function Hero({ proof, offline }: { proof: Proof | null; offline: boolean }) {
  const fuzz = useCountUp(proof?.tests.fuzzRuns ?? 0);
  const notRun = proof ? testsNotRun(proof.tests) : true;
  const measured = !!proof && proof.finality.samples > 0;
  const missing = offline ? "needs the server, which is offline" : "loading";
  // "0 high, 0 medium, 4 low": the headline is the most severe count, the rest goes in the note so the tile never wraps.
  const slither = proof && proof.tests.slither !== "not run" ? proof.tests.slither.split(",").map((p) => p.trim()) : null;
  const slitherHead = slither?.[0] ?? null;
  const slitherRest = slither && slither.length > 1 ? slither.slice(1).join(" · ") : slither ? "" : null;
  return (
    <section className="blueprint relative overflow-hidden border-b border-line">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 lg:pt-28">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-label">PROOF / Avalanche Fuji · chain 43113</span>
          {offline && <Stamp tone="warn">Server offline</Stamp>}
        </div>
        <h1 className="mt-4 text-5xl font-black italic uppercase leading-[0.92] tracking-[-0.04em] sm:text-7xl">
          Don&apos;t trust us.
          <span className="outline-text block">Check the chain.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-soft">
          Every claim on this page can be re-checked: contract addresses, measured transaction finality, fuzz results and the
          real transactions the policy module reverted.
          {offline && " The server is offline: the contract addresses below come from the deployment record, and the measured numbers come back with the server."}
        </p>
        <dl className="mt-10 grid gap-5 md:grid-cols-3">
          <Tile
            label="Tx finality (avg)"
            value={measured ? seconds(proof.finality.avgMs) : UNKNOWN}
            note={measured ? `min ${seconds(proof.finality.minMs)} · max ${seconds(proof.finality.maxMs)} · ${proof.finality.samples} txs` : proof ? "no agent transaction measured yet" : missing}
            tone={measured ? "ok" : "neutral"}
          />
          <Tile
            label="Fuzz runs"
            value={proof && !notRun ? fuzz.toLocaleString("en-US") : UNKNOWN}
            note={!proof ? missing : notRun ? "contract test suite not run yet" : `${proof.tests.invariants.length} invariants · ${proof.tests.passed ? "all green" : "FAILING"}`}
            tone={proof && !notRun && proof.tests.passed ? "ok" : "neutral"}
          />
          <Tile label="Slither" value={slitherHead ?? UNKNOWN} note={!proof ? missing : slitherRest ? `${slitherRest} · static analysis` : "static analysis not run yet"} tone="neutral" />
        </dl>
      </div>
    </section>
  );
}

function Contracts({ contracts, offline }: { contracts: Proof["contracts"]; offline: boolean }) {
  return (
    <Chamfer code="CONTRACTS" innerClassName="p-0 pb-8">
      <ul className="divide-y divide-line">
        {contracts.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-bold">{c.name}</div>
              <div className="break-all font-mono text-xs text-soft">{c.address}</div>
            </div>
            <div className="flex items-center gap-3">
              {/* Offline, the server has not asked Snowtrace: say nothing rather than "unverified". */}
              {!offline && (c.verified ? <Stamp tone="ok">Verified</Stamp> : <Stamp tone="warn">Unverified</Stamp>)}
              {c.explorerUrl && (
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
  const { avgMs, minMs, maxMs, recentMs, samples } = proof.finality;
  const top = Math.max(maxMs, 1);
  if (samples === 0) {
    return (
      <Chamfer code="TX FINALITY" innerClassName="p-5 pb-10">
        <p className="text-soft">No agent transaction has been measured yet. Every rebalance on Fuji adds one sample here.</p>
      </Chamfer>
    );
  }
  return (
    <Chamfer code="TX FINALITY" innerClassName="p-5 pb-10">
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
          <div role="img" aria-label={`Last ${recentMs.length} transaction finality times in milliseconds: ${recentMs.join(", ")}`} className="relative flex h-40 items-end gap-2 border-b border-line-strong">
            <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-accent" style={{ bottom: `${(avgMs / top) * 100}%` }} />
            {recentMs.map((ms, i) => (
              <div key={i} className="flex h-full flex-1 items-end">
                <div className={cn("bar-grow w-full", ms === maxMs ? "bg-warn" : "bg-accent")} style={{ height: `${(ms / top) * 100}%`, animationDelay: `${i * 20}ms` }} title={`${ms} ms`} />
              </div>
            ))}
          </div>
          <figcaption className="mono-label mt-2">last {recentMs.length} agent transactions · dashed line = average</figcaption>
        </figure>
      ) : (
        <p className="mono-label mt-6">{proof.finality.samples} samples measured on-chain</p>
      )}
    </Chamfer>
  );
}

function Tests({ proof }: { proof: Proof }) {
  if (testsNotRun(proof.tests)) {
    return (
      <Chamfer code="TESTS" innerClassName="p-5 pb-10">
        <p className="text-soft">The contract test report has not been published to this server yet.</p>
      </Chamfer>
    );
  }
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

function Blocked({ proof }: { proof: Proof }) {
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
            {t.explorerUrl ? (
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

/** A section that needs the server: its own short line while loading or offline, never sample numbers. */
function NeedsServer({ code, offline }: { code: string; offline: boolean }) {
  return (
    <Chamfer code={code} innerClassName="p-5 pb-10">
      <p className="text-soft">{offline ? "Measured by the server, which is offline right now. Reload once it is back." : "Loading…"}</p>
    </Chamfer>
  );
}

export function ProofPage() {
  const view = useProof();
  const proof = view.status === "ready" ? view.proof : null;
  const offline = view.status === "offline";
  const contracts = view.status === "ready" ? view.proof.contracts : view.status === "offline" ? view.contracts : null;
  useEffect(() => {
    react("guard", { text: LINES.proof, hold: 2200, passive: true });
  }, []);
  usePageMood("proof-contracts", "inspect", LINES.inspect);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <Hero proof={proof} offline={offline} />
      <Section id="proof-contracts" index="01" label="Contracts" title="Deployed. Verified. Public." intro="The four contracts that hold and guard the demo vault. Open each on the explorer and read the source yourself.">
        {contracts ? <Contracts contracts={contracts} offline={offline} /> : <NeedsServer code="CONTRACTS" offline={false} />}
      </Section>
      <Section index="02" label="Finality" title="Measured on-chain, not promised." intro="Send to receipt for the agent's own transactions on Fuji, measured by the server on every job. A Kill-Switch is one transaction on the same chain, and the dashboard shows each kill's own measured time.">
        {proof ? <Finality proof={proof} /> : <NeedsServer code="TX FINALITY" offline={offline} />}
      </Section>
      <Section index="03" label="Tests" title="Thousands of tries to break the lock." intro="Foundry fuzzing and invariant runs throw random inputs and random call sequences at the policy module and check that every rule holds, every time.">
        {proof ? <Tests proof={proof} /> : <NeedsServer code="TESTS" offline={offline} />}
      </Section>
      <Section index="04" label="Blocked" title="Real attacks, reverted by the chain." intro="Transactions that bypassed the web app entirely and hit the contract directly. The on-chain policy cancelled each one.">
        {proof ? <Blocked proof={proof} /> : <NeedsServer code="BLOCKED" offline={offline} />}
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
