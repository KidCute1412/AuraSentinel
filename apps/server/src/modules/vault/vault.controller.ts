import { Address, problem } from '@agentshield/shared';
import { BadRequestException, Controller, Get, NotFoundException, Param, ServiceUnavailableException } from '@nestjs/common';
import { ChainUnavailableError, VaultNotFoundError, VaultService } from './vault.service';

@Controller('vaults/:safe')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  /** GET /vaults/{safe} (api.md #6). 404 until the module is enabled on the Safe (the wizard polls this). */
  @Get()
  vaultInfo(@Param('safe') rawSafe: string) {
    return this.run(rawSafe, (safe) => this.vault.getVault(safe));
  }

  /** GET /vaults/{safe}/state (api.md #7). */
  @Get('state')
  state(@Param('safe') rawSafe: string) {
    return this.run(rawSafe, (safe) => this.vault.getState(safe));
  }

  private async run<T>(rawSafe: string, fn: (safe: Address) => Promise<T>): Promise<T> {
    const safe = Address.safeParse(rawSafe);
    if (!safe.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Invalid vault address', rawSafe));
    try {
      return await fn(safe.data);
    } catch (e) {
      if (e instanceof VaultNotFoundError) throw new NotFoundException(problem('VAULT_NOT_FOUND', 'Vault not found', safe.data));
      if (e instanceof ChainUnavailableError) {
        throw new ServiceUnavailableException(problem('CHAIN_UNAVAILABLE', 'Chain unavailable', e.message));
      }
      throw e;
    }
  }
}
