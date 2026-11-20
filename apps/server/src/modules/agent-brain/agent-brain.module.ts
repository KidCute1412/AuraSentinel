import { Module } from '@nestjs/common';
import { LlmModule } from '../../core/llm/llm.module';
import { BrainService } from './brain.service';

/**
 * Hijacked Agent brain + Auto red-team attacker (red-team only). Loaded by both processes: the API writes the Auto
 * red-team prompts, the worker plans each run. No keys, no signing: it only produces untrusted plans.
 */
@Module({
  imports: [LlmModule],
  providers: [BrainService],
  exports: [BrainService],
})
export class AgentBrainModule {}
