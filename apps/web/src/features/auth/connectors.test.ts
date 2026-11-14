import { describe, expect, it } from "vitest";
import { connectFresh, findConnector } from "./connectors";

const list = [
  { id: "injected", name: "Injected" },
  { id: "io.metamask", name: "MetaMask", rdns: "io.metamask" },
  { id: "app.core.extension", name: "Core", rdns: "app.core.extension" },
  { id: "com.coinbase.wallet", name: "Coinbase Wallet", rdns: "com.coinbase.wallet" },
];

describe("findConnector", () => {
  it("picks the connector of the wallet the visitor chose", () => {
    expect(findConnector(list, "metamask")?.id).toBe("io.metamask");
    expect(findConnector(list, "core")?.id).toBe("app.core.extension");
  });

  it("returns undefined when that wallet is not installed, never the generic injected one", () => {
    expect(findConnector([{ id: "injected", name: "Injected" }], "metamask")).toBeUndefined();
    expect(findConnector(list.filter((c) => c.id !== "app.core.extension"), "core")).toBeUndefined();
  });

  it("does not mistake Coinbase for Core", () => {
    expect(findConnector([{ id: "com.coinbase.wallet", name: "Coinbase Wallet" }], "core")).toBeUndefined();
  });
});

describe("connectFresh", () => {
  const already = Object.assign(new Error("Connector already connected."), { name: "ConnectorAlreadyConnectedError" });

  it("connects once when nothing is in the way", async () => {
    const calls: string[] = [];
    await connectFresh(async () => void calls.push("connect"), async () => void calls.push("disconnect"), "mm");
    expect(calls).toEqual(["connect"]);
  });

  it("drops a stale connection and connects again", async () => {
    const calls: string[] = [];
    let first = true;
    await connectFresh(
      async () => {
        calls.push("connect");
        if (first) {
          first = false;
          throw already;
        }
      },
      async () => void calls.push("disconnect"),
      "mm",
    );
    expect(calls).toEqual(["connect", "disconnect", "connect"]);
  });

  it("passes any other error on, including a refusal", async () => {
    const refusal = Object.assign(new Error("denied"), { name: "UserRejectedRequestError" });
    await expect(connectFresh(async () => Promise.reject(refusal), async () => undefined, "mm")).rejects.toBe(refusal);
  });
});
