import { Injectable } from '@nestjs/common';
import { PolicyRepository } from './policy.repository';

@Injectable()
export class PolicyService {
  constructor(private readonly repo: PolicyRepository) {}

  /**
   * Chain is the source of truth (invariant 1): read AgentPolicyModule on-chain, fall back to the
   * last snapshot only when RPC is unavailable.
   * TODO(FS2): implement the contract read once ABIs exist in packages/shared.
   */
  async getCurrentPolicy(): Promise<unknown> {
    return this.repo.latest();
  }
}
