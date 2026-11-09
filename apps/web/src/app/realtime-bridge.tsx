import { useVaultEvents } from "@/shared/api";

/**
 * The single SSE connection for the vault on screen (web-dashboard skill: one EventSource).
 * Mount it once in the dashboard page; it renders nothing and keeps the query cache live.
 * Not mounted yet: the dashboard panels are still placeholders (L8, Q9 wire them).
 */
export function RealtimeBridge({ safe }: { safe: string }) {
  useVaultEvents(safe);
  return null;
}
