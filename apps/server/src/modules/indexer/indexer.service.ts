import { Injectable, Logger } from '@nestjs/common';
import { IndexerRepository } from './indexer.repository';

/**
 * TODO(FS1/FS2): poll getLogs every ~1s from chain_cursor, dispatch to handlers/
 * (guarded-swap, policy-set, policy-revoked), persist to chain_events, publish `chain.event` on the bus.
 * Events are an audit log only; never derive policy/spend state from them (invariant 1).
 */
@Injectable()
export class IndexerService {
  private readonly log = new Logger(IndexerService.name);

  constructor(private readonly repo: IndexerRepository) {}

  async pollOnce(): Promise<void> {
    const cursor = await this.repo.getCursor('policy-module');
    this.log.debug(`poll from block ${cursor ?? 'latest'}`);
  }
}
