import { AVALANCHE_FUJI_CHAIN_ID, type Address, type SessionDto } from "@agentshield/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";
import { useSignMessage } from "wagmi";
import { ApiError, createSession, queryKeys, requestNonce } from "@/shared/api";

export const SIWE_STATEMENT = "Sign in to AgentShield. This does not move funds.";
const VALID_FOR_MS = 5 * 60_000;

/** EIP-4361 message for the connected wallet. The server checks domain, chain, validity window and the single-use nonce. */
export function buildSiweMessage(address: Address, nonce: string, now = new Date()): string {
  return createSiweMessage({
    address,
    chainId: AVALANCHE_FUJI_CHAIN_ID,
    domain: window.location.host,
    uri: window.location.origin,
    version: "1",
    statement: SIWE_STATEMENT,
    nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + VALID_FOR_MS),
  });
}

/** The wallet forgot (or never granted) this site's permission although wagmi still shows it as connected. */
export function needsReconnect(e: unknown): boolean {
  const name = e instanceof Error ? e.name : "";
  return name === "UnauthorizedProviderError" || name === "ConnectorNotConnectedError" || name === "ConnectorAccountNotFoundError";
}

/** User-facing reason for a failed sign-in. A refused wallet popup is not an error worth shouting about. */
export function signInFailure(e: unknown, stage: "connect" | "sign" = "sign"): { refused: boolean; message: string } {
  if (e instanceof ApiError) return { refused: false, message: e.message };
  const name = e instanceof Error ? e.name : "";
  const text = e instanceof Error ? e.message : "";
  if (name === "UserRejectedRequestError" || /user (rejected|denied)/i.test(text)) {
    return { refused: true, message: "Nothing was signed. No funds moved." };
  }
  if (needsReconnect(e)) return { refused: false, message: "The wallet no longer allows this site. Connect it again, then sign." };
  console.error("[siwe] sign-in failed", e);
  const reason = (e as { shortMessage?: string } | null)?.shortMessage ?? text;
  const what = stage === "connect" ? "Could not connect the wallet" : "Could not sign in";
  const detail = [reason, name && `(${name})`].filter(Boolean).join(" ");
  return { refused: false, message: detail ? `${what}: ${detail}` : `${what}. Try again.` };
}

/** Nonce -> wallet signature -> POST /auth/session. Resolves with the session the server created (cookie set). */
export function useSiweSignIn(): (address: Address) => Promise<SessionDto> {
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  return async (address) => {
    const { nonce } = await requestNonce();
    const message = buildSiweMessage(address, nonce);
    const signature = await signMessageAsync({ message });
    const session = await createSession({ message, signature });
    qc.setQueryData(queryKeys.session, session);
    return session;
  };
}
