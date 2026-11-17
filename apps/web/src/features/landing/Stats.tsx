import { Link } from "react-router-dom";
import { testsNotRun, useProof } from "@/features/proof/proof";
import { Stamp } from "@/shared/ui/Stamp";
import { useCountUp } from "@/shared/lib/useCountUp";
import { useInView } from "@/shared/lib/useInView";

/** A number we do not have: shown as a dash, never as a made-up value. */
const UNKNOWN = "—";

export function Stats() {
  const view = useProof();
  const proof = view.status === "ready" ? view.proof : null;
  const [ref, seen] = useInView<HTMLDListElement>({ threshold: 0.4 });
  const ms = useCountUp(proof?.finality.avgMs ?? 0, 600, seen);
  const fuzz = useCountUp(proof?.tests.fuzzRuns ?? 0, 600, seen);
  const measured = !!proof && proof.finality.samples > 0;
  const tested = !!proof && !testsNotRun(proof.tests);
  const verified = !!proof && proof.contracts.length > 0 && proof.contracts.every((c) => c.verified);

  return (
    <section aria-label="Fuji proof" className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 pt-10 sm:px-6">
        <span className="mono-label">Measured on Fuji</span>
        {view.status === "offline" && <Stamp tone="warn">Server offline</Stamp>}
      </div>
      <dl ref={ref} className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
        <div className="border border-line p-5">
          <dt className="mono-label">Tx finality</dt>
          <dd className="tabular mt-2 text-3xl font-bold">{measured ? `${(ms / 1000).toFixed(1)}s` : UNKNOWN}</dd>
        </div>
        <div className="border border-line p-5">
          <dt className="mono-label">Fuzz runs</dt>
          <dd className="tabular mt-2 text-3xl font-bold">{tested ? fuzz.toLocaleString("en-US") : UNKNOWN}</dd>
        </div>
        <div className="border border-line p-5">
          <dt className="mono-label">Contracts verified</dt>
          <dd className="tabular mt-2 min-h-9 text-3xl font-bold">
            {seen && proof ? (
              <span className="inline-flex items-center gap-3">
                {verified ? "Yes" : "No"}
                <Stamp tone={verified ? "ok" : "warn"} animate>{verified ? "Verified" : "Check"}</Stamp>
              </span>
            ) : (
              <span aria-hidden className="text-muted">{UNKNOWN}</span>
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
