import { FUJI_DEPLOYMENT, TOKEN_DECIMALS } from '@agentshield/shared';
import { unknownToken, type TokenInfo } from './checks';

/**
 * Symbol and decimals for the rule tables. The vault pair is USDC (tokenA) / WAVAX (tokenB): the configured addresses
 * win (a local fork may deploy its own), the Fuji deployment is the fallback. Anything else is shown by address.
 */
export function tokenInfoFor(tokens: { tokenA?: string; tokenB?: string } = {}): TokenInfo {
  const book = new Map<string, { symbol: string; decimals: number }>([
    [FUJI_DEPLOYMENT.usdc.toLowerCase(), { symbol: 'USDC', decimals: TOKEN_DECIMALS.USDC }],
    [FUJI_DEPLOYMENT.wavax.toLowerCase(), { symbol: 'WAVAX', decimals: TOKEN_DECIMALS.WAVAX }],
  ]);
  if (tokens.tokenA) book.set(tokens.tokenA.toLowerCase(), { symbol: 'USDC', decimals: TOKEN_DECIMALS.USDC });
  if (tokens.tokenB) book.set(tokens.tokenB.toLowerCase(), { symbol: 'WAVAX', decimals: TOKEN_DECIMALS.WAVAX });
  return (token) => book.get(token.toLowerCase()) ?? unknownToken(token);
}
