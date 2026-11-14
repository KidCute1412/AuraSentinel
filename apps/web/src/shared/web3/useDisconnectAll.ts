import { useConnections, useDisconnect } from "wagmi";

/**
 * Drops every wallet connection this site holds, not only the "current" one, and never throws.
 * wagmi's plain `disconnect()` ends one connector and returns before the wallet answers, so a quick
 * reconnect to the same wallet can still find the old connection and fail with ConnectorAlreadyConnectedError.
 */
export function useDisconnectAll(): () => void {
  const connections = useConnections();
  const { disconnectAsync } = useDisconnect();
  return () => {
    void Promise.allSettled(connections.map((c) => disconnectAsync({ connector: c.connector })));
  };
}
