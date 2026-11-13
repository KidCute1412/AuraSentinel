import { Controller, Get } from '@nestjs/common';
import { VaultService } from './vault.service';

/** GET /vaults (api.md #5). Public: the registry holds no secret and no policy state. */
@Controller('vaults')
export class VaultsController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  list() {
    return this.vault.listVaults();
  }
}
