import { describe, expect, it } from "vitest";
import { FUJI, hasWalletConnect, wagmiConfig } from "./config";

describe("wagmi config", () => {
  // Regression guard: with no WalletConnect projectId and no injected wallet (this jsdom),
  // RainbowKit's MetaMask/Core factories would throw at import time and blank the whole app.
  it("builds for Fuji only, without env vars or an injected wallet", () => {
    expect(FUJI.id).toBe(43113);
    expect(wagmiConfig.chains.map((c) => c.id)).toEqual([43113]);
    expect(wagmiConfig.connectors.length).toBeGreaterThan(0);
    if (!hasWalletConnect) {
      expect(wagmiConfig.connectors.some((c) => c.id === "walletConnect")).toBe(false);
    }
  });
});
