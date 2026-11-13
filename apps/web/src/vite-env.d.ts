/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_FUJI_RPC_URL: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
  /** "live" = real API + SSE; anything else = in-browser simulation (shared/api/dataSource.ts). */
  readonly VITE_DATA_SOURCE?: string;
  /** Live mode, optional: the public demo Safe (same as SAFE_ADDRESS on the server); else found via GET /vaults. */
  readonly VITE_DEMO_SAFE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
