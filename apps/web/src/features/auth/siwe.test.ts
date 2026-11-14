import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api";
import { buildSiweMessage, signInFailure } from "./siwe";

const ADDRESS = "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02" as const;

describe("buildSiweMessage", () => {
  it("is a valid Fuji EIP-4361 message for this origin, with the nonce the server issued", () => {
    const now = new Date();
    const parsed = parseSiweMessage(buildSiweMessage(ADDRESS, "abcdefgh12345678", now));
    expect(parsed.address?.toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(parsed.chainId).toBe(43113);
    expect(parsed.nonce).toBe("abcdefgh12345678");
    expect(parsed.domain).toBe(window.location.host);
    expect(validateSiweMessage({ message: parsed, time: now })).toBe(true);
  });
});

describe("signInFailure", () => {
  it("treats a refused wallet popup as a refusal, not an error", () => {
    const e = new Error("User rejected the request.");
    e.name = "UserRejectedRequestError";
    expect(signInFailure(e).refused).toBe(true);
  });

  it("passes the server's reason through", () => {
    const e = new ApiError({ status: 401, code: "UNAUTHENTICATED", problem: { type: "x", title: "Sign-in failed", status: 401, code: "UNAUTHENTICATED", detail: "Unknown or already used nonce" } as never });
    expect(signInFailure(e)).toEqual({ refused: false, message: "Unknown or already used nonce" });
  });
});
