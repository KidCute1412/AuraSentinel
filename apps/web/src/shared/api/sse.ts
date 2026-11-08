import { ServerEvent } from "@agentshield/shared";
import { vaultEventsUrl } from "./endpoints";

export type SseStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface Backoff {
  initialMs: number;
  maxMs: number;
}

export const DEFAULT_BACKOFF: Backoff = { initialMs: 1_000, maxMs: 30_000 };

/** Delay before reconnect attempt `attempt` (0-based): 1s, 2s, 4s … capped. */
export const backoffDelay = (attempt: number, b: Backoff = DEFAULT_BACKOFF): number =>
  Math.min(b.maxMs, b.initialMs * 2 ** Math.min(attempt, 20));

function drop(why: string, raw: unknown): null {
  if (import.meta.env.DEV) console.warn(`[sse] dropped event: ${why}`, raw);
  return null;
}

/**
 * Parses one SSE `data:` payload. Anything that is not valid JSON, fails the shared
 * `ServerEvent` schema, or belongs to another vault is dropped (null), never thrown.
 */
export function parseServerEvent(raw: string, safe: string): ServerEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return drop("not JSON", raw);
  }
  const parsed = ServerEvent.safeParse(json);
  if (!parsed.success) return drop("schema mismatch", json);
  if (parsed.data.vault.toLowerCase() !== safe.toLowerCase()) return drop("other vault", json);
  return parsed.data;
}

export interface VaultEventsHandlers {
  onEvent: (event: ServerEvent) => void;
  /** Every successful open. `reconnect` is false only for the first one. Refetch snapshots here. */
  onOpen?: (info: { reconnect: boolean }) => void;
  onStatus?: (status: SseStatus) => void;
  backoff?: Backoff;
}

/**
 * One EventSource per vault (api.md #13). Reconnects with exponential backoff that resets after
 * a successful open. Delivery is not guaranteed, so callers must refetch `/state` and `/jobs` in
 * `onOpen` (snapshot + stream). Returns a function that closes the stream for good.
 */
export function connectVaultEvents(safe: string, handlers: VaultEventsHandlers): () => void {
  const { onEvent, onOpen, onStatus, backoff = DEFAULT_BACKOFF } = handlers;
  if (typeof EventSource === "undefined") {
    onStatus?.("closed");
    return () => {};
  }

  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let everOpened = false;
  let closed = false;

  const connect = () => {
    onStatus?.(everOpened || attempt > 0 ? "reconnecting" : "connecting");
    const es = new EventSource(vaultEventsUrl(safe), { withCredentials: true });
    source = es;

    es.onopen = () => {
      if (closed) return;
      attempt = 0;
      const reconnect = everOpened;
      everOpened = true;
      onStatus?.("open");
      onOpen?.({ reconnect });
    };

    es.onmessage = (msg: MessageEvent) => {
      if (closed) return;
      const event = parseServerEvent(String(msg.data), safe);
      if (event) onEvent(event);
    };

    es.onerror = () => {
      if (closed) return;
      // Take over from the browser's own retry so the delay is predictable and capped.
      es.close();
      source = null;
      onStatus?.("reconnecting");
      timer = setTimeout(connect, backoffDelay(attempt, backoff));
      attempt += 1;
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    source?.close();
    source = null;
    onStatus?.("closed");
  };
}
