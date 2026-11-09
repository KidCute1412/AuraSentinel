/** "just now", "5 min ago", "2 h ago", "3 d ago". Display only. */
export function timeAgo(iso: string, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** "29 days", "5 h", "12 min", "expired". Used for policy expiry. */
export function timeLeft(expirySec: number, nowSec: number): string {
  const s = expirySec - nowSec;
  if (s <= 0) return "expired";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86_400) return `${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86_400);
  return `${d} day${d === 1 ? "" : "s"}`;
}
