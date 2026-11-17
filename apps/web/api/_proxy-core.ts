/**
 * Pure parts of the Vercel proxy (api/proxy.ts). Files starting with "_" are not deployed as functions, so this one
 * can be unit-tested from src/ without becoming a route.
 */

/** Query key the vercel.json rewrite uses to pass the original path; unlikely to clash with a real query param. */
export const PATH_PARAM = "__path";

/** Header names the server checks (apps/server configure-api.ts). Keep both sides in sync. */
export const PROXY_SECRET_HEADER = "x-agentshield-proxy";
export const CLIENT_IP_HEADER = "x-agentshield-client-ip";

const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host", "content-length"];

/**
 * The server URL for one browser request: API_ORIGIN + /api/<path> + the original query (minus our own param).
 * null when API_ORIGIN is missing or not an http(s) origin, or the path tries to climb out of /api.
 */
export function targetUrl(apiOrigin: string | undefined, requestUrl: string): string | null {
  const origin = (apiOrigin ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(origin)) return null;
  const url = new URL(requestUrl);
  const path = (url.searchParams.get(PATH_PARAM) ?? "").replace(/^\/+/, "");
  if (path.split("/").some((seg) => seg === ".." || seg === ".")) return null;
  url.searchParams.delete(PATH_PARAM);
  const query = url.searchParams.toString();
  return `${origin}/api/${path}${query ? `?${query}` : ""}`;
}

/** Headers sent to the server: the browser's, minus hop-by-hop ones, plus who the client really is. */
export function upstreamHeaders(incoming: Headers, secret: string | undefined): Headers {
  const out = new Headers();
  incoming.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.includes(k) || k === PROXY_SECRET_HEADER || k === CLIENT_IP_HEADER) return;
    out.set(key, value);
  });
  // Vercel sets x-forwarded-for to the visitor's address; the first entry is the client.
  const client = (incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip") ?? "").split(",")[0]?.trim();
  if (secret && client) {
    out.set(PROXY_SECRET_HEADER, secret);
    out.set(CLIENT_IP_HEADER, client);
  }
  out.set("x-forwarded-proto", "https");
  return out;
}

/** Response headers back to the browser: everything (cookies included) except encodings fetch already undid. */
export function downstreamHeaders(upstream: Headers): Headers {
  const out = new Headers(upstream);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");
  return out;
}
