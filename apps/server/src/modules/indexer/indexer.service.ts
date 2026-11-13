import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getAddress, type AbiEvent, type Address, type Hash, type Log, type PublicClient } from 'viem';
import { FACTORY_ABI, POLICY_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { EventBus } from '../../core/redis/event-bus';
import { SIMULATOR, type SimulatorPort } from '../simulation/simulator.port';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { jsonArgs, nextRange, toServerEvent, type DecodedLog } from './domain/indexer';
import { IndexerRepository } from './indexer.repository';

const CURSOR = 'indexer';
const MODULE_EVENTS = POLICY_MODULE_ABI.filter((x): x is Extract<(typeof POLICY_MODULE_ABI)[number], AbiEvent> => x.type === 'event');
const MODULE_DEPLOYED = FACTORY_ABI[0];

type DecodedChainLog = Log<bigint, number, false> & DecodedLog;

/**
 * Worker-only (A8). Polls eth_getLogs every INDEXER_POLL_MS from a persisted cursor:
 * 1. factory ModuleDeployed -> vault registry + `vault.registered` (wizard sees it in ~1 s);
 * 2. GuardedSwap / PolicySet / PolicyRevoked of every registered module -> chain_events +
 *    `chain.swap` / `chain.policy` / `chain.revoked` on the bus, and a fork refresh for the sim.
 *
 * Idempotent: chain_events is unique on (txHash, logIndex) and an event is published only when
 * its row is new, so re-reading a range (crash before the cursor moved) publishes nothing twice.
 * Events are an audit trail and a UI nudge only: policy and spend are always read from the
 * contract, never rebuilt from logs (P1).
 */
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(IndexerService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repo: IndexerRepository,
    private readonly registry: VaultRegistryService,
    private readonly bus: EventBus,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(SIMULATOR) private readonly simulator: SimulatorPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    if (!this.env.FACTORY_ADDRESS && !this.env.POLICY_MODULE_ADDRESS) {
      this.log.warn('Indexer off: neither FACTORY_ADDRESS nor POLICY_MODULE_ADDRESS is set');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.env.INDEXER_POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One poll cycle; catches up range by range. Never overlaps itself. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (await this.pollOnce()) {
        /* backlog: keep going */
      }
    } catch (e) {
      this.log.warn(`poll failed, retrying next tick: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = false;
    }
  }

  /** Indexes the next range. True when more blocks are waiting behind it. */
  async pollOnce(): Promise<boolean> {
    const head = await this.client.getBlockNumber();
    const range = nextRange(await this.repo.getCursor(CURSOR), head, this.env.INDEXER_START_BLOCK, this.env.INDEXER_MAX_SPAN);
    if (!range) return false;
    const { from: fromBlock, to: toBlock } = range;

    // 1. New vaults first, so their modules' events in this same range are picked up below.
    if (this.env.FACTORY_ADDRESS) {
      const logs = await this.client.getLogs({ address: this.env.FACTORY_ADDRESS, event: MODULE_DEPLOYED, fromBlock, toBlock, strict: true });
      for (const l of sorted(logs)) {
        const { safe, module, owner } = l.args;
        await this.store(l as DecodedChainLog);
        const isNew = await this.registry.register({ safe, module, owner, createdAtBlock: l.blockNumber });
        if (isNew) await this.publish(l as DecodedChainLog, safe);
      }
    }

    // 2. Module events of every known vault.
    const safeOf = await this.moduleIndex();
    let chainMoved = false;
    if (safeOf.size > 0) {
      const logs = await this.client.getLogs({ address: [...safeOf.keys()] as Address[], events: MODULE_EVENTS, fromBlock, toBlock, strict: true });
      for (const l of sorted(logs as DecodedChainLog[])) {
        const safe = safeOf.get(l.address.toLowerCase());
        if (!safe) continue;
        if (await this.store(l)) await this.publish(l, safe);
        chainMoved = true;
      }
    }
    // Our own swap, a Kill-Switch or a setPolicy: the sim fork must not lag behind it.
    if (chainMoved) this.simulator.invalidate?.();

    await this.repo.setCursor(CURSOR, toBlock);
    return toBlock < head;
  }

  /** module (lowercase) -> Safe, from the registry plus the env demo vault. */
  private async moduleIndex(): Promise<Map<string, Address>> {
    const map = new Map<string, Address>();
    for (const v of await this.registry.list()) map.set(v.module.toLowerCase(), getAddress(v.safe));
    return map;
  }

  private store(l: DecodedChainLog): Promise<boolean> {
    return this.repo.insertEvent({
      name: l.eventName,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      logIndex: l.logIndex,
      args: jsonArgs({ address: l.address, ...l.args }),
    });
  }

  private publish(l: DecodedChainLog, safe: Address) {
    return this.bus.publish(toServerEvent(l, safe, l.transactionHash as Hash));
  }
}

function sorted<T extends { blockNumber: bigint; logIndex: number }>(logs: readonly T[]): T[] {
  return [...logs].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}
