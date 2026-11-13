import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { VaultRegistryService } from './vault-registry.service';
import { VaultController } from './vault.controller';
import { VaultsController } from './vaults.controller';
import { VaultService } from './vault.service';
import { VaultsRepository } from './vaults.repository';

@Module({
  imports: [PolicyModule],
  controllers: [VaultsController, VaultController],
  providers: [VaultService, VaultRegistryService, VaultsRepository],
  exports: [VaultService, VaultRegistryService],
})
export class VaultModule {}
