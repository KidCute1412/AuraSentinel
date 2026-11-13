import type { ProofDto } from '@agentshield/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { getAddress, type Address } from 'viem';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { JobsService } from '../jobs/jobs.service';
import { TESTS_NOT_RUN, finalityStats, parseTestsArtifact } from './domain/proof';

const EXPLORER = 'https://testnet.snowtrace.io';
/** Snowtrace's Etherscan-compatible API (Routescan); public, no key needed on testnet. */
const VERIFY_API = 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api';
const CACHE_MS = 30_000;
const VERIFY_TTL_MS = 60 * 60_000;
const VERIFY_TIMEOUT_MS = 3_000;

/**
 * GET /proof (api.md #14). Everything is measured or read, nothing is sample data:
 * - contracts: addresses from env, `verified` asked from Snowtrace (cached 1 h, false on error);
 * - finality: broadcasting -> receipt of the agent's own transactions (from audit_log). The
 *   Kill-Switch latency is signed in the owner's browser, so only the web can time it (L7);
 * - tests: the L5 CI artifact, or "not run" while it does not exist;
 * - blockedTxs: jobs whose tx Shield 2 reverted on chain.
 */
@Injectable()
export class ProofService {
  private readonly log = new Logger(ProofService.name);
  private cached: { at: number; dto: Promise<ProofDto> } | undefined;
  private readonly verified = new Map<string, { at: number; ok: boolean }>();

  constructor(
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get(): Promise<ProofDto> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.dto;
    const dto = this.build();
    this.cached = { at: Date.now(), dto };
    dto.catch(() => (this.cached = undefined));
    return dto;
  }

  private async build(): Promise<ProofDto> {
    const [contracts, timings, reverted, tests] = await Promise.all([
      this.contracts(),
      this.jobs.txTimings(10),
      this.jobs.reverted(20),
      this.tests(),
    ]);
    return {
      network: { name: 'Avalanche Fuji', chainId: 43113 },
      contracts,
      finality: finalityStats(timings),
      tests,
      blockedTxs: reverted.flatMap((r) =>
        r.txHash
          ? [{ txHash: r.txHash, error: r.reasonCode ?? 'UNKNOWN_REVERT', at: r.at.toISOString(), explorerUrl: `${EXPLORER}/tx/${r.txHash}` }]
          : [],
      ),
    };
  }

  private async contracts(): Promise<ProofDto['contracts']> {
    const e = this.env;
    const list: [string, Address | undefined][] = [
      ['AgentPolicyModule', e.POLICY_MODULE_ADDRESS],
      ['AgentShieldFactory', e.FACTORY_ADDRESS],
      ['MockUSDC', e.TOKEN_A_ADDRESS],
      ['MockWAVAX', e.TOKEN_B_ADDRESS],
    ];
    const present = list.filter((c): c is [string, Address] => !!c[1]);
    return Promise.all(
      present.map(async ([name, address]) => ({
        name,
        address: getAddress(address),
        verified: await this.isVerified(address),
        explorerUrl: `${EXPLORER}/address/${getAddress(address)}`,
      })),
    );
  }

  /** Source code published on Snowtrace. Public addresses only; failures count as not verified. */
  private async isVerified(address: Address): Promise<boolean> {
    const key = address.toLowerCase();
    const hit = this.verified.get(key);
    if (hit && Date.now() - hit.at < VERIFY_TTL_MS) return hit.ok;
    let ok = false;
    try {
      const url = `${VERIFY_API}?module=contract&action=getsourcecode&address=${address}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
      const body = (await res.json()) as { result?: { SourceCode?: string }[] };
      ok = !!body.result?.[0]?.SourceCode;
      this.verified.set(key, { at: Date.now(), ok });
    } catch (err) {
      this.log.debug(`verify check for ${address} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return ok;
  }

  private async tests(): Promise<ProofDto['tests']> {
    try {
      return parseTestsArtifact(JSON.parse(await readFile(this.env.PROOF_TESTS_FILE, 'utf8')));
    } catch {
      return TESTS_NOT_RUN; // L5 has not produced the artifact yet
    }
  }
}
