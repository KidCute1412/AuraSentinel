import { useQuery } from "@tanstack/react-query";

interface Proof {
  finalityMs?: number;
  fuzzRuns?: number;
  verified?: boolean;
}

async function fetchProof(): Promise<Proof> {
  const res = await fetch("/api/proof");
  if (!res.ok) throw new Error(`proof ${res.status}`);
  return (await res.json()) as Proof;
}

export function Stats() {
  const { data } = useQuery({ queryKey: ["proof"], queryFn: fetchProof });
  // Loading or error: hide the strip, never block the page.
  if (!data) return null;

  const items = [
    data.finalityMs != null && { label: "Kill finality", value: `${(data.finalityMs / 1000).toFixed(1)}s` },
    data.fuzzRuns != null && { label: "Fuzz runs", value: data.fuzzRuns.toLocaleString("en-US") },
    data.verified != null && { label: "Contract verified", value: data.verified ? "Yes" : "No" },
  ].filter((i): i is { label: string; value: string } => Boolean(i));
  if (items.length === 0) return null;

  return (
    <section aria-label="Fuji proof" className="border-b border-line bg-surface">
      <dl className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:px-6 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="border border-line p-5">
            <dt className="mono-label">{i.label}</dt>
            <dd className="tabular mt-2 text-3xl font-bold">{i.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
