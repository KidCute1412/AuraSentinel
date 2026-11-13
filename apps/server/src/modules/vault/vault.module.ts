import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { VaultRegistryService } from './vault-registry.service';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({
  imports: [PolicyModule],
  controllers: [VaultController],
  providers: [VaultService, VaultRegistryService],
  exports: [VaultService, VaultRegistryService],
})
export class VaultModule {}
