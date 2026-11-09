import { describe, expect, it } from "vitest";
import { parseSafeParam, shortAddress, walletStatus } from "./walletStatus";

const FUJI_ID = 43113;

describe("walletStatus", () => {
  it("is disconnected without a wallet, whatever the chain", () => {
    expect(walletStatus({ isConnected: false, chainId: FUJI_ID, expectedChainId: FUJI_ID })).toBe("disconnected");
    expect(walletStatus({ isConnected: false, chainId: undefined, expectedChainId: FUJI_ID })).toBe("disconnected");
  });
  it("is ready only on Fuji", () => {
    expect(walletStatus({ isConnected: true, chainId: FUJI_ID, expectedChainId: FUJI_ID })).toBe("ready");
  });
  it("flags any other chain (mainnet C-Chain, Ethereum, unknown)", () => {
    for (const chainId of [43114, 1, undefined]) {
      expect(walletStatus({ isConnected: true, chainId, expectedChainId: FUJI_ID })).toBe("wrong-network");
    }
  });
});

describe("parseSafeParam", () => {
  it("accepts lowercase and returns the checksummed form", () => {
    expect(parseSafeParam("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  });
  it("rejects garbage, short hex and missing params", () => {
    for (const bad of [undefined, "", "0x123", "not-an-address", "0x" + "g".repeat(40)]) {
      expect(parseSafeParam(bad)).toBeNull();
    }
  });
});

describe("shortAddress", () => {
  it("keeps the head and tail", () => {
    expect(shortAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe("0x5aAe…eAed");
  });
});
