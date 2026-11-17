/**
 * Vercel Edge Function: /api/* on the web's own domain -> the AgentShield server (API_ORIGIN). Same origin for the
 * browser, so the SIWE session cookie and SSE work without CORS. Used only by live builds (VITE_DATA_SOURCE=live);
 * the mock build never calls /api. Env (Vercel project settings, server side, not in the bundle):
 *   API_ORIGIN         https://api.example.com   (no path, no trailing slash)
 *   WEB_PROXY_SECRET   same value as on the server, so it trusts the visitor IP this proxy forwards
 */
import { downstreamHeaders, targetUrl, upstreamHeaders } from "./_proxy-core";

export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

export default async function handler(req: Request): Promise<Response> {
  const target = targetUrl(process.env.API_ORIGIN, req.url);
  if (!target) {
    return new Response(
      JSON.stringify({ type: "/errors/api-not-configured", title: "The AgentShield server is not configured for this site", status: 503, code: "CHAIN_UNAVAILABLE", reason: null }),
      { status: 503, headers: { "content-type": "application/problem+json" } },
    );
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(target, {
    method: req.method,
    headers: upstreamHeaders(req.headers, process.env.WEB_PROXY_SECRET),
    body: hasBody ? req.body : undefined,
    redirect: "manual",
    // Needed to stream a request body; harmless otherwise.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
  // Streamed straight through, so SSE keeps flowing (the client reconnects or polls if the platform cuts it).
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: downstreamHeaders(upstream.headers) });
}
