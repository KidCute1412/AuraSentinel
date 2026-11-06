import { identicon } from "./gateFlow";

/** Pixel identity badge derived from the wallet address. */
export function Identicon({ address, size = 64 }: { address: string; size?: number }) {
  const rows = identicon(address);
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" role="img" aria-label="Wallet identicon" className="shrink-0 border-2 border-[var(--shadow-color)] bg-tint-mint">
      {rows.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x * 10} y={y * 10} width="10" height="10" fill="var(--accent)" stroke="var(--shadow-color)" strokeWidth="1" /> : null)))}
    </svg>
  );
}
