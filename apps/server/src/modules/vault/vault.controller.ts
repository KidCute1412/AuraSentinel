import { Controller, Get } from '@nestjs/common';
import { VaultService } from './vault.service';

@Controller()
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get('state')
  state() {
    return this.vault.getState();
  }
}
