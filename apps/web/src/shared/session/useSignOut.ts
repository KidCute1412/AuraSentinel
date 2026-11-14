import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useDisconnectAll } from "@/shared/web3/useDisconnectAll";
import { deleteSession, queryKeys } from "@/shared/api";
import { isLive } from "@/shared/api/dataSource";
import { useSession } from "./sessionStore";

/**
 * Ends the visit. Live: deletes the server session (clears the cookie) and disconnects the wallet from this site,
 * so the next sign-in asks for the wallet's permission again. Mock: just forgets the simulated wallet.
 */
export function useSignOut(): () => void {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const disconnectWallet = useDisconnectAll();
  const disconnect = useSession((s) => s.disconnect);
  return () => {
    disconnect();
    if (isLive) {
      disconnectWallet();
      void deleteSession().catch(() => undefined);
      qc.setQueryData(queryKeys.session, { address: null, role: null });
    }
    navigate("/");
  };
}
