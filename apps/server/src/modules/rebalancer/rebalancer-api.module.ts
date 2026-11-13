import { Module } from '@nestjs/common';
import { WriteGuardModule } from '../write-guard/write-guard.module';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { PolicyModule } from '../policy/policy.module';
import { VaultModule } from '../vault/vault.module';
import { RebalancerController } from './rebalancer.controller';
import { RouterQuoteService } from './router-quote.service';

/** API process: POST /vaults/{safe}/jobs builds the intent and enqueues it (no processor, no scheduler). */
@Module({
  imports: [SwapQueueModule, PolicyModule, VaultModule, WriteGuardModule],
  controllers: [RebalancerController],
  providers: [RouterQuoteService],
})
export class RebalancerApiModule {}
