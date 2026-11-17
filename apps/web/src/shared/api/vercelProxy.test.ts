// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, downstreamHeaders, PROXY_SECRET_HEADER, targetUrl, upstreamHeaders } from "../../../api/_proxy-core";

describe("Vercel proxy: where a request goes", () => {
  const req = (path: string, query = "") => `https://agentshield.vercel.app/api/proxy?__path=${path}${query}`;

  it("keeps the /api/v1 path and the original query", () => {
    expect(targetUrl("https://api.example.com", req("v1/vaults/0xabc/jobs", "&limit=1&status=confirmed"))).toBe("https://api.example.com/api/v1/vaults/0xabc/jobs?limit=1&status=confirmed");
    expect(targetUrl("https://api.example.com/", req("health"))).toBe("https://api.example.com/api/health");
  });

  it("refuses a missing or malformed API_ORIGIN, and paths that climb out of /api", () => {
    expect(targetUrl(undefined, req("v1/vaults"))).toBeNull();
    expect(targetUrl("api.example.com", req("v1/vaults"))).toBeNull();
    expect(targetUrl("https://api.example.com/base", req("v1/vaults"))).toBeNull();
    expect(targetUrl("https://api.example.com", req("v1/../../etc"))).toBeNull();
  });
});

describe("Vercel proxy: headers", () => {
  it("forwards the visitor IP with the shared secret, drops hop-by-hop and spoofed proxy headers", () => {
    const h = upstreamHeaders(
      new Headers({ cookie: "as_session=x", "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1", host: "agentshield.vercel.app", connection: "keep-alive", [CLIENT_IP_HEADER]: "1.2.3.4", [PROXY_SECRET_HEADER]: "guess" }),
      "s".repeat(32),
    );
    expect(h.get("cookie")).toBe("as_session=x");
    expect(h.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(h.get(PROXY_SECRET_HEADER)).toBe("s".repeat(32));
    expect(h.get("x-forwarded-proto")).toBe("https");
    expect(h.has("host")).toBe(false);
    expect(h.has("connection")).toBe(false);
  });

  it("without a configured secret it claims nothing about the client", () => {
    const h = upstreamHeaders(new Headers({ "x-forwarded-for": "203.0.113.7", [CLIENT_IP_HEADER]: "1.2.3.4" }), undefined);
    expect(h.has(CLIENT_IP_HEADER)).toBe(false);
    expect(h.has(PROXY_SECRET_HEADER)).toBe(false);
  });

  it("passes the session cookie back, minus encodings fetch already undid", () => {
    const h = downstreamHeaders(new Headers({ "set-cookie": "as_session=y; HttpOnly", "content-encoding": "gzip", "content-length": "10", "content-type": "text/event-stream" }));
    expect(h.get("set-cookie")).toContain("as_session=y");
    expect(h.get("content-type")).toBe("text/event-stream");
    expect(h.has("content-encoding")).toBe(false);
    expect(h.has("content-length")).toBe(false);
  });
});
