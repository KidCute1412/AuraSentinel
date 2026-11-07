import { z } from 'zod';

export const Address = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v),
  'invalid address',
);
export type Address = z.infer<typeof Address>;
export const Hash = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v),
  'invalid hash',
);
export type Hash = z.infer<typeof Hash>;

export { avalancheFuji } from 'viem/chains';
export const AVALANCHE_FUJI_CHAIN_ID = 43113;
export const FUJI_EXPLORER = 'https://testnet.snowtrace.io';
export const explorerTxUrl = (hash: string) => `${FUJI_EXPLORER}/tx/${hash}`;
export const explorerAddressUrl = (addr: string) => `${FUJI_EXPLORER}/address/${addr}`;

export const TOKEN_DECIMALS = { USDC: 6, WAVAX: 18 } as const;
