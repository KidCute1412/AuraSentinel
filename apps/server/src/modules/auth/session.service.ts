import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { SESSION_COOKIE, clearedSessionCookie, readCookie, sessionCookie, signSession, verifySession } from './session-token';

/** Reads and writes the session cookie. Holds only the HMAC key, never a wallet key. */
@Injectable()
export class SessionService {
  private readonly log = new Logger(SessionService.name);
  private readonly secret: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    // Production refuses to start without SESSION_SECRET (env.schema). Dev: sessions die on restart.
    this.secret = env.SESSION_SECRET ?? randomBytes(32).toString('hex');
    if (!env.SESSION_SECRET) this.log.warn('SESSION_SECRET not set: using a random key, sessions end on restart');
  }

  /** Lowercase address of a valid session, or null. */
  address(req: Request): string | null {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    return token ? (verifySession(token, this.secret)?.sub ?? null) : null;
  }

  /** Sets the cookie and returns its expiry. */
  issue(req: Request, res: Response, address: string): Date {
    const token = signSession(address, this.env.SESSION_TTL_S, this.secret);
    res.append('Set-Cookie', sessionCookie(token, this.env.SESSION_TTL_S, isHttps(req)));
    return new Date(Date.now() + this.env.SESSION_TTL_S * 1000);
  }

  clear(req: Request, res: Response) {
    res.append('Set-Cookie', clearedSessionCookie(isHttps(req)));
  }
}

const isHttps = (req: Request) => req.secure || req.headers['x-forwarded-proto'] === 'https';
