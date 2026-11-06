const ITEMS = [
  "0xHACKER · BLOCKED",
  "FUNDS LOST: 0",
  "UNLIMITED APPROVAL · DENIED",
  "KILL-SWITCH: ARMED",
  "RUG ATTEMPT · REVERTED",
  "AGENT HAS NO OWNER KEY",
];

export function Ticker() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="overflow-hidden border-b border-line bg-accent text-on-accent" data-ground="ticker" aria-hidden>
      <div className="animate-marquee flex w-max whitespace-nowrap py-2 font-mono text-xs font-bold uppercase tracking-widest">
        {[0, 1].map((k) => (
          <div key={k} className="flex">
            {row.map((t, i) => (
              <span key={i} className="px-6">{t} <span className="px-6">✕</span></span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
