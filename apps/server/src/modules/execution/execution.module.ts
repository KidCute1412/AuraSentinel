import { Module } from '@nestjs/common';
import { FakeTxSender } from './adapters/fake.tx-sender';
import { TX_SENDER } from './tx-sender.port';

// Switch useClass to ViemTxSender once AGENT_PRIVATE_KEY and the module address are provisioned.
@Module({
  providers: [{ provide: TX_SENDER, useClass: FakeTxSender }],
  exports: [TX_SENDER],
})
export class ExecutionModule {}
