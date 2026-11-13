import {
  CreateSessionRequest,
  problem,
  type GetSessionResponse,
  type NonceResponse,
  type SessionDto,
} from '@agentshield/shared';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/** SIWE sessions (api.md #1-4). Sessions are resources: create, read, delete. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** #1. POST (not GET): issuing a nonce has a side effect. */
  @Post('nonce')
  @HttpCode(201)
  async nonce(): Promise<NonceResponse> {
    const { nonce, expiresAt } = await this.auth.issueNonce();
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  /** #2. Verify the signed EIP-4361 message, set the httpOnly cookie. */
  @Post('session')
  @HttpCode(201)
  async create(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    const parsed = CreateSessionRequest.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ path: i.path.join('.') || 'body', message: i.message }));
      throw new BadRequestException(problem('VALIDATION_ERROR', 'Invalid sign-in request', undefined, { details }));
    }
    const address = await this.auth.verify(parsed.data.message, parsed.data.signature, req.get('host') ?? '');
    const expiresAt = this.sessions.issue(req, res, address);
    return this.auth.describe(address, expiresAt);
  }

  /** #3. Current session, or { address: null, role: null }. */
  @Get('session')
  async current(@Req() req: Request): Promise<GetSessionResponse> {
    const address = this.sessions.address(req);
    return address ? this.auth.describe(address) : { address: null, role: null };
  }

  /** #4. Sign out. Idempotent. */
  @Delete('session')
  @HttpCode(204)
  signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    this.sessions.clear(req, res);
  }
}
