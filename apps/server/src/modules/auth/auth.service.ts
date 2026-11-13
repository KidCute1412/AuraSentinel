import { problem, type SessionDto } from '@agentshield/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { getAddress, verifyMessage, type Address, type Hex, type PublicClient } from 'viem';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { NonceStore } from './nonce.store';
import { OwnershipService } from './ownership.service';

const FUJI_CHAIN_ID = 43113;

const denied = (detail: string) => new UnauthorizedException(problem('UNAUTHENTICATED', 'Sign-in failed', detail));

/**
 * Sign-In With Ethereum (EIP-4361, api.md §3, D12). Only proves which address holds the wallet:
 * it grants no authority over funds (P2: policy and Kill-Switch are signed in the browser).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly nonces: NonceStore,
    private readonly ownership: OwnershipService,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  issueNonce() {
    return this.nonces.issue();
  }

  /**
   * Checks the message (domain, chain, validity window, single-use nonce) and the signature.
   * EOAs are verified offline; smart-contract wallets (EIP-1271/6492) through the chain.
   */
  async verify(message: string, signature: Hex, requestHost: string): Promise<Address> {
    let parsed: ReturnType<typeof parseSiweMessage>;
    try {
      parsed = parseSiweMessage(message);
    } catch {
      throw denied('Not a SIWE message');
    }
    const { address, domain, nonce, chainId } = parsed;
    if (!address || !domain || !nonce) throw denied('Incomplete SIWE message');

    const allowed = this.env.SIWE_DOMAINS.length > 0 ? this.env.SIWE_DOMAINS : [requestHost.toLowerCase()];
    if (!allowed.includes(domain.toLowerCase())) throw denied(`Message issued for ${domain}`);
    if (chainId !== FUJI_CHAIN_ID) throw denied('Wrong network: sign on Avalanche Fuji');
    if (!validateSiweMessage({ message: parsed, time: new Date() })) throw denied('Message expired or not yet valid');
    // Consumed before the signature check: a nonce never verifies twice, even under a race.
    if (!(await this.nonces.consume(nonce))) throw denied('Unknown or already used nonce');

    const ok =
      (await verifyMessage({ address, message, signature }).catch(() => false)) ||
      (await this.client.verifyMessage({ address, message, signature }).catch(() => false));
    if (!ok) throw denied('Signature does not match the address');
    return getAddress(address);
  }

  /** Role and vaults, recomputed from the allowlist and the chain (never stored in the token). */
  async describe(address: string, expiresAt?: Date): Promise<SessionDto> {
    const ownedVaults = await this.ownership.ownedVaults(address);
    const role = this.ownership.isAdmin(address) ? 'admin' : ownedVaults.length > 0 ? 'owner' : 'user';
    return {
      address: getAddress(address),
      role,
      ownedVaults,
      ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
    };
  }
}
