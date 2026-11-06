const CELLS = [
  { label: "Status", value: "Protected", live: true },
  { label: "Funds lost", value: "0" },
  { label: "Kill-Switch", value: "Armed · ~1.5s" },
  { label: "Owner key", value: "Not on server" },
] as const;

/** Calm, static security readout under the hero. Replaces the old scrolling ticker. */
export function StatusStrip() {
  return (
    <section aria-label="Security status" className="border-b border-line bg-bg" data-ground="status-strip">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px border-x border-line bg-line md:grid-cols-4">
        {CELLS.map((c) => (
          <div key={c.label} className="bg-bg px-5 py-4 sm:px-6">
            <dt className="mono-label">{c.label}</dt>
            <dd className="mt-1 flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-widest text-accent-text">
              {"live" in c && c.live && <span aria-hidden className="size-2 animate-pulse bg-accent motion-reduce:animate-none" />}
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
