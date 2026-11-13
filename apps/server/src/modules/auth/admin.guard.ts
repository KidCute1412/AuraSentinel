import { problem } from '@agentshield/shared';
import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { OwnershipService } from './ownership.service';
import { SessionService } from './session.service';

/** /admin/* (api.md §9): a signed-in wallet from ADMIN_ADDRESSES. 401 signed out, 403 otherwise. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly ownership: OwnershipService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const address = this.sessions.address(ctx.switchToHttp().getRequest<Request>());
    if (!address) throw new UnauthorizedException(problem('UNAUTHENTICATED', 'Sign in with an admin wallet'));
    if (!this.ownership.isAdmin(address)) throw new ForbiddenException(problem('NOT_ADMIN', 'Admins only'));
    return true;
  }
}
