import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NonceStore } from './nonce.store';
import { OwnershipService } from './ownership.service';
import { SessionService } from './session.service';

/** API-only. SIWE sessions; exports what guards need (session address, on-chain ownership). */
@Module({
  imports: [VaultModule],
  controllers: [AuthController],
  providers: [AuthService, NonceStore, OwnershipService, SessionService, AdminGuard],
  exports: [SessionService, OwnershipService, AdminGuard],
})
export class AuthModule {}
