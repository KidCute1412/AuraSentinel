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

/** "14:03:27" in the viewer's time zone, 24-hour clock. "--:--:--" for a bad timestamp. Display only. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
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

/** Local calendar day of a timestamp, "2026-11-18". Groups lists by day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** "Today", "Yesterday", else "Mon, Nov 16" (en-US, viewer's time zone). Display only. */
export function dayLabel(iso: string, nowMs: number = Date.now()): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date(nowMs).toISOString())) return "Today";
  if (key === dayKey(new Date(nowMs - 86_400_000).toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Consecutive items of the same day, in the order given (lists arrive newest first). */
export function groupByDay<T extends { createdAt: string }>(items: readonly T[], nowMs: number = Date.now()): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(item.createdAt, nowMs), items: [item] });
  }
  return groups;
}
