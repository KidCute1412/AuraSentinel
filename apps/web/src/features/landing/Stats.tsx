import { Link } from "react-router-dom";
import { useProof } from "@/features/proof/proof";
import { Stamp } from "@/shared/ui/Stamp";
import { useCountUp } from "@/shared/lib/useCountUp";
import { useInView } from "@/shared/lib/useInView";

export function Stats() {
  const { proof, sample } = useProof();
  const [ref, seen] = useInView<HTMLDListElement>({ threshold: 0.4 });
  const ms = useCountUp(proof.finality.avgMs, 600, seen);
  const fuzz = useCountUp(proof.tests.fuzzRuns, 600, seen);
  const verified = proof.contracts.every((c) => c.verified);

  return (
    <section aria-label="Fuji proof" className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 pt-10 sm:px-6">
        <span className="mono-label">Measured on Fuji</span>
        {sample && <Stamp tone="warn">Sample data</Stamp>}
      </div>
      <dl ref={ref} className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
        <div className="border border-line p-5">
          <dt className="mono-label">Kill finality</dt>
          <dd className="tabular mt-2 text-3xl font-bold">{(ms / 1000).toFixed(1)}s</dd>
        </div>
        <div className="border border-line p-5">
          <dt className="mono-label">Fuzz runs</dt>
          <dd className="tabular mt-2 text-3xl font-bold">{fuzz.toLocaleString("en-US")}</dd>
        </div>
        <div className="border border-line p-5">
          <dt className="mono-label">Contracts verified</dt>
          <dd className="tabular mt-2 min-h-9 text-3xl font-bold">
            {seen ? (
              <span className="inline-flex items-center gap-3">
                {verified ? "Yes" : "No"}
                <Stamp tone={verified ? "ok" : "warn"} animate>{verified ? "Verified" : "Check"}</Stamp>
              </span>
            ) : (
              <span aria-hidden className="text-muted">--</span>
            )}
          </dd>
        </div>
      </dl>
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <Link to="/proof" className="font-mono text-xs uppercase tracking-widest text-accent-text hover:underline">See the full proof</Link>
      </div>
    </section>
  );
}
