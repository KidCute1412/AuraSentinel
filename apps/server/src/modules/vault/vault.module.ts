import { Module } from '@nestjs/common';
import { VaultRegistryService } from './vault-registry.service';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({
  controllers: [VaultController],
  providers: [VaultService, VaultRegistryService],
  exports: [VaultService, VaultRegistryService],
})
export class VaultModule {}
