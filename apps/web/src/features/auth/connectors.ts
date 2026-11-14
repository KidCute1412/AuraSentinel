import type { WalletId } from "./gateFlow";

/** The bits of a wagmi connector we match on (wagmi adds `rdns` for wallets announced through EIP-6963). */
export interface ConnectorLike {
  id: string;
  name: string;
  rdns?: string | readonly string[];
}

const rdnsOf = (c: ConnectorLike): string => (Array.isArray(c.rdns) ? c.rdns.join(",") : ((c.rdns as string | undefined) ?? "")).toLowerCase();

const MATCHERS: Record<WalletId, (c: ConnectorLike) => boolean> = {
  metamask: (c) => /metamask/i.test(c.name) || /metamask/i.test(c.id) || rdnsOf(c).includes("metamask"),
  core: (c) => /^core( wallet)?$/i.test(c.name.trim()) || /(^|\.)core(\.|$)/i.test(c.id) || rdnsOf(c).includes("app.core"),
};

/**
 * The connector for the wallet the visitor picked, or undefined when that wallet is not installed or not announced.
 * The generic `injected` connector never matches: it is whatever happens to own `window.ethereum`.
 */
export function findConnector<C extends ConnectorLike>(connectors: readonly C[], wallet: WalletId): C | undefined {
  return connectors.find((c) => c.id !== "injected" && MATCHERS[wallet](c));
}

/**
 * Connect `connector`, recovering from a connection that is still registered (a quick "use another wallet" then
 * the same wallet again): drop the stale one and connect once more. Any other error is passed on untouched.
 */
export async function connectFresh<C>(connect: (c: C) => Promise<unknown>, disconnect: (c: C) => Promise<unknown>, connector: C): Promise<void> {
  try {
    await connect(connector);
  } catch (e) {
    if (!(e instanceof Error) || e.name !== "ConnectorAlreadyConnectedError") throw e;
    await disconnect(connector);
    await connect(connector);
  }
}
