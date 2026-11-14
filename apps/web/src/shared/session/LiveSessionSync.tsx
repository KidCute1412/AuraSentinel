import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useDisconnectAll } from "@/shared/web3/useDisconnectAll";
import { deleteSession, queryKeys, useSession as useServerSession } from "@/shared/api";
import { useSession } from "./sessionStore";

/**
 * Live mode only. Keeps the in-memory wallet snapshot in step with the SIWE cookie and the wallet:
 * - on load, a valid cookie restores the wallet snapshot (no second signature after a refresh);
 * - the wallet switching to another account, or being disconnected, ends the server session so the
 *   cookie never speaks for an address the visitor no longer controls.
 * A wallet that has not reconnected yet (locked extension) keeps the cookie: only a real change signs out.
 */
export function LiveSessionSync() {
  const qc = useQueryClient();
  const { data } = useServerSession();
  const { address, status, chainId } = useAccount();
  const disconnectWallet = useDisconnectAll();
  const connect = useSession((s) => s.connect);
  const disconnect = useSession((s) => s.disconnect);
  const setChainId = useSession((s) => s.setChainId);
  const prevStatus = useRef(status);

  const sessionAddress = data?.address ?? null;

  const endSession = () => {
    disconnect();
    void deleteSession().catch(() => undefined);
    qc.setQueryData(queryKeys.session, { address: null, role: null });
  };

  useEffect(() => {
    if (sessionAddress) connect(sessionAddress, chainId);
  }, [sessionAddress]);

  useEffect(() => {
    if (sessionAddress && chainId) setChainId(chainId);
  }, [chainId]);

  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (!sessionAddress) return;
    const switched = status === "connected" && address && address.toLowerCase() !== sessionAddress.toLowerCase();
    const dropped = was === "connected" && status === "disconnected";
    if (switched || dropped) {
      if (switched) disconnectWallet();
      endSession();
    }
  }, [status, address, sessionAddress]);

  return null;
}
