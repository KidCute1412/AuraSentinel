import { PROBLEM_CONTENT_TYPE, problem } from '@agentshield/shared';
import { timingSafeEqual } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Express, NextFunction, Request, Response } from 'express';
import { ENV } from './core/config/config.module';
import type { Env } from './core/config/env.schema';
import { ProblemFilter } from './core/http/problem.filter';
import { OwnershipService } from './modules/auth/ownership.service';
import { SessionService } from './modules/auth/session.service';

/** Header names the web's Vercel proxy sets (apps/web/api/_proxy-core.ts). */
export const PROXY_SECRET_HEADER = 'x-agentshield-proxy';
export const CLIENT_IP_HEADER = 'x-agentshield-client-ip';

const sameSecret = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Requests relayed by the web's own Vercel proxy: with the right shared secret, `req.ip` becomes the visitor the proxy
 * saw (otherwise every visitor would share Vercel's address and one write limit), and the hop counts as HTTPS. Without
 * the secret the headers are dropped, so nobody can claim an IP by calling the server directly.
 */
export function trustWebProxy(secret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const given = req.headers[PROXY_SECRET_HEADER];
    const client = req.headers[CLIENT_IP_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    if (secret && typeof given === 'string' && typeof client === 'string' && client.length <= 64 && sameSecret(given, secret)) {
      Object.defineProperty(req, 'ip', { value: client, configurable: true });
      req.headers['x-forwarded-proto'] = 'https';
    }
    next();
  };
}

/** Helmet-equivalent headers for a JSON API (A9), without the dependency. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // JSON and SSE only: nothing here should ever render as a page.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

/**
 * HTTP setup shared by main.api.ts and the e2e test, so tests exercise the exact production
 * routing: every route under /api/v1 (api.md §1, the SPA owns bare paths) except the
 * unversioned health check, every error as problem+json, security headers, and CORS only for
 * the origins in CORS_ORIGINS (prod is same-origin behind nginx, so none by default).
 */
export function configureApi(app: INestApplication, opts: { corsOrigins?: readonly string[] } = {}): INestApplication {
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // Behind nginx (compose) or the Vite proxy: trust private-network hops so req.ip is the real
  // client, which the per-IP write limit depends on. Public addresses are never trusted.
  express.set('trust proxy', 'loopback, linklocal, uniquelocal');
  // Behind the web's Vercel proxy (public IPs): only with the shared secret, see trustWebProxy.
  app.use(trustWebProxy(app.get<Env>(ENV, { strict: false })?.WEB_PROXY_SECRET));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    next();
  });

  // Bull Board (job retry/delete/clean) is an Express app mounted by its own module, and it ends
  // up under the global prefix (/api/v1/admin/queues), which nginx proxies. Guard every path it
  // can answer on, here, before it registers: admins only.
  const sessions = app.get(SessionService, { strict: false });
  const ownership = app.get(OwnershipService, { strict: false });
  app.use(['/admin/queues', '/api/v1/admin/queues'], (req: Request, res: Response, next: NextFunction) => {
    const address = sessions.address(req);
    if (address && ownership.isAdmin(address)) return next();
    const p = address ? problem('NOT_ADMIN', 'Admins only') : problem('UNAUTHENTICATED', 'Sign in with an admin wallet');
    res.status(p.status).type(PROBLEM_CONTENT_TYPE).json(p);
  });

  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalFilters(new ProblemFilter());
  if (opts.corsOrigins?.length) {
    app.enableCors({ origin: [...opts.corsOrigins], credentials: true, exposedHeaders: ['Location', 'Retry-After'] });
  }
  return app;
}
